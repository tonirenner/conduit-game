import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_PLANET_RENDER_FEATURES,
	mergePlanetRenderFeatures,
} from '../src/rendering/PlanetRenderFeatures';

describe('near-surface terrain feature retirement', () => {
	test('disables the legacy near-surface terrain layer by default', () => {
		expect(DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain).toBe(false);
		expect(mergePlanetRenderFeatures().nearSurfaceTerrain).toBe(false);
	});

	test('temporarily preserves explicit compatibility opt-in during phase 8', () => {
		expect(
			mergePlanetRenderFeatures({nearSurfaceTerrain: true}).nearSurfaceTerrain,
		).toBe(true);
	});
});
