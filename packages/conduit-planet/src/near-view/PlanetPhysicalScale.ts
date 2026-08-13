import type { PlanetDefinition } from '../model';

export const EARTH_RADIUS_METERS = 6_371_000;

/**
 * PlanetDefinition currently stores radius in Earth-radius units.
 * Near-view simulation always works in physical meters.
 */
export function getPlanetRadiusMeters(definition: PlanetDefinition): number {
	return definition.physical.radius * EARTH_RADIUS_METERS;
}
