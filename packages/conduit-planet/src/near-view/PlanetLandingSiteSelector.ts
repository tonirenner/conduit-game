import * as THREE from 'three';
import type { PlanetClass } from '../model';
import type { PlanetTerrainSampler } from './PlanetTerrainSampler';

export type PlanetLandingSite = {
	direction: THREE.Vector3;
	latitudeDegrees: number;
	slopeDegrees: number;
	biome: string;
	score: number;
};

const COLD_BIOMES = new Set(['ice', 'snow', 'tundra']);

export function selectPlanetLandingSite(
	sampler: PlanetTerrainSampler,
	candidateCount = 512,
): PlanetLandingSite {
	let best: PlanetLandingSite | null = null;

	for (let index = 0; index < candidateCount; index++) {
		const y = 1 - ((index + 0.5) / candidateCount) * 2;
		const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y));
		const angle = index * Math.PI * (3 - Math.sqrt(5));
		const direction = new THREE.Vector3(
			Math.cos(angle) * horizontalRadius,
			y,
			Math.sin(angle) * horizontalRadius,
		);
		const sample = sampler.sample(direction);

		if (sample.isWater) continue;

		const slopeDegrees = THREE.MathUtils.radToDeg(
			Math.acos(THREE.MathUtils.clamp(
				sample.normal.dot(direction),
				-1,
				1,
			)),
		);

		if (slopeDegrees > 12) continue;

		const latitudeDegrees = THREE.MathUtils.radToDeg(Math.asin(y));
		const latitudeAbs = Math.abs(latitudeDegrees);
		const latitudeScore = 1 - Math.min(1, Math.abs(latitudeAbs - 32) / 58);
		const biomeScore = getBiomeScore(
			sampler.definition.class,
			sample.biome,
		);
		const score =
			latitudeScore * 0.48 +
			biomeScore * 0.34 +
			(1 - slopeDegrees / 12) * 0.18;
		const candidate = {
			direction,
			latitudeDegrees,
			slopeDegrees,
			biome: sample.biome,
			score,
		};

		if (!best || candidate.score > best.score) best = candidate;
	}

	if (!best) {
		throw new Error(
			`No landable site found for planet ${sampler.definition.id}.`,
		);
	}

	return best;
}

function getBiomeScore(
	planetClass: PlanetClass,
	biome: string,
): number {
	if (planetClass === 'ice') {
		return COLD_BIOMES.has(biome) ? 1 : 0.35;
	}

	if (COLD_BIOMES.has(biome)) return 0.05;

	if (planetClass === 'desert') {
		return biome === 'desert' || biome === 'dryHills' ? 1 : 0.42;
	}

	if (planetClass === 'lava') {
		return biome === 'mountain' || biome === 'dryHills' ? 1 : 0.55;
	}

	if (
		biome === 'grassland' ||
		biome === 'temperateForest' ||
		biome === 'savanna' ||
		biome === 'coast'
	) {
		return 1;
	}

	return 0.62;
}
