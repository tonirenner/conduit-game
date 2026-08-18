import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

const direction = new THREE.Vector3(0.43, 0.39, -0.81).normalize();

describe('climate.humidity migration', () => {
	test('uses climate.humidity as a monotonic global humidity baseline', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Humidity Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const dry = structuredClone(definition.climate);
		const wet = structuredClone(definition.climate);
		dry.humidity = 0.15;
		wet.humidity = 0.85;
		let foundStrictIncrease = false;

		for (const sampleDirection of sampleDirections(48)) {
			const drySample = getClimateSample(sampleDirection, 0.10, 0.84, dry);
			const wetSample = getClimateSample(sampleDirection, 0.10, 0.84, wet);

			expect(wetSample.humidity).toBeGreaterThanOrEqual(drySample.humidity);
			expect(wetSample.temperature).toBe(drySample.temperature);
			if (wetSample.humidity > drySample.humidity + 1e-8) {
				foundStrictIncrease = true;
			}
		}

		expect(foundStrictIncrease).toBe(true);
	});

	test('preserves local coast and ocean moisture structure', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Humidity Local Structure Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const climate = structuredClone(definition.climate);
		climate.humidity = 0.5;

		const dryLand = getClimateSample(direction, 0.10, 0.95, climate);
		const coast = getClimateSample(direction, 0.10, 0.56, climate);
		const ocean = getClimateSample(direction, 0.10, 0.18, climate);

		expect(coast.humidity).toBeGreaterThan(dryLand.humidity);
		expect(ocean.humidity).toBeGreaterThan(dryLand.humidity);
	});

	test('changes climate without changing canonical terrain geometry', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Climate Humidity Terrain Isolation Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const dryDefinition = structuredClone(base);
		const wetDefinition = structuredClone(base);
		dryDefinition.climate.humidity = 0.10;
		wetDefinition.climate.humidity = 0.90;

		const drySampler = new PlanetTerrainSampler(dryDefinition);
		const wetSampler = new PlanetTerrainSampler(wetDefinition);
		let foundHumidityDifference = false;

		for (const sampleDirection of sampleDirections(32)) {
			const dry = drySampler.sample(sampleDirection, false);
			const wet = wetSampler.sample(sampleDirection, false);

			expect(dry.rawTerrain).toEqual(wet.rawTerrain);
			expect(dry.geometryRawHeight).toBe(wet.geometryRawHeight);
			expect(dry.geometryReliefRawHeight).toBe(wet.geometryReliefRawHeight);
			expect(dry.landMask).toBe(wet.landMask);
			expect(dry.isWater).toBe(wet.isWater);
			expect(dry.climate.temperature).toBe(wet.climate.temperature);

			if (Math.abs(dry.climate.humidity - wet.climate.humidity) > 1e-8) {
				foundHumidityDifference = true;
			}
		}

		expect(foundHumidityDifference).toBe(true);
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
