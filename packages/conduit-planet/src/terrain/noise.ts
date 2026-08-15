import * as THREE from 'three';
import { createMulberry32 } from '../internal/DeterministicRandom';
import { clamp, lerp, smoothstep, valueNoise3D } from '../internal/ProceduralMath';

export { smoothstep } from '../internal/ProceduralMath';

export type TerrainSample = {
	height: number;
	landMask: number;
	continent: number;
	mountainMask: number;
	erosionMask: number;
	riverMask: number;
};

export type TerrainProfileKind =
	| 'barren' | 'rocky' | 'earthlike' | 'oceanic' | 'ice'
	| 'desert' | 'lava' | 'toxic' | 'carbon' | 'metallic';

export type TerrainProfileSettings = {
	continentScale: number;
	coastScale: number;
	mountainScale: number;
	heightScale: number;
	oceanBias: number;
};

export type TerrainSeedConfig = {
	seed: number;
	profile: TerrainProfileKind;
	continentOffset: THREE.Vector3;
	ridgeOffset: THREE.Vector3;
	detailOffset: THREE.Vector3;
	erosionOffset: THREE.Vector3;
	riverOffset: THREE.Vector3;
	continentScale: number;
	coastScale: number;
	mountainScale: number;
	heightScale: number;
	oceanBias: number;
};

export const DEFAULT_TERRAIN_SEED_CONFIG: TerrainSeedConfig = createTerrainSeedConfig(1);

export function createTerrainSeedConfig(
	seed: number,
	profile: TerrainProfileKind = 'earthlike',
): TerrainSeedConfig {
	const random = createMulberry32(seed >>> 0 || 1);
	const profileSettings = getTerrainProfileSettings(profile);
	const offset = (scale: number) => new THREE.Vector3(
		(random() * 2 - 1) * scale,
		(random() * 2 - 1) * scale,
		(random() * 2 - 1) * scale,
	);

	return {
		seed: seed >>> 0 || 1,
		profile,
		continentOffset: offset(240),
		ridgeOffset: offset(320),
		detailOffset: offset(420),
		erosionOffset: offset(520),
		riverOffset: offset(620),
		continentScale: lerp(0.88, 1.28, random()) * profileSettings.continentScale,
		coastScale: lerp(0.75, 1.35, random()) * profileSettings.coastScale,
		mountainScale: lerp(0.74, 1.42, random()) * profileSettings.mountainScale,
		heightScale: lerp(0.82, 1.24, random()) * profileSettings.heightScale,
		oceanBias: lerp(-0.055, 0.065, random()) + profileSettings.oceanBias,
	};
}

export function getTerrainProfileSettings(profile: TerrainProfileKind): TerrainProfileSettings {
	switch (profile) {
		case 'oceanic': return { continentScale: 1.34, coastScale: 1.46, mountainScale: 0.46, heightScale: 0.48, oceanBias: 0.205 };
		case 'ice': return { continentScale: 0.78, coastScale: 0.34, mountainScale: 0.82, heightScale: 0.58, oceanBias: -0.245 };
		case 'desert': return { continentScale: 0.82, coastScale: 0.54, mountainScale: 0.66, heightScale: 0.58, oceanBias: -0.175 };
		case 'lava': return { continentScale: 0.70, coastScale: 0.32, mountainScale: 1.42, heightScale: 1.12, oceanBias: -0.36 };
		case 'barren': return { continentScale: 0.92, coastScale: 0.42, mountainScale: 1.34, heightScale: 1.22, oceanBias: -0.155 };
		case 'rocky': return { continentScale: 1.02, coastScale: 0.58, mountainScale: 1.26, heightScale: 1.14, oceanBias: -0.105 };
		case 'toxic': return { continentScale: 0.86, coastScale: 0.50, mountainScale: 0.58, heightScale: 0.56, oceanBias: -0.165 };
		case 'carbon': return { continentScale: 0.92, coastScale: 0.42, mountainScale: 1.02, heightScale: 0.86, oceanBias: -0.155 };
		case 'metallic': return { continentScale: 1.00, coastScale: 0.46, mountainScale: 1.48, heightScale: 1.04, oceanBias: -0.135 };
		case 'earthlike':
		default: return { continentScale: 1, coastScale: 1, mountainScale: 1, heightScale: 1, oceanBias: 0 };
	}
}

export function getTerrainSample(
	normal: THREE.Vector3,
	config: TerrainSeedConfig = DEFAULT_TERRAIN_SEED_CONFIG,
): TerrainSample {
	const seededContinent = normal.clone().multiplyScalar(config.continentScale).add(config.continentOffset);
	const continentBase = fbm(seededContinent.clone().multiplyScalar(1.25), 6);
	const coastNoise = (fbm(
		normal.clone().multiplyScalar(config.coastScale * 2.4).add(config.continentOffset),
		5,
	) - 0.5) * 0.045;
	const continent = continentBase + coastNoise - config.oceanBias;
	const landMask = smoothstep(0.525, 0.585, continent);
	const highlands = Math.max(0, continent - 0.54);
	const mountainMask = smoothstep(0.62, 0.78, continent) * landMask;

	const ridgeNormal = normal.clone().multiplyScalar(config.mountainScale).add(config.ridgeOffset);
	const ridgeLarge = ridgedFbm(ridgeNormal.clone().multiplyScalar(3.8), 5);
	const ridgeMedium = ridgedFbm(ridgeNormal.clone().multiplyScalar(8.5), 5);
	const ridgeFine = ridgedFbm(ridgeNormal.clone().multiplyScalar(18), 4);
	const mountainChains = smoothstep(0.46, 0.84, ridgeLarge) * (ridgeMedium * 0.72 + ridgeFine * 0.28);

	const erosionNoise = fbm(normal.clone().multiplyScalar(5.8).add(config.erosionOffset), 4);
	const erosionMask = smoothstep(0.24, 0.82, erosionNoise);
	const erosionShape = lerp(0.58, 1.18, erosionMask);
	const sharpPeaks = Math.pow(
		clamp(mountainChains * erosionShape, 0, 1),
		lerp(2.15, 1.45, erosionMask),
	);
	const mountains = sharpPeaks * mountainMask;
	const foothills = smoothstep(0.48, 0.74, ridgeLarge) * mountainMask * lerp(0.30, 0.52, erosionMask);

	const riverNoise = fbm(normal.clone().multiplyScalar(11.5).add(config.riverOffset), 4);
	const riverDistance = Math.abs(riverNoise - 0.5);
	const riverLines = 1 - smoothstep(0.018, 0.075, riverDistance);
	const lowlandMask = 1 - smoothstep(0.04, 0.14, highlands);
	const riverMask = riverLines * landMask * lerp(1, 0.28, mountainMask) * lerp(0.55, 1, lowlandMask);

	const basinNoise = fbm(normal.clone().multiplyScalar(3.2).add(config.erosionOffset), 3);
	const basinMask = smoothstep(0.34, 0.66, basinNoise) * landMask;
	const detail = (fbm(normal.clone().multiplyScalar(24).add(config.detailOffset), 4) - 0.5) * 0.010 * landMask;

	// Meso terrain bridges planetary/regional landforms and the local SurfaceView.
	// Its frequencies intentionally sit much higher than the old continent/ridge
	// layers so 20-300 km hills, basins and ridges are already visible during the
	// atmospheric approach instead of appearing only in the final few kilometres.
	const mesoProfileStrength = getMesoReliefStrength(config.profile);
	const mesoReliefMask = landMask * lerp(
		0.72,
		1.38,
		clamp(mountainMask * 0.62 + erosionMask * 0.38, 0, 1),
	);
	const mesoRolling = (
		fbm(
			normal.clone()
				.multiplyScalar(170)
				.add(config.erosionOffset.clone().multiplyScalar(0.31)),
			4,
		) - 0.5
	) * 0.034 * mesoReliefMask * mesoProfileStrength;
	const mesoRidgeNoise = ridgedFbm(
		normal.clone()
			.multiplyScalar(420)
			.add(config.ridgeOffset.clone().multiplyScalar(0.23)),
		4,
	);
	const mesoRidges = Math.pow(
		smoothstep(0.40, 0.82, mesoRidgeNoise),
		1.45,
	) * 0.032 * mesoReliefMask * lerp(0.72, 1.22, mountainMask) * mesoProfileStrength;
	const mesoValleyNoise = fbm(
		normal.clone()
			.multiplyScalar(300)
			.add(config.riverOffset.clone().multiplyScalar(0.19)),
		3,
	);
	const mesoValleys = smoothstep(0.33, 0.66, mesoValleyNoise)
		* (1 - mountainMask * 0.55)
		* 0.012
		* landMask
		* mesoProfileStrength;

	// Canonical smaller-scale relief. Surface resolves this directly while all
	// other views still sample the exact same deterministic height field.
	const localDetailStrength = lerp(
		0.68,
		1.32,
		clamp(mountainMask * 0.58 + erosionMask * 0.42, 0, 1),
	);
	const localDetail = (
		fbm(
			normal.clone()
				.multiplyScalar(900)
				.add(config.detailOffset.clone().multiplyScalar(1.73)),
		4,
		) - 0.5
	) * 0.012 * landMask * localDetailStrength;

	const baseHeight =
		landMask * 0.006 +
		highlands * 0.095 +
		foothills * 0.055 +
		mountains * 0.165 +
		detail +
		mesoRolling +
		mesoRidges +
		localDetail;
	const erosionCut = riverMask * (0.010 + 0.018 * basinMask) * lerp(0.72, 1.15, erosionMask);
	const broadValleys = basinMask * (1 - mountainMask) * 0.0065;
	const height = Math.max(
		0,
		(baseHeight - erosionCut - broadValleys - mesoValleys) * config.heightScale,
	);

	return { height, landMask, continent, mountainMask, erosionMask, riverMask };
}

function getMesoReliefStrength(profile: TerrainProfileKind): number {
	switch (profile) {
		case 'oceanic': return 0.72;
		case 'ice': return 0.86;
		case 'desert': return 1.18;
		case 'lava': return 1.32;
		case 'barren': return 1.28;
		case 'rocky': return 1.24;
		case 'toxic': return 0.88;
		case 'carbon': return 1.08;
		case 'metallic': return 1.30;
		case 'earthlike':
		default: return 1;
	}
}

export function fbm(position: THREE.Vector3, octaves: number): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;
	for (let i = 0; i < octaves; i++) {
		value += noise3d(position.x * frequency, position.y * frequency, position.z * frequency) * amplitude;
		normalizer += amplitude;
		frequency *= 2;
		amplitude *= 0.5;
	}
	return value / normalizer;
}

export function ridgedFbm(position: THREE.Vector3, octaves: number): number {
	let value = 0;
	let amplitude = 0.52;
	let frequency = 1;
	let normalizer = 0;
	for (let i = 0; i < octaves; i++) {
		const noiseValue = noise3d(position.x * frequency, position.y * frequency, position.z * frequency);
		const ridge = 1 - Math.abs(noiseValue * 2 - 1);
		value += ridge * ridge * amplitude;
		normalizer += amplitude;
		frequency *= 2.15;
		amplitude *= 0.48;
	}
	return value / normalizer;
}

export function noise3d(x: number, y: number, z: number): number {
	return valueNoise3D(x, y, z);
}
