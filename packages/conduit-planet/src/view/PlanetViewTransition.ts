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

export const PLANET_VIEW_BANDS = {
	regionalPreloadMeters: 9_750_000,
	regionalReleaseMeters: 10_000_000,
	orbitRegionalStartMeters: 9_000_000,
	orbitRegionalEndMeters: 7_500_000,
	// Surface is a local tangent view, not another planetary-scale renderer.
	// Keep Regional responsible for curvature until the camera is genuinely
	// close to the ground; the 7-ring clipmap can then cover the visible horizon
	// without stretching a tangent plane across several thousand kilometres.
	surfacePreloadMeters: 140_000,
	surfaceReleaseMeters: 220_000,
	regionalSurfaceStartMeters: 90_000,
	regionalSurfaceEndMeters: 20_000,
} as const;

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

function descendingSmoothstep(
	value: number,
	start: number,
	end: number,
): number {
	const t = clamp01((start - value) / Math.max(1, start - end));
	return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
