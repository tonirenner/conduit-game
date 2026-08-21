import { describe, expect, test } from 'bun:test';
import type { PlanetDefinition } from '@conduit/planet/model';
import { SimulationClock } from './SimulationClock';
import {
	EARTH_YEAR_SECONDS,
	getPlanetOrbitalPeriodSeconds,
	getPlanetSeasonCycle,
} from './PlanetSeasonCycle';

function createDefinition(
	orbitalPeriod: number,
	seasonality = 0.6,
): Pick<PlanetDefinition, 'orbit' | 'climate'> {
	return {
		orbit: {
			semiMajorAxis: 1,
			eccentricity: 0,
			orbitalPeriod,
			starIrradiance: 1,
			temperature: 278,
		},
		climate: {
			seed: 1,
			biomeSeed: 2,
			weatherSeed: 3,
			temperature01: 0.5,
			humidity: 0.5,
			aridity: 0.5,
			windStrength: 0.5,
			stormActivity: 0.5,
			seasonality,
			cloudPersistence: 0.5,
			ashLoad: 0,
		},
	};
}

describe('PlanetSeasonCycle', () => {
	test('maps one orbitalPeriod unit to one Earth year in simulation seconds', () => {
		const definition = createDefinition(1);
		expect(getPlanetOrbitalPeriodSeconds(definition)).toBe(EARTH_YEAR_SECONDS);
	});

	test('derives phase from canonical simulation time', () => {
		const clock = new SimulationClock();
		const definition = createDefinition(1);
		clock.setElapsedSeconds(EARTH_YEAR_SECONDS * 0.25);

		expect(getPlanetSeasonCycle(clock, definition).phase).toBeCloseTo(0.25, 12);

		clock.setElapsedSeconds(EARTH_YEAR_SECONDS);
		expect(getPlanetSeasonCycle(clock, definition).phase).toBeCloseTo(0, 12);
	});

	test('respects planet-specific orbital periods', () => {
		const clock = new SimulationClock();
		const shortYear = createDefinition(0.5);
		clock.setElapsedSeconds(EARTH_YEAR_SECONDS * 0.25);

		expect(getPlanetSeasonCycle(clock, shortYear).phase).toBeCloseTo(0.5, 12);
	});

	test('keeps the simulation epoch as an unnamed phase-zero reference', () => {
		const clock = new SimulationClock();
		const definition = createDefinition(1, 0.8);
		const cycle = getPlanetSeasonCycle(clock, definition);

		expect(cycle.phase).toBe(0);
		expect(cycle.seasonality).toBe(0.8);
	});
});
