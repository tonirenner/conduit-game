import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import {
	getClimateSample,
	getSeasonalWeatherSample,
	getWeatherSample,
} from '../src/climate';

const north = new THREE.Vector3(0.46, 0.78, -0.42).normalize();
const south = new THREE.Vector3(north.x, -north.y, north.z).normalize();

function createDefinition() {
	const definition = generatePlanetDefinition(330030, {
		name: 'Seasonality Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
	definition.climate.seasonality = 0.85;
	definition.climate.stormActivity = 0.5;
	return definition;
}

describe('climate.seasonality weather migration', () => {
	test('keeps pressure and wind topology unchanged across seasons', () => {
		const definition = createDefinition();
		const climate = getClimateSample(north, 0.08, 0.82, definition.climate);
		const first = getSeasonalWeatherSample(
			north,
			climate,
			12.5,
			definition.climate,
			0.25,
		);
		const opposite = getSeasonalWeatherSample(
			north,
			climate,
			12.5,
			definition.climate,
			0.75,
		);

		expect(first.pressure).toBe(opposite.pressure);
		expect(first.lowPressure).toBe(opposite.lowPressure);
		expect(first.highPressure).toBe(opposite.highPressure);
		expect(first.windBand).toBe(opposite.windBand);
		expect(first.windStrength).toBe(opposite.windStrength);
		expect(first.stormPotential).not.toBe(opposite.stormPotential);
	});

	test('mirrors seasonal storm tendency between hemispheres', () => {
		const definition = createDefinition();
		const northClimate = getClimateSample(north, 0.08, 0.82, definition.climate);
		const southClimate = getClimateSample(south, 0.08, 0.82, definition.climate);
		const northBase = getWeatherSample(north, northClimate, 4, definition.climate);
		const southBase = getWeatherSample(south, southClimate, 4, definition.climate);
		const northSeason = getSeasonalWeatherSample(
			north,
			northClimate,
			4,
			definition.climate,
			0.25,
		);
		const southSeason = getSeasonalWeatherSample(
			south,
			southClimate,
			4,
			definition.climate,
			0.25,
		);

		expect(northSeason.stormPotential - northBase.stormPotential).toBeGreaterThan(0);
		expect(southSeason.stormPotential - southBase.stormPotential).toBeLessThan(0);
	});

	test('makes seasonality zero neutral', () => {
		const definition = createDefinition();
		definition.climate.seasonality = 0;
		const climate = getClimateSample(north, 0.08, 0.82, definition.climate);
		const base = getWeatherSample(north, climate, 9, definition.climate);
		const seasonal = getSeasonalWeatherSample(
			north,
			climate,
			9,
			definition.climate,
			0.25,
		);

		expect(seasonal).toEqual(base);
	});

	test('wraps season phase deterministically', () => {
		const definition = createDefinition();
		const climate = getClimateSample(north, 0.08, 0.82, definition.climate);
		const first = getSeasonalWeatherSample(
			north,
			climate,
			6,
			definition.climate,
			0.25,
		);
		const wrapped = getSeasonalWeatherSample(
			north,
			climate,
			6,
			definition.climate,
			1.25,
		);

		expect(wrapped).toEqual(first);
	});
});
