import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';
import {
	getTerrainGeometryReliefRawHeight,
	getTerrainVolcanicMask,
} from '../src/terrain/TerrainGeometryRelief';
import { createTerrainSeedConfig, type TerrainSample } from '../src/terrain/noise';

const terrain: TerrainSample = {
	height: 0.19,
	landMask: 0.91,
	continent: 0.76,
	mountainMask: 0.58,
	erosionMask: 0.43,
	riverMask: 0.09,
};
const config = createTerrainSeedConfig(19081, 'earthlike');

describe('surface.hasVolcanism migration', () => {
	test('exposes a deterministic sparse volcanic activity mask only when enabled', () => {
		let strongestActivity = 0;
		let inactiveActivity = 0;

		for (const direction of sampleDirections(128)) {
			const inactive = getTerrainVolcanicMask(
				direction,
				terrain,
				config,
				false,
			);
			const active = getTerrainVolcanicMask(
				direction,
				terrain,
				config,
				true,
			);
			const repeated = getTerrainVolcanicMask(
				direction,
				terrain,
				config,
				true,
			);

			expect(inactive).toBe(0);
			expect(repeated).toBe(active);
			expect(active).toBeGreaterThanOrEqual(0);
			expect(active).toBeLessThanOrEqual(1);
		inactiveActivity = Math.max(inactiveActivity, inactive);
		strongestActivity = Math.max(strongestActivity, active);
		}

		expect(inactiveActivity).toBe(0);
		expect(strongestActivity).toBeGreaterThan(1e-4);
	});

	test('adds volcanic geometry independently from terrain roughness and tectonics', () => {
		let largestVolcanicRelief = 0;

		for (const direction of sampleDirections(128)) {
			const inactive = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0,
				false,
				false,
			);
			const active = getTerrainGeometryReliefRawHeight(
				direction,
				terrain,
				config,
				0,
				false,
				true,
			);

			expect(inactive).toBe(0);
		largestVolcanicRelief = Math.max(
				largestVolcanicRelief,
				Math.abs(active),
			);
		}

		expect(largestVolcanicRelief).toBeGreaterThan(1e-6);
	});

	test('changes only volcanic mask and geometry while canonical terrain semantics stay stable', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Volcanism Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const inactiveDefinition = structuredClone(base);
		const activeDefinition = structuredClone(base);
		inactiveDefinition.surface.hasVolcanism = false;
		activeDefinition.surface.hasVolcanism = true;

		const inactiveSampler = new PlanetTerrainSampler(inactiveDefinition);
		const activeSampler = new PlanetTerrainSampler(activeDefinition);
		let foundGeometryDifference = false;
		let foundVolcanicActivity = false;

		expect(inactiveSampler.hasVolcanism).toBe(false);
		expect(activeSampler.hasVolcanism).toBe(true);

		for (const direction of sampleDirections(96)) {
			const inactive = inactiveSampler.sample(direction, false);
			const active = activeSampler.sample(direction, false);

			expect(inactive.rawTerrain).toEqual(active.rawTerrain);
			expect(inactive.landMask).toBe(active.landMask);
			expect(inactive.isWater).toBe(active.isWater);
			expect(inactive.biome).toBe(active.biome);
			expect(inactive.climate).toEqual(active.climate);
			expect(inactive.volcanicMask).toBe(0);

			if (active.volcanicMask > 1e-4) {
				foundVolcanicActivity = true;
			}
			if (
				Math.abs(
					inactive.geometryReliefRawHeight - active.geometryReliefRawHeight,
				) > 1e-6
			) {
				foundGeometryDifference = true;
			}
		}

		expect(foundVolcanicActivity).toBe(true);
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
