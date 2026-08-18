import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

const direction = new THREE.Vector3(0.44, 0.38, -0.81).normalize();

describe('climate.aridity migration', () => {
	test('uses aridity as a monotonic global dryness baseline', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Aridity Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const humid = structuredClone(definition.climate);
		const dry = structuredClone(definition.climate);
		humid.aridity = 0.15;
		dry.aridity = 0.85;
		let foundStrictIncrease = false;

		for (const sampleDirection of sampleDirections(48)) {
			const humidSample = getClimateSample(sampleDirection, 0.10, 0.84, humid);
			const drySample = getClimateSample(sampleDirection, 0.10, 0.84, dry);

			expect(drySample.aridity).toBeGreaterThanOrEqual(humidSample.aridity);
			expect(drySample.temperature).toBe(humidSample.temperature);
			expect(drySample.humidity).toBe(humidSample.humidity);

			if (drySample.aridity > humidSample.aridity + 1e-8) {
				foundStrictIncrease = true;
			}
		}

		expect(foundStrictIncrease).toBe(true);
	});

	test('preserves local coast and humidity influence on dryness', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Climate Aridity Local Structure Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const climate = structuredClone(definition.climate);
		climate.aridity = 0.62;
		climate.humidity = 0.58;

		const inland = getClimateSample(direction, 0.08, 0.90, climate);
		const coast = getClimateSample(direction, 0.08, 0.64, climate);

		expect(coast.humidity).toBeGreaterThan(inland.humidity);
		expect(coast.aridity).toBeLessThan(inland.aridity);
	});

	test('changes climate outcomes without changing canonical terrain geometry', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Climate Aridity Terrain Isolation Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const lowAridityDefinition = structuredClone(base);
		const highAridityDefinition = structuredClone(base);
		lowAridityDefinition.climate.aridity = 0.10;
		highAridityDefinition.climate.aridity = 0.90;

		const lowSampler = new PlanetTerrainSampler(lowAridityDefinition);
		const highSampler = new PlanetTerrainSampler(highAridityDefinition);
		let foundAridityDifference = false;

		for (const sampleDirection of sampleDirections(32)) {
			const low = lowSampler.sample(sampleDirection, false);
			const high = highSampler.sample(sampleDirection, false);

			expect(low.rawTerrain).toEqual(high.rawTerrain);
			expect(low.geometryRawHeight).toBe(high.geometryRawHeight);
			expect(low.geometryReliefRawHeight).toBe(high.geometryReliefRawHeight);
			expect(low.landMask).toBe(high.landMask);
			expect(low.isWater).toBe(high.isWater);
			expect(low.climate.temperature).toBe(high.climate.temperature);
			expect(low.climate.humidity).toBe(high.climate.humidity);

			if (Math.abs(low.climate.aridity - high.climate.aridity) > 1e-8) {
				foundAridityDifference = true;
			}
		}

		expect(foundAridityDifference).toBe(true);
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
