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
 */
export function getTerrainGeometryReliefRawHeight(
	normal: THREE.Vector3,
	terrain: TerrainSample,
	config: TerrainSeedConfig,
): number {
	if (terrain.landMask <= 0.001) return 0;

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

	return (
		mesoRolling +
		mesoRidges -
		mesoValleys +
		localDetail
	) * config.heightScale;
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
