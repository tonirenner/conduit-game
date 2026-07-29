import * as THREE from 'three';

export type TerrainSample = {
	height: number;
	landMask: number;
	continent: number;
	mountainMask: number;
};

export type TerrainProfileKind =
	| 'barren'
	| 'rocky'
	| 'earthlike'
	| 'oceanic'
	| 'desert'
	| 'toxic'
	| 'carbon'
	| 'metallic';

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
	continentScale: number;
	coastScale: number;
	mountainScale: number;
	heightScale: number;
	oceanBias: number;
};

export const DEFAULT_TERRAIN_SEED_CONFIG: TerrainSeedConfig =
	             createTerrainSeedConfig(1);

export function createTerrainSeedConfig(
	seed: number,
	profile: TerrainProfileKind = 'earthlike',
): TerrainSeedConfig {
	const random = mulberry32(seed >>> 0 || 1);
	const profileSettings = getTerrainProfileSettings(profile);

	const offset = (scale: number) => new THREE.Vector3(
		(random() * 2 - 1) * scale,
		(random() * 2 - 1) * scale,
		(random() * 2 - 1) * scale,
	);

	return {
		seed: seed >>> 0 || 1,
		profile,
		continentOffset: offset(240.0),
		ridgeOffset: offset(320.0),
		detailOffset: offset(420.0),

		continentScale:
			lerp(0.88, 1.28, random()) *
			profileSettings.continentScale,
		coastScale:
			lerp(0.75, 1.35, random()) *
			profileSettings.coastScale,
		mountainScale:
			lerp(0.74, 1.42, random()) *
			profileSettings.mountainScale,
		heightScale:
			lerp(0.82, 1.24, random()) *
			profileSettings.heightScale,

		/**
		 * Positive value -> more ocean.
		 * Negative value -> more land.
		 */
		oceanBias:
			lerp(-0.055, 0.065, random()) +
			profileSettings.oceanBias,
	};
}

export function getTerrainProfileSettings(
	profile: TerrainProfileKind,
): TerrainProfileSettings {
	switch (profile) {
		case 'oceanic':
			return {
				continentScale: 1.34,
				coastScale: 1.46,
				mountainScale: 0.46,
				heightScale: 0.48,
				oceanBias: 0.205,
			};

		case 'desert':
			return {
				continentScale: 0.82,
				coastScale: 0.54,
				mountainScale: 0.66,
				heightScale: 0.58,
				oceanBias: -0.175,
			};

		case 'barren':
			return {
				continentScale: 0.92,
				coastScale: 0.42,
				mountainScale: 1.34,
				heightScale: 1.22,
				oceanBias: -0.155,
			};

		case 'rocky':
			return {
				continentScale: 1.02,
				coastScale: 0.58,
				mountainScale: 1.26,
				heightScale: 1.14,
				oceanBias: -0.105,
			};

		case 'toxic':
			return {
				continentScale: 0.86,
				coastScale: 0.50,
				mountainScale: 0.58,
				heightScale: 0.56,
				oceanBias: -0.165,
			};

		case 'carbon':
			return {
				continentScale: 0.92,
				coastScale: 0.42,
				mountainScale: 1.02,
				heightScale: 0.86,
				oceanBias: -0.155,
			};

		case 'metallic':
			return {
				continentScale: 1.00,
				coastScale: 0.46,
				mountainScale: 1.48,
				heightScale: 1.04,
				oceanBias: -0.135,
			};

		case 'earthlike':
		default:
			return {
				continentScale: 1.0,
				coastScale: 1.0,
				mountainScale: 1.0,
				heightScale: 1.0,
				oceanBias: 0.0,
			};
	}
}

export function getTerrainSample(
	normal: THREE.Vector3,
	config: TerrainSeedConfig = DEFAULT_TERRAIN_SEED_CONFIG,
): TerrainSample {
	const seededContinent = normal
		.clone()
		.multiplyScalar(config.continentScale)
		.add(config.continentOffset);

	const continentBase = fbm(
		seededContinent.clone().multiplyScalar(1.25),
		6,
	);

	const coastNoise =
		      (
			      fbm(
				      normal
					      .clone()
					      .multiplyScalar(config.coastScale * 2.4)
					      .add(config.continentOffset),
				      5,
			      ) - 0.5
		      ) * 0.045;

	const continent =
		      continentBase +
		      coastNoise -
		      config.oceanBias;

	const landMask = smoothstep(
		0.525,
		0.585,
		continent,
	);

	const highlands = Math.max(
		0,
		continent - 0.54,
	);

	const mountainMask =
		      smoothstep(
			      0.62,
			      0.78,
			      continent,
		      ) * landMask;

	const ridgeNormal = normal
		.clone()
		.multiplyScalar(config.mountainScale)
		.add(config.ridgeOffset);

	const ridgeLarge = ridgedFbm(
		ridgeNormal.clone().multiplyScalar(3.8),
		5,
	);

	const ridgeMedium = ridgedFbm(
		ridgeNormal.clone().multiplyScalar(8.5),
		5,
	);

	const ridgeFine = ridgedFbm(
		ridgeNormal.clone().multiplyScalar(18.0),
		4,
	);

	const mountainChains =
		      smoothstep(
			      0.46,
			      0.84,
			      ridgeLarge,
		      ) *
		      (
			      ridgeMedium * 0.72 +
			      ridgeFine * 0.28
		      );

	const sharpPeaks = Math.pow(
		clamp(
			mountainChains,
			0,
			1,
		),
		1.75,
	);

	const mountains =
		      sharpPeaks *
		      mountainMask;

	const foothills =
		      smoothstep(
			      0.48,
			      0.74,
			      ridgeLarge,
		      ) *
		      mountainMask *
		      0.45;

	const detail =
		      (
			      fbm(
				      normal
					      .clone()
					      .multiplyScalar(24.0)
					      .add(config.detailOffset),
				      4,
			      ) - 0.5
		      ) *
		      0.010 *
		      landMask;

	const height =
		      (
			      landMask * 0.006 +
			      highlands * 0.095 +
			      foothills * 0.055 +
			      mountains * 0.165 +
			      detail
		      ) *
		      config.heightScale;

	return {
		height: Math.max(0, height),
		landMask,
		continent,
		mountainMask,
	};
}

export function fbm(
	position: THREE.Vector3,
	octaves: number,
): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1.0;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		value += noise3d(
		         position.x * frequency,
		         position.y * frequency,
		         position.z * frequency,
		) * amplitude;

		normalizer += amplitude;
		frequency *= 2.0;
		amplitude *= 0.5;
	}

	return value / normalizer;
}

export function ridgedFbm(
	position: THREE.Vector3,
	octaves: number,
): number {
	let value = 0;
	let amplitude = 0.52;
	let frequency = 1.0;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		const noiseValue = noise3d(
			position.x * frequency,
			position.y * frequency,
			position.z * frequency,
		);

		const ridge = 1.0 - Math.abs(
		              noiseValue * 2.0 - 1.0,
		);

		value += ridge * ridge * amplitude;

		normalizer += amplitude;
		frequency *= 2.15;
		amplitude *= 0.48;
	}

	return value / normalizer;
}

export function noise3d(
	x: number,
	y: number,
	z: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = smoothFraction(x - ix);
	const fy = smoothFraction(y - iy);
	const fz = smoothFraction(z - iz);

	const v000 = hash3(ix, iy, iz);
	const v100 = hash3(ix + 1, iy, iz);
	const v010 = hash3(ix, iy + 1, iz);
	const v110 = hash3(ix + 1, iy + 1, iz);

	const v001 = hash3(ix, iy, iz + 1);
	const v101 = hash3(ix + 1, iy, iz + 1);
	const v011 = hash3(ix, iy + 1, iz + 1);
	const v111 = hash3(ix + 1, iy + 1, iz + 1);

	const x00 = lerp(v000, v100, fx);
	const x10 = lerp(v010, v110, fx);
	const x01 = lerp(v001, v101, fx);
	const x11 = lerp(v011, v111, fx);

	const y0 = lerp(x00, x10, fy);
	const y1 = lerp(x01, x11, fy);

	return lerp(y0, y1, fz);
}

export function smoothstep(
	edge0: number,
	edge1: number,
	value: number,
): number {
	const t = clamp(
		(value - edge0) / (edge1 - edge0),
		0,
		1,
	);

	return t * t * (3 - 2 * t);
}

function smoothFraction(value: number): number {
	return value * value * (3 - 2 * value);
}

function hash3(
	x: number,
	y: number,
	z: number,
): number {
	const dot =
		      x * 127.1 +
		      y * 311.7 +
		      z * 74.7;

	return fract(
		Math.sin(dot) *
		43758.5453123,
	);
}

function fract(value: number): number {
	return value - Math.floor(value);
}

function clamp(
	value: number,
	min: number,
	max: number,
): number {
	return Math.min(
		max,
		Math.max(
			min,
			value,
		),
	);
}

function lerp(
	a: number,
	b: number,
	t: number,
): number {
	return a + (b - a) * t;
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state += 0x6d2b79f5;

		let t = state;

		t = Math.imul(
			t ^ (t >>> 15),
			t | 1,
		);

		t ^= t + Math.imul(
			t ^ (t >>> 7),
			t | 61,
		);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
