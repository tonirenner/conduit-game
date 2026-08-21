import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample, getWeatherSample } from '../src/climate';
import { generatePlanetDefinition } from '../src/generation';

const direction = new THREE.Vector3(0.47, 0.36, -0.81).normalize();

describe('climate.stormActivity weather migration', () => {
	test('uses stormActivity as a monotonic global storm tendency', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Storm Activity Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const calm = structuredClone(definition.climate);
		const active = structuredClone(definition.climate);
		calm.stormActivity = 0.15;
		active.stormActivity = 0.85;
		let foundStrictIncrease = false;

		for (const sampleDirection of sampleDirections(48)) {
			const climate = getClimateSample(sampleDirection, 0.10, 0.82, definition.climate);
			const calmWeather = getWeatherSample(sampleDirection, climate, 12.5, calm);
			const activeWeather = getWeatherSample(sampleDirection, climate, 12.5, active);

			expect(activeWeather.stormPotential).toBeGreaterThanOrEqual(
				calmWeather.stormPotential,
			);
			if (activeWeather.stormPotential > calmWeather.stormPotential + 1e-8) {
				foundStrictIncrease = true;
			}
		}

		expect(foundStrictIncrease).toBe(true);
	});

	test('does not alter pressure or wind when only stormActivity changes', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Storm Isolation Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const calm = structuredClone(definition.climate);
		const active = structuredClone(definition.climate);
		calm.stormActivity = 0.10;
		active.stormActivity = 0.90;
		const climate = getClimateSample(direction, 0.11, 0.84, definition.climate);
		const calmWeather = getWeatherSample(direction, climate, 7.25, calm);
		const activeWeather = getWeatherSample(direction, climate, 7.25, active);

		expect(activeWeather.pressure).toBe(calmWeather.pressure);
		expect(activeWeather.lowPressure).toBe(calmWeather.lowPressure);
		expect(activeWeather.highPressure).toBe(calmWeather.highPressure);
		expect(activeWeather.windBand).toBe(calmWeather.windBand);
		expect(activeWeather.windStrength).toBe(calmWeather.windStrength);
		expect(activeWeather.stormPotential).toBeGreaterThan(calmWeather.stormPotential);
	});

	test('allows cloud and swirl response only downstream of final storm potential', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Storm Downstream Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const calm = structuredClone(definition.climate);
		const active = structuredClone(definition.climate);
		calm.stormActivity = 0.05;
		active.stormActivity = 0.95;
		const climate = getClimateSample(direction, 0.09, 0.79, definition.climate);
		const calmWeather = getWeatherSample(direction, climate, 21.0, calm);
		const activeWeather = getWeatherSample(direction, climate, 21.0, active);

		expect(activeWeather.cloudBoost).toBeGreaterThanOrEqual(calmWeather.cloudBoost);
		expect(activeWeather.swirl).toBeGreaterThanOrEqual(calmWeather.swirl);
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
