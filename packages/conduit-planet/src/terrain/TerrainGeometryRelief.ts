import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../internal/ProceduralMath';
import {
	fbm,
	ridgedFbm,
	type TerrainProfileKind,
	type TerrainSample,
	type TerrainSeedConfig,
} from './noise';

/**
 * Geometry-only relief layered on top of the canonical terrain sample.
 *
 * This deliberately does not modify TerrainSample.height. Climate, biome,
 * coastline and the low-frequency OrbitView LUT keep using the canonical
 * terrain semantics, while Regional/Surface/landing can share additional
 * physical relief at scales that are only meaningful near the planet.
 *
 * terrainRoughness controls only the existing meso/local geometry layer.
 * hasTectonics enables a separate deterministic ridge/fault contribution so
 * the two PlanetDefinition values keep independent physical responsibilities.
 * Both remain separate from mountainScale (macro elevation) and from PBR
 * material roughness.
 */
export function getTerrainGeometryReliefRawHeight(
	normal: THREE.Vector3,
	terrain: TerrainSample,
	config: TerrainSeedConfig,
	terrainRoughness = 1,
	hasTectonics = false,
): number {
	if (terrain.landMask <= 0.001) return 0;

	const roughnessStrength = clamp(terrainRoughness, 0, 1);
	const mesoProfileStrength = getMesoReliefStrength(config.profile);
	const mesoReliefMask = terrain.landMask * lerp(
		0.72,
		1.38,
		clamp(terrain.mountainMask * 0.62 + terrain.erosionMask * 0.38, 0, 1),
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
	) * 0.032 * mesoReliefMask * lerp(0.72, 1.22, terrain.mountainMask) * mesoProfileStrength;

	const mesoValleyNoise = fbm(
		normal.clone()
			.multiplyScalar(300)
			.add(config.riverOffset.clone().multiplyScalar(0.19)),
		3,
	);
	const mesoValleys = smoothstep(0.33, 0.66, mesoValleyNoise)
		* (1 - terrain.mountainMask * 0.55)
		* 0.012
		* terrain.landMask
		* mesoProfileStrength;

	const localDetailStrength = lerp(
		0.68,
		1.32,
		clamp(terrain.mountainMask * 0.58 + terrain.erosionMask * 0.42, 0, 1),
	);
	const localDetail = (
		fbm(
			normal.clone()
				.multiplyScalar(900)
				.add(config.detailOffset.clone().multiplyScalar(1.73)),
			4,
		) - 0.5
	) * 0.012 * terrain.landMask * localDetailStrength;

	const roughnessRelief = (
		mesoRolling +
		mesoRidges -
		mesoValleys +
		localDetail
	) * roughnessStrength;

	const tectonicRelief = hasTectonics
		? getTectonicReliefRawHeight(normal, terrain, config, mesoProfileStrength)
		: 0;

	return (roughnessRelief + tectonicRelief) * config.heightScale;
}

/**
 * Deterministic geometry-only tectonic contribution.
 *
 * Low-frequency plate noise creates narrow boundary bands. A second ridged
 * field gives those boundaries an uplifted/faulted character while a signed
 * side field allows modest local uplift/subsidence variation. The contribution
 * is land-bound and deliberately leaves the canonical TerrainSample masks and
 * climate inputs unchanged.
 */
function getTectonicReliefRawHeight(
	normal: THREE.Vector3,
	terrain: TerrainSample,
	config: TerrainSeedConfig,
	profileStrength: number,
): number {
	const plateField = fbm(
		normal.clone()
			.multiplyScalar(26)
			.add(config.ridgeOffset.clone().multiplyScalar(0.071)),
		3,
	);
	const boundaryDistance = Math.abs(plateField - 0.5);
	const boundaryBand = 1 - smoothstep(0.055, 0.24, boundaryDistance);

	const faultRidges = ridgedFbm(
		normal.clone()
			.multiplyScalar(92)
			.add(config.erosionOffset.clone().multiplyScalar(0.113)),
		3,
	);
	const faultSide = fbm(
		normal.clone()
			.multiplyScalar(48)
			.add(config.riverOffset.clone().multiplyScalar(0.097)),
		2,
	) - 0.5;

	const uplift = boundaryBand
		* lerp(0.36, 1, faultRidges)
		* 0.026;
	const offset = boundaryBand
		* faultSide
		* 0.012;
	const terrainMask = terrain.landMask
		* lerp(0.68, 1.18, terrain.mountainMask)
		* lerp(0.88, 1.12, terrain.erosionMask);

	return (uplift + offset)
		* terrainMask
		* lerp(0.82, 1.12, clamp(profileStrength, 0.7, 1.4));
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
