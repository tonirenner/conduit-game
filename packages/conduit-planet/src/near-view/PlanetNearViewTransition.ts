import * as THREE from 'three';

export const NEAR_VIEW_TERRAIN_PRELOAD_METERS = 6_000;
export const NEAR_VIEW_TERRAIN_START_METERS = 3_000;
export const NEAR_VIEW_PLANET_END_METERS = 2_000;
export const APPROACH_FULL_SCALE_MAX_ALTITUDE_METERS = 100_000;
export const APPROACH_COMPRESSED_SCALE_ALTITUDE_METERS = 300_000;

export type PlanetNearViewTransition = {
	planetVisible: boolean;
	terrainVisible: boolean;
	terrainPrepared: boolean;
	planetWeight: number;
	terrainWeight: number;
};

export function getPlanetNearViewTransition(
	altitudeMeters: number,
): PlanetNearViewTransition {
	const altitude = Math.max(0, altitudeMeters);
	const range =
		NEAR_VIEW_TERRAIN_START_METERS - NEAR_VIEW_PLANET_END_METERS;
	const normalized = Math.min(
		1,
		Math.max(0, (altitude - NEAR_VIEW_PLANET_END_METERS) / range),
	);
	const smooth = normalized * normalized * (3 - 2 * normalized);

	return {
		planetVisible: altitude > NEAR_VIEW_PLANET_END_METERS,
		terrainVisible: altitude < NEAR_VIEW_TERRAIN_START_METERS,
		terrainPrepared: altitude < NEAR_VIEW_TERRAIN_PRELOAD_METERS,
		planetWeight: smooth,
		terrainWeight: 1 - smooth,
	};
}

export function getApproachProxyDistance(
	planetRadiusMeters: number,
	altitudeMeters: number,
	proxyRadius: number,
	surfaceElevationMeters = 0,
): number {
	const effectiveRadius = getApproachProxyRadius(
		planetRadiusMeters,
		altitudeMeters,
		proxyRadius,
	);
	return effectiveRadius * (
		1 + (
			Math.max(0, altitudeMeters) + surfaceElevationMeters
		) / planetRadiusMeters
	);
}

export function getApproachProxyScale(
	planetRadiusMeters: number,
	altitudeMeters: number,
	proxyRadius: number,
): number {
	return getApproachProxyRadius(
		planetRadiusMeters,
		altitudeMeters,
		proxyRadius,
	) / proxyRadius;
}

function getApproachProxyRadius(
	planetRadiusMeters: number,
	altitudeMeters: number,
	proxyRadius: number,
): number {
	const normalized = Math.min(1, Math.max(
		0,
		(Math.max(0, altitudeMeters) - APPROACH_FULL_SCALE_MAX_ALTITUDE_METERS) /
		(APPROACH_COMPRESSED_SCALE_ALTITUDE_METERS -
			APPROACH_FULL_SCALE_MAX_ALTITUDE_METERS),
	));
	const smooth = normalized * normalized * (3 - 2 * normalized);
	return THREE.MathUtils.lerp(planetRadiusMeters, proxyRadius, smooth);
}
