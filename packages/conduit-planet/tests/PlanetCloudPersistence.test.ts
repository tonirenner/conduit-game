import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import {
	getClimateSample,
	getCloudStructureTime,
	getPersistentWeatherSample,
	getWeatherSample,
} from '../src/climate';

const directions = Array.from({ length: 48 }, (_, index) => {
	const y = 1 - ((index + 0.5) / 48) * 2;
	const radius = Math.sqrt(Math.max(0, 1 - y * y));
	const angle = index * Math.PI * (3 - Math.sqrt(5));
	return new THREE.Vector3(
		Math.cos(angle) * radius,
		y,
		Math.sin(angle) * radius,
	).normalize();
});

function createDefinition(cloudPersistence: number) {
	const definition = generatePlanetDefinition(440031, {
		name: 'Cloud Persistence Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
	definition.climate.cloudPersistence = cloudPersistence;
	definition.climate.stormActivity = 0.42;
	return definition;
}

describe('climate.cloudPersistence weather migration', () => {
	test('keeps the historical cloud structure timing at the neutral midpoint', () => {
		const definition = createDefinition(0.5);
		expect(getCloudStructureTime(123.5, definition.climate)).toBeCloseTo(123.5, 12);
	});

	test('makes high persistence slower and low persistence faster', () => {
		const low = createDefinition(0.0);
		const high = createDefinition(1.0);
		const time = 100;

		expect(getCloudStructureTime(time, low.climate)).toBeCloseTo(160, 12);
		expect(getCloudStructureTime(time, high.climate)).toBeCloseTo(40, 12);
	});

	test('keeps pressure and wind identical when only persistence changes', () => {
		const low = createDefinition(0.05);
		const high = createDefinition(0.95);
		const direction = directions[17];
		const climate = getClimateSample(direction, 0.08, 0.82, low.climate);
		const lowSample = getPersistentWeatherSample(direction, climate, 27.5, low.climate);
		const highSample = getPersistentWeatherSample(direction, climate, 27.5, high.climate);

		expect(lowSample.pressure).toBe(highSample.pressure);
		expect(lowSample.lowPressure).toBe(highSample.lowPressure);
		expect(lowSample.highPressure).toBe(highSample.highPressure);
		expect(lowSample.windBand).toBe(highSample.windBand);
		expect(lowSample.windStrength).toBe(highSample.windStrength);
	});

	test('changes storm/cloud structure somewhere without changing climate truth', () => {
		const low = createDefinition(0.0);
		const high = createDefinition(1.0);
		let foundDynamicDifference = false;

		for (const direction of directions) {
			const climateLow = getClimateSample(direction, 0.08, 0.82, low.climate);
			const climateHigh = getClimateSample(direction, 0.08, 0.82, high.climate);

			expect(climateHigh).toEqual(climateLow);

			for (const time of [11, 37, 83]) {
				const lowSample = getPersistentWeatherSample(direction, climateLow, time, low.climate);
				const highSample = getPersistentWeatherSample(direction, climateHigh, time, high.climate);

				if (
					lowSample.stormPotential !== highSample.stormPotential ||
					lowSample.cloudBoost !== highSample.cloudBoost ||
					lowSample.swirl !== highSample.swirl
				) {
					foundDynamicDifference = true;
				}
			}
		}

		expect(foundDynamicDifference).toBe(true);
	});

	test('matches the canonical weather sample exactly at neutral persistence', () => {
		const definition = createDefinition(0.5);
		const direction = directions[9];
		const climate = getClimateSample(direction, 0.08, 0.82, definition.climate);
		const base = getWeatherSample(direction, climate, 19, definition.climate);
		const persistent = getPersistentWeatherSample(
			direction,
			climate,
			19,
			definition.climate,
		);

		expect(persistent).toEqual(base);
	});
});
