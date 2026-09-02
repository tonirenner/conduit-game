import { describe, expect, test } from 'bun:test';
import { generatePlanetDefinition } from '../src/generation';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';
import { createSurfaceRenderProfile } from '../src/rendering/SurfaceRenderProfile';
import { createPlanetDefinitionStats } from '../src/runtime/PlanetDiagnostics';

describe('planet diagnostics', () => {
	test('preserves the public empty definition stats shape', () => {
		const stats = createPlanetDefinitionStats(null, null, null, null);

		expect(stats.available).toBe(false);
		expect(stats.name).toBe('none');
		expect(stats.class).toBe('none');
		expect(stats.rendererKind).toBe('none');
		expect(stats.composition.rock).toBe(0);
		expect(stats.render.enableTerrain).toBe(false);
		expect(stats.surfaceProfile.palette).toBe('none');
		expect(stats.nearSurfaceTerrain.enabled).toBe(false);
	});

	test('combines definition and derived render diagnostics without re-deriving render semantics', () => {
		const definition = generatePlanetDefinition(74010, {
			forcePlanetClass: 'terrestrial',
			forceRings: true,
			semiMajorAxis: 1,
			starIrradiance: 1,
		});
		const renderProfile = createPlanetRenderProfile(definition);
		const surfaceProfile = createSurfaceRenderProfile(definition, renderProfile);
		const nearSurface = {
			enabled: true,
			visible: true,
			resolution: 64,
			patchSize: 12,
			height: 0.42,
		};

		const stats = createPlanetDefinitionStats(
			definition,
			renderProfile,
			surfaceProfile,
			nearSurface,
		);

		expect(stats.available).toBe(true);
		expect(stats.name).toBe(definition.name);
		expect(stats.class).toBe(definition.class);
		expect(stats.composition).toEqual(definition.composition);
		expect(stats.terrainSeed).toBe(definition.render.terrainSeed);
		expect(stats.render.enableTerrain).toBe(renderProfile.enableTerrain);
		expect(stats.render.enableRings).toBe(renderProfile.enableRings);
		expect(stats.render.cloudCoverage).toBe(renderProfile.cloudCoverage);
		expect(stats.surfaceProfile.palette).toBe(surfaceProfile.palette);
		expect(stats.surfaceProfile.metalInfluence).toBe(surfaceProfile.metalInfluence);
		expect(stats.nearSurfaceTerrain).toEqual(nearSurface);
	});
});
