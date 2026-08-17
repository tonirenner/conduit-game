import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';
import { getTerrainGeometryReliefRawHeight } from '../src/terrain/TerrainGeometryRelief';
import { createTerrainSeedConfig, type TerrainSample } from '../src/terrain/noise';

const terrain: TerrainSample = {
	height: 0.18,
	landMask: 0.92,
	continent: 0.74,
	mountainMask: 0.61,
	erosionMask: 0.47,
	riverMask: 0.11,
};
const config = createTerrainSeedConfig(8128, 'earthlike');

describe('surface.hasTectonics migration', () => {
	test('adds deterministic ridge/fault relief only when enabled', () => {
		let largestDifference = 0;

		for (const direction of sampleDirections(96)) {
			const withoutTectonics = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0.65,
				false,
			);
			const withTectonics = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0.65,
				true,
			);
			const repeated = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0.65,
				true,
			);

			expect(repeated).toBe(withTectonics);
			largestDifference = Math.max(
				largestDifference,
				Math.abs(withTectonics - withoutTectonics),
			);
		}

		expect(largestDifference).toBeGreaterThan(1e-6);
	});

	test('keeps tectonics independent from terrain roughness', () => {
		let largestTectonicRelief = 0;

		for (const direction of sampleDirections(96)) {
			const smoothWithoutTectonics = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0,
				false,
			);
			const smoothWithTectonics = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0,
				true,
			);

			expect(smoothWithoutTectonics).toBe(0);
			largestTectonicRelief = Math.max(
				largestTectonicRelief,
				Math.abs(smoothWithTectonics),
			);
		}

		expect(largestTectonicRelief).toBeGreaterThan(1e-6);
	});

	test('changes only geometry while canonical terrain and biome inputs stay stable', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Tectonics Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const inactiveDefinition = structuredClone(base);
		const activeDefinition = structuredClone(base);
		inactiveDefinition.surface.hasTectonics = false;
		activeDefinition.surface.hasTectonics = true;

		const inactiveSampler = new PlanetTerrainSampler(inactiveDefinition);
		const activeSampler = new PlanetTerrainSampler(activeDefinition);
		let foundGeometryDifference = false;

		expect(inactiveSampler.hasTectonics).toBe(false);
		expect(activeSampler.hasTectonics).toBe(true);

		for (const direction of sampleDirections(64)) {
			const inactive = inactiveSampler.sample(direction, false);
			const active = activeSampler.sample(direction, false);

			expect(inactive.rawTerrain).toEqual(active.rawTerrain);
			expect(inactive.landMask).toBe(active.landMask);
			expect(inactive.isWater).toBe(active.isWater);
			expect(inactive.biome).toBe(active.biome);
			expect(inactive.climate).toEqual(active.climate);

			if (
				Math.abs(
					inactive.geometryReliefRawHeight - active.geometryReliefRawHeight,
				) > 1e-6
			) {
				foundGeometryDifference = true;
			}
		}

		expect(foundGeometryDifference).toBe(true);
	});
});

function sampleDirections(count: number): THREE.Vector3[] {
	const directions: THREE.Vector3[] = [];
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));

	for (let index = 0; index < count; index++) {
		const y = 1 - ((index + 0.5) / count) * 2;
		const radius = Math.sqrt(Math.max(0, 1 - y * y));
		const angle = index * goldenAngle;
		directions.push(new THREE.Vector3(
			Math.cos(angle) * radius,
			y,
			Math.sin(angle) * radius,
		));
	}

	return directions;
}
