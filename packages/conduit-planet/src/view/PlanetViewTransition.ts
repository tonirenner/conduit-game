export type PlanetViewPhase =
	| 'orbit'
	| 'orbit-regional'
	| 'regional'
	| 'regional-surface'
	| 'surface';

export type PlanetViewWeights = {
	phase: PlanetViewPhase;
	orbit: number;
	regional: number;
	surface: number;
};

export type RegionalSurfaceRelease = {
	regionalOpacity: number;
	surfaceOwnsDepth: boolean;
	surfaceCoversHorizon: boolean;
};

export const PLANET_VIEW_BANDS = {
	regionalPreloadMeters: 9_750_000,
	regionalReleaseMeters: 10_000_000,
	orbitRegionalStartMeters: 9_000_000,
	orbitRegionalEndMeters: 7_500_000,
	// Surface is a local tangent view, not another planetary-scale renderer.
	// Keep Regional responsible for curvature until the camera is genuinely
	// close to the ground; the current 11-ring clipmap covers +/-2048 km and can
	// take over the visible horizon near the end of this overlap.
	surfacePreloadMeters: 140_000,
	surfaceReleaseMeters: 220_000,
	regionalSurfaceStartMeters: 90_000,
	regionalSurfaceEndMeters: 20_000,
} as const;

export const SURFACE_DEPTH_OWNERSHIP_WEIGHT = 0.985;
export const SURFACE_HORIZON_COVERAGE_MARGIN = 1.15;

export function getPlanetViewWeights(
	altitudeMeters: number,
	surfaceViewsEnabled: boolean,
): PlanetViewWeights {
	if (!surfaceViewsEnabled) {
		return {
			phase: 'orbit',
			orbit: 1,
			regional: 0,
			surface: 0,
		};
	}

	const orbitToRegional = descendingSmoothstep(
		altitudeMeters,
		PLANET_VIEW_BANDS.orbitRegionalStartMeters,
		PLANET_VIEW_BANDS.orbitRegionalEndMeters,
	);
	const regionalToSurface = descendingSmoothstep(
		altitudeMeters,
		PLANET_VIEW_BANDS.regionalSurfaceStartMeters,
		PLANET_VIEW_BANDS.regionalSurfaceEndMeters,
	);

	const orbit = 1 - orbitToRegional;
	const surface = regionalToSurface;
	const regional = orbitToRegional * (1 - regionalToSurface);

	let phase: PlanetViewPhase = 'regional';
	if (orbitToRegional <= 0) phase = 'orbit';
	else if (orbitToRegional < 1) phase = 'orbit-regional';
	else if (regionalToSurface <= 0) phase = 'regional';
	else if (regionalToSurface < 1) phase = 'regional-surface';
	else phase = 'surface';

	return { phase, orbit, regional, surface };
}

export function getRegionalSurfaceRelease(
	surfaceWeight: number,
	altitudeMeters: number,
	planetRadiusMeters: number,
	surfaceOuterHalfExtentMeters: number,
): RegionalSurfaceRelease {
	const surface = clamp01(surfaceWeight);
	const surfaceOwnsDepth = surface > SURFACE_DEPTH_OWNERSHIP_WEIGHT;
	const surfaceCoversHorizon = hasSurfaceHorizonCoverage(
		altitudeMeters,
		planetRadiusMeters,
		surfaceOuterHalfExtentMeters,
	);

	if (!surfaceOwnsDepth || !surfaceCoversHorizon) {
		return {
			regionalOpacity: 1,
			surfaceOwnsDepth,
			surfaceCoversHorizon,
		};
	}

	const release = ascendingSmoothstep(
		surface,
		SURFACE_DEPTH_OWNERSHIP_WEIGHT,
		1,
	);

	return {
		regionalOpacity: 1 - release,
		surfaceOwnsDepth,
		surfaceCoversHorizon,
	};
}

export function shouldHaveRegionalView(
	altitudeMeters: number,
	currentlyActive: boolean,
): boolean {
	return altitudeMeters < (
		currentlyActive
			? PLANET_VIEW_BANDS.regionalReleaseMeters
			: PLANET_VIEW_BANDS.regionalPreloadMeters
	);
}

export function shouldHaveSurfaceView(
	altitudeMeters: number,
	currentlyActive: boolean,
): boolean {
	return altitudeMeters < (
		currentlyActive
			? PLANET_VIEW_BANDS.surfaceReleaseMeters
			: PLANET_VIEW_BANDS.surfacePreloadMeters
	);
}

function hasSurfaceHorizonCoverage(
	altitudeMeters: number,
	planetRadiusMeters: number,
	outerHalfExtentMeters: number,
): boolean {
	if (outerHalfExtentMeters <= 0) return false;

	const radius = Math.max(1, planetRadiusMeters);
	const altitude = Math.max(0, altitudeMeters);
	const horizonDistance = Math.sqrt(
		Math.max(0, (radius + altitude) * (radius + altitude) - radius * radius),
	);

	return outerHalfExtentMeters >=
		horizonDistance * SURFACE_HORIZON_COVERAGE_MARGIN;
}

function descendingSmoothstep(
	value: number,
	start: number,
	end: number,
): number {
	const t = clamp01((start - value) / Math.max(1, start - end));
	return t * t * (3 - 2 * t);
}

function ascendingSmoothstep(
	value: number,
	start: number,
	end: number,
): number {
	const t = clamp01((value - start) / Math.max(1e-6, end - start));
	return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
