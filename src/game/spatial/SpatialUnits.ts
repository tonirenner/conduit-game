/**
 * Canonical simulation units.
 *
 * Spatial values in gameplay/simulation are stored in meters.
 * Time values are stored in seconds unless a type explicitly documents otherwise.
 *
 * The renderer may compress/exaggerate those values for readability.
 */
export const METER = 1;
export const KILOMETER = 1_000 * METER;
export const MEGAMETER = 1_000_000 * METER;

export const ASTRONOMICAL_UNIT_METERS = 149_597_870_700;
export const LIGHT_YEAR_METERS = 9_460_730_472_580_800;

export const EARTH_RADIUS_METERS = 6_371_000;
export const SOLAR_RADIUS_METERS = 695_700_000;

export const SECOND = 1;
export const MINUTE_SECONDS = 60;
export const HOUR_SECONDS = 60 * MINUTE_SECONDS;
export const DAY_SECONDS = 24 * HOUR_SECONDS;
export const YEAR_SECONDS = 365.25 * DAY_SECONDS;

export function kilometers(value: number): number {
	return value * KILOMETER;
}

export function astronomicalUnits(value: number): number {
	return value * ASTRONOMICAL_UNIT_METERS;
}

export function lightYears(value: number): number {
	return value * LIGHT_YEAR_METERS;
}

export function earthRadii(value: number): number {
	return value * EARTH_RADIUS_METERS;
}

export function solarRadii(value: number): number {
	return value * SOLAR_RADIUS_METERS;
}

export function metersToKilometers(value: number): number {
	return value / KILOMETER;
}

export function metersToAstronomicalUnits(value: number): number {
	return value / ASTRONOMICAL_UNIT_METERS;
}

export function metersToLightYears(value: number): number {
	return value / LIGHT_YEAR_METERS;
}

export function metersToEarthRadii(value: number): number {
	return value / EARTH_RADIUS_METERS;
}

export function metersToSolarRadii(value: number): number {
	return value / SOLAR_RADIUS_METERS;
}
