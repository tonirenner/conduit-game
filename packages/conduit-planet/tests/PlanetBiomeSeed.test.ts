import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

describe('climate.biomeSeed migration', () => {
	test('changes ecological biome identity without changing climate scalars', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Biome Seed Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const firstClimate = structuredClone(definition.climate);
		const secondClimate = structuredClone(definition.climate);
		firstClimate.temperature01 = 0.55;
		secondClimate.temperature01 = 0.55;
		firstClimate.humidity = 0.50;
		secondClimate.humidity = 0.50;
		firstClimate.aridity = 0.50;
		secondClimate.aridity = 0.50;
		firstClimate.biomeSeed = 111;
		secondClimate.biomeSeed = 0x7f31ab;

		let foundBiomeDifference = false;

		for (const direction of sampleDirections(384)) {
			const first = getClimateSample(direction, 0.10, 0.84, firstClimate);
			const second = getClimateSample(direction, 0.10, 0.84, secondClimate);

			expect(second.temperature).toBe(first.temperature);
			expect(second.humidity).toBe(first.humidity);
			expect(second.aridity).toBe(first.aridity);
			expect(second.vegetation).toBe(first.vegetation);
			expect(second.snow).toBe(first.snow);
			expect(second.cloudPotential).toBe(first.cloudPotential);
			expect(second.pressure).toBe(first.pressure);
			expect(second.windBand).toBe(first.windBand);

			if (first.biome !== second.biome) {
				foundBiomeDifference = true;
			}
		}

		expect(foundBiomeDifference).toBe(true);
	});

	test('keeps hard geographic and physical biome gates seed-independent', () => {
		const definition = generatePlanetDefinition(12345, {
			name: 'Biome Hard Gate Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const firstClimate = structuredClone(definition.climate);
		const secondClimate = structuredClone(definition.climate);
		firstClimate.biomeSeed = 1;
		secondClimate.biomeSeed = 0xf0e1d2;

		const direction = new THREE.Vector3(0.7, 0.2, -0.5).normalize();
		const cases = [
			{ height: 0.08, landMask: 0.20, expected: 'deepOcean' },
			{ height: 0.08, landMask: 0.48, expected: 'shallowOcean' },
			{ height: 0.08, landMask: 0.63, expected: 'coast' },
			{ height: 0.24, landMask: 0.90, expected: 'mountain' },
		] as const;

		for (const entry of cases) {
			const first = getClimateSample(direction, entry.height, entry.landMask, firstClimate);
			const second = getClimateSample(direction, entry.height, entry.landMask, secondClimate);
			expect(first.biome).toBe(entry.expected);
			expect(second.biome).toBe(entry.expected);
		}
	});

	test('does not change canonical terrain geometry through PlanetTerrainSampler', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Biome Terrain Isolation Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const firstDefinition = structuredClone(base);
		const secondDefinition = structuredClone(base);
		firstDefinition.climate.biomeSeed = 31415;
		secondDefinition.climate.biomeSeed = 92653;

		const firstSampler = new PlanetTerrainSampler(firstDefinition);
		const secondSampler = new PlanetTerrainSampler(secondDefinition);

		for (const direction of sampleDirections(48)) {
			const first = firstSampler.sample(direction, false);
			const second = secondSampler.sample(direction, false);

			expect(second.rawTerrain).toEqual(first.rawTerrain);
			expect(second.geometryRawHeight).toBe(first.geometryRawHeight);
			expect(second.geometryReliefRawHeight).toBe(first.geometryReliefRawHeight);
			expect(second.landMask).toBe(first.landMask);
			expect(second.isWater).toBe(first.isWater);
			expect(second.climate.temperature).toBe(first.climate.temperature);
			expect(second.climate.humidity).toBe(first.climate.humidity);
			expect(second.climate.aridity).toBe(first.climate.aridity);
		}
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
