import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

const direction = new THREE.Vector3(0.52, 0.46, -0.72).normalize();

describe('climate.seed and climate.temperature01 migration', () => {
	test('keeps climate sampling deterministic for the same definition', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Determinism Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const first = getClimateSample(direction, 0.12, 0.82, definition.climate);
		const second = getClimateSample(direction, 0.12, 0.82, definition.climate);

		expect(second).toEqual(first);
	});

	test('uses climate.seed as spatial temperature identity', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Seed Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const alternate = structuredClone(definition.climate);
		alternate.seed = (alternate.seed + 0x51f15e) >>> 0;
		let foundTemperatureDifference = false;

		for (const sampleDirection of sampleDirections(48)) {
			const first = getClimateSample(sampleDirection, 0.10, 0.84, definition.climate);
			const second = getClimateSample(sampleDirection, 0.10, 0.84, alternate);
			if (Math.abs(first.temperature - second.temperature) > 1e-8) {
				foundTemperatureDifference = true;
				break;
			}
		}

		expect(foundTemperatureDifference).toBe(true);
	});

	test('uses temperature01 as a monotonic global temperature baseline', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Temperature Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const cold = structuredClone(definition.climate);
		const warm = structuredClone(definition.climate);
		cold.temperature01 = 0.20;
		warm.temperature01 = 0.80;
		let foundStrictIncrease = false;

		for (const sampleDirection of sampleDirections(48)) {
			const coldSample = getClimateSample(sampleDirection, 0.10, 0.84, cold);
			const warmSample = getClimateSample(sampleDirection, 0.10, 0.84, warm);
			expect(warmSample.temperature).toBeGreaterThanOrEqual(coldSample.temperature);
			if (warmSample.temperature > coldSample.temperature + 1e-8) {
				foundStrictIncrease = true;
			}
		}

		expect(foundStrictIncrease).toBe(true);
	});

	test('changes climate without changing canonical terrain geometry', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Climate Terrain Isolation Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const coldDefinition = structuredClone(base);
		const warmDefinition = structuredClone(base);
		coldDefinition.climate.temperature01 = 0.15;
		warmDefinition.climate.temperature01 = 0.85;
		coldDefinition.climate.seed = 111;
		warmDefinition.climate.seed = 222;

		const coldSampler = new PlanetTerrainSampler(coldDefinition);
		const warmSampler = new PlanetTerrainSampler(warmDefinition);
		let foundClimateDifference = false;

		for (const sampleDirection of sampleDirections(32)) {
			const cold = coldSampler.sample(sampleDirection, false);
			const warm = warmSampler.sample(sampleDirection, false);

			expect(cold.rawTerrain).toEqual(warm.rawTerrain);
			expect(cold.geometryRawHeight).toBe(warm.geometryRawHeight);
			expect(cold.geometryReliefRawHeight).toBe(warm.geometryReliefRawHeight);
			expect(cold.landMask).toBe(warm.landMask);
			expect(cold.isWater).toBe(warm.isWater);

			if (Math.abs(cold.climate.temperature - warm.climate.temperature) > 1e-8) {
				foundClimateDifference = true;
			}
		}

		expect(foundClimateDifference).toBe(true);
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
