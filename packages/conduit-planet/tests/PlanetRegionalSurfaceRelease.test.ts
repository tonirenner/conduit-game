import { describe, expect, test } from 'bun:test';
import {
	SURFACE_DEPTH_OWNERSHIP_WEIGHT,
	getRegionalSurfaceRelease,
} from '../src/view/PlanetViewTransition';

const EARTH_RADIUS_METERS = 6_371_000;
const SURFACE_OUTER_HALF_EXTENT_METERS = 2_048_000;

describe('Regional -> Surface release policy', () => {
	test('keeps Regional fully visible before Surface owns depth', () => {
		const release = getRegionalSurfaceRelease(
			SURFACE_DEPTH_OWNERSHIP_WEIGHT - 0.001,
			25_000,
			EARTH_RADIUS_METERS,
			SURFACE_OUTER_HALF_EXTENT_METERS,
		);

		expect(release.surfaceOwnsDepth).toBe(false);
		expect(release.regionalOpacity).toBe(1);
	});

	test('releases Regional progressively once Surface owns depth and covers the horizon', () => {
		const release = getRegionalSurfaceRelease(
			0.99,
			25_000,
			EARTH_RADIUS_METERS,
			SURFACE_OUTER_HALF_EXTENT_METERS,
		);

		expect(release.surfaceOwnsDepth).toBe(true);
		expect(release.surfaceCoversHorizon).toBe(true);
		expect(release.regionalOpacity).toBeGreaterThan(0);
		expect(release.regionalOpacity).toBeLessThan(1);
	});

	test('does not release Regional when the Surface footprint cannot cover the horizon', () => {
		const release = getRegionalSurfaceRelease(
			1,
			90_000,
			EARTH_RADIUS_METERS,
			100_000,
		);

		expect(release.surfaceOwnsDepth).toBe(true);
		expect(release.surfaceCoversHorizon).toBe(false);
		expect(release.regionalOpacity).toBe(1);
	});

	test('fully releases Regional at full Surface ownership when coverage is safe', () => {
		const release = getRegionalSurfaceRelease(
			1,
			20_000,
			EARTH_RADIUS_METERS,
			SURFACE_OUTER_HALF_EXTENT_METERS,
		);

		expect(release.surfaceCoversHorizon).toBe(true);
		expect(release.regionalOpacity).toBe(0);
	});
});
