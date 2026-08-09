import {
	EARTH_RADIUS_METERS,
	LIGHT_YEAR_METERS,
} from './SpatialUnits';
import type { PlanetClass } from '../../planet/model/PlanetDefinition';

export type SpatialRenderMode =
	| 'local'
	| 'system'
	| 'strategic';

/**
 * System-local gameplay positions:
 * 1 render unit = 1 km.
 *
 * The simulation still stores meters. This conversion only affects rendering,
 * picking and camera interaction.
 */
export const SYSTEM_LOCAL_METERS_PER_RENDER_UNIT = 1_000;

/**
 * Meter-authored GLB visual size:
 * 1 render unit = 250 m of asset geometry.
 *
 * This deliberate visual exaggeration keeps ships/stations readable while
 * orbital distances are heavily compressed, Homeworld-style.
 */
export const ASSET_METERS_PER_RENDER_UNIT = 250;

/** Astronomical readability scales for SystemView. */
export const SYSTEM_ORBIT_VISUAL_SCALE = 2.85;
export const SYSTEM_PLANET_VISUAL_SCALE = 1.95;
export const SYSTEM_STAR_VISUAL_SCALE = 1.32;
export const SYSTEM_PLANET_RADIUS_EARTH_DIVISOR = 2.2;
export const SYSTEM_PLANET_RENDER_RADIUS_MIN = 1.85;
export const SYSTEM_PLANET_RENDER_RADIUS_MAX = 5.8;

export function systemMetersToRenderUnits(meters: number): number {
	return meters / SYSTEM_LOCAL_METERS_PER_RENDER_UNIT;
}

export function systemRenderUnitsToMeters(renderUnits: number): number {
	return renderUnits * SYSTEM_LOCAL_METERS_PER_RENDER_UNIT;
}

export function meterAuthoredAssetRenderScale(): number {
	return 1 / ASSET_METERS_PER_RENDER_UNIT;
}

export function getSystemPlanetRenderRadius(
	physicalRadiusMeters: number,
	planetClass: PlanetClass,
): number {
	const physicalRadiusEarth =
		physicalRadiusMeters / EARTH_RADIUS_METERS;
	const baseRadius = clamp(
		physicalRadiusEarth / SYSTEM_PLANET_RADIUS_EARTH_DIVISOR,
		SYSTEM_PLANET_RENDER_RADIUS_MIN,
		SYSTEM_PLANET_RENDER_RADIUS_MAX,
	);

	return baseRadius *
		getSystemPlanetClassVisualScale(planetClass) *
		SYSTEM_PLANET_VISUAL_SCALE;
}

export function getSystemPlanetClassVisualScale(
	planetClass: PlanetClass,
): number {
	switch (planetClass) {
		case 'gas_giant':
			return 1.95;

		case 'ice_giant':
			return 1.68;

		case 'ocean':
			return 1.34;

		default:
			return 1.08;
	}
}

export function getPlanetScaleDiagnostics(
	physicalRadiusMeters: number,
	renderRadius: number,
): {
	physicalRadiusKilometers: number;
	physicalRenderRadiusAtSystemScale: number;
	visualScaleMultiplier: number;
	kilometersPerRenderedUnit: number;
} {
	const physicalRadiusKilometers = physicalRadiusMeters / 1_000;
	const physicalRenderRadiusAtSystemScale =
		systemMetersToRenderUnits(physicalRadiusMeters);

	return {
		physicalRadiusKilometers,
		physicalRenderRadiusAtSystemScale,
		visualScaleMultiplier:
			physicalRenderRadiusAtSystemScale > 0
				? renderRadius / physicalRenderRadiusAtSystemScale
				: 0,
		kilometersPerRenderedUnit:
			renderRadius > 0
				? physicalRadiusKilometers / renderRadius
				: 0,
	};
}

/**
 * Generic basis for later seamless zoom transitions.
 * Simulation values never change; only the render conversion changes.
 */
export function getMetersPerRenderUnit(mode: SpatialRenderMode): number {
	switch (mode) {
		case 'local':
			return 1;

		case 'system':
			return SYSTEM_LOCAL_METERS_PER_RENDER_UNIT;

		case 'strategic':
			return LIGHT_YEAR_METERS * 0.1;
	}
}

export function metersToRenderUnits(
	meters: number,
	mode: SpatialRenderMode,
): number {
	return meters / getMetersPerRenderUnit(mode);
}

export function renderUnitsToMeters(
	renderUnits: number,
	mode: SpatialRenderMode,
): number {
	return renderUnits * getMetersPerRenderUnit(mode);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
