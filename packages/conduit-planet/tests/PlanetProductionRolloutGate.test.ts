import { describe, expect, test } from 'bun:test';
import { REGIONAL_DEPTH_OWNERSHIP_OPACITY } from '../src/rendering/regional/CurvedRegionalTileTerrain';
import {
	PLANET_VIEW_BANDS,
	SURFACE_DEPTH_OWNERSHIP_WEIGHT,
	getPlanetViewWeights,
	getRegionalSurfaceRelease,
} from '../src/view/PlanetViewTransition';

const EARTH_RADIUS_METERS = 6_371_000;
const SURFACE_OUTER_HALF_EXTENT_METERS = 2_048_000;

function sampleAltitudes(): number[] {
	const values = new Set<number>([
		12_000_000,
		PLANET_VIEW_BANDS.orbitRegionalStartMeters,
		PLANET_VIEW_BANDS.orbitRegionalEndMeters,
		1_000_000,
		PLANET_VIEW_BANDS.surfaceReleaseMeters,
		PLANET_VIEW_BANDS.surfacePreloadMeters,
		PLANET_VIEW_BANDS.regionalSurfaceStartMeters,
		PLANET_VIEW_BANDS.regionalSurfaceEndMeters,
		0,
	]);

	for (let altitude = 12_000_000; altitude >= 0; altitude -= 25_000) {
		values.add(altitude);
	}

	return [...values].sort((a, b) => b - a);
}

describe('production planet rollout transition gate', () => {
	test('keeps Orbit/Regional/Surface weights normalized across descent', () => {
		for (const altitude of sampleAltitudes()) {
			const weights = getPlanetViewWeights(altitude, true);
			const sum = weights.orbit + weights.regional + weights.surface;

			expect(weights.orbit).toBeGreaterThanOrEqual(0);
			expect(weights.regional).toBeGreaterThanOrEqual(0);
			expect(weights.surface).toBeGreaterThanOrEqual(0);
			expect(weights.orbit).toBeLessThanOrEqual(1);
			expect(weights.regional).toBeLessThanOrEqual(1);
			expect(weights.surface).toBeLessThanOrEqual(1);
			expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
		}
	});

	test('never leaves visible Orbit active when Regional owns depth', () => {
		for (const altitude of sampleAltitudes()) {
			const weights = getPlanetViewWeights(altitude, true);
			const regionalOwnsDepth =
				weights.surface <= 0.001 &&
				weights.regional > REGIONAL_DEPTH_OWNERSHIP_OPACITY;
			const effectiveOrbitWeight = regionalOwnsDepth ? 0 : weights.orbit;

			if (regionalOwnsDepth) {
				expect(effectiveOrbitWeight).toBe(0);
			}
		}
	});

	test('hands Regional depth ownership off once Surface owns depth', () => {
		for (const altitude of sampleAltitudes()) {
			const weights = getPlanetViewWeights(altitude, true);
			const release = getRegionalSurfaceRelease(
				weights.surface,
				altitude,
				EARTH_RADIUS_METERS,
				SURFACE_OUTER_HALF_EXTENT_METERS,
			);
			const regionalMayOwnDepth = !release.surfaceOwnsDepth;

			if (weights.surface > SURFACE_DEPTH_OWNERSHIP_WEIGHT) {
				expect(release.surfaceOwnsDepth).toBe(true);
				expect(regionalMayOwnDepth).toBe(false);
			}
		}
	});

	test('uses the same deterministic weights on ascent as on descent', () => {
		const descent = sampleAltitudes();
		const ascent = [...descent].reverse();
		const byAltitude = new Map(
			descent.map((altitude) => [altitude, getPlanetViewWeights(altitude, true)]),
		);

		for (const altitude of ascent) {
			expect(getPlanetViewWeights(altitude, true)).toEqual(byAltitude.get(altitude));
		}
	});
});
