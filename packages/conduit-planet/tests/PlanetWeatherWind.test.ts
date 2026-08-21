import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample, getWeatherSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';

const direction = new THREE.Vector3(0.42, 0.37, -0.83).normalize();

describe('climate.weatherSeed and climate.windStrength migration', () => {
	test('keeps weather deterministic for the same seed, climate and time', () => {
		const definition = createDefinition();
		const climate = getClimateSample(direction, 0.11, 0.81, definition.climate);
		const first = getWeatherSample(direction, climate, 12.5, definition.climate);
		const second = getWeatherSample(direction, climate, 12.5, definition.climate);

		expect(second).toEqual(first);
	});

	test('uses weatherSeed as the spatial identity of weather fields', () => {
		const definition = createDefinition();
		const alternate = structuredClone(definition.climate);
		alternate.weatherSeed = (alternate.weatherSeed + 0x51f15e) >>> 0;
		let foundDifference = false;

		for (const sampleDirection of sampleDirections(48)) {
			const climate = getClimateSample(sampleDirection, 0.10, 0.82, definition.climate);
			const first = getWeatherSample(sampleDirection, climate, 7.25, definition.climate);
			const second = getWeatherSample(sampleDirection, climate, 7.25, alternate);

			if (
				Math.abs(first.pressure - second.pressure) > 1e-8 ||
				Math.abs(first.windBand - second.windBand) > 1e-8 ||
				Math.abs(first.swirl - second.swirl) > 1e-8
			) {
				foundDifference = true;
				break;
			}
		}

		expect(foundDifference).toBe(true);
	});

	test('uses windStrength only as the global wind intensity control', () => {
		const definition = createDefinition();
		const calm = structuredClone(definition.climate);
		const windy = structuredClone(definition.climate);
		calm.windStrength = 0.10;
		windy.windStrength = 0.90;
		let foundStrictIncrease = false;

		for (const sampleDirection of sampleDirections(48)) {
			const climate = getClimateSample(sampleDirection, 0.10, 0.82, definition.climate);
			const calmWeather = getWeatherSample(sampleDirection, climate, 5.5, calm);
			const windyWeather = getWeatherSample(sampleDirection, climate, 5.5, windy);

			expect(windyWeather.windStrength).toBeGreaterThanOrEqual(calmWeather.windStrength);
			expect(windyWeather.pressure).toBe(calmWeather.pressure);
			expect(windyWeather.lowPressure).toBe(calmWeather.lowPressure);
			expect(windyWeather.highPressure).toBe(calmWeather.highPressure);
			expect(windyWeather.windBand).toBe(calmWeather.windBand);
			expect(windyWeather.stormPotential).toBe(calmWeather.stormPotential);
			expect(windyWeather.cloudBoost).toBe(calmWeather.cloudBoost);
			expect(windyWeather.swirl).toBe(calmWeather.swirl);

			if (windyWeather.windStrength > calmWeather.windStrength + 1e-8) {
				foundStrictIncrease = true;
			}
		}

		expect(foundStrictIncrease).toBe(true);
	});

	test('does not mutate or redefine the canonical climate sample', () => {
		const definition = createDefinition();
		const climate = getClimateSample(direction, 0.11, 0.81, definition.climate);
		const snapshot = structuredClone(climate);
		const alternate = structuredClone(definition.climate);
		alternate.weatherSeed = 123456789;
		alternate.windStrength = 1;

		getWeatherSample(direction, climate, 19.75, alternate);

		expect(climate).toEqual(snapshot);
	});
});

function createDefinition() {
	return generatePlanetDefinition(90125, {
		name: 'Weather Wind Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
}

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
