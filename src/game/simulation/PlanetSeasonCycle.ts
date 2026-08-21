import type { PlanetDefinition } from '@conduit/planet/model';
import { SimulationClock } from './SimulationClock';

export const EARTH_YEAR_DAYS = 365.25;
export const DAY_SECONDS = 24 * 60 * 60;
export const EARTH_YEAR_SECONDS = EARTH_YEAR_DAYS * DAY_SECONDS;

export type PlanetSeasonCycle = {
	phase: number;
	periodSeconds: number;
	seasonality: number;
};

export function getPlanetOrbitalPeriodSeconds(
	definition: Pick<PlanetDefinition, 'orbit'>,
): number {
	const orbitalPeriodYears = definition.orbit.orbitalPeriod;

	if (!Number.isFinite(orbitalPeriodYears) || orbitalPeriodYears <= 0) {
		throw new Error('Planet orbitalPeriod must be finite and greater than zero.');
	}

	return orbitalPeriodYears * EARTH_YEAR_SECONDS;
}

export function getPlanetSeasonCycle(
	clock: SimulationClock,
	definition: Pick<PlanetDefinition, 'orbit' | 'climate'>,
	phaseOffset = 0,
): PlanetSeasonCycle {
	const periodSeconds = getPlanetOrbitalPeriodSeconds(definition);

	return {
		phase: clock.getCyclePhase(periodSeconds, phaseOffset),
		periodSeconds,
		seasonality: Math.max(0, Math.min(1, definition.climate.seasonality)),
	};
}
