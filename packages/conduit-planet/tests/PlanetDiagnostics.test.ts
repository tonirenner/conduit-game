import { describe, expect, test } from 'bun:test';
import { generatePlanetDefinition } from '../src/generation';
import { DEFAULT_PLANET_RENDER_FEATURES } from '../src/rendering/PlanetRenderFeatures';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';
import { createSurfaceRenderProfile } from '../src/rendering/SurfaceRenderProfile';
import type { TerrainTextureSet } from '../src/TerrainTextureSet';
import {
	createPlanetDefinitionStats,
	createPlanetRenderFeatureStats,
	createPlanetTerrainTextureStats,
} from '../src/runtime/PlanetDiagnostics';

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

	test('uses actual runtime raymarch steps when available and profile defaults otherwise', () => {
		const features = {
			...DEFAULT_PLANET_RENDER_FEATURES,
			cloudSteps: { moving: 5, idle: 17 },
			atmosphereSteps: { moving: 4, idle: 13 },
			surfaceSteps: { moving: 3, idle: 11 },
		};

		const moving = createPlanetRenderFeatureStats(features, 'moving', {
			clouds: 7,
			surface: 9,
		});

		expect(moving.clouds.steps).toBe(7);
		expect(moving.atmosphere.steps).toBe(4);
		expect(moving.surface.steps).toBe(9);
		expect(moving.clouds.raymarched).toBe(features.raymarchedClouds);

		const idle = createPlanetRenderFeatureStats(features, 'idle');

		expect(idle.clouds.steps).toBe(17);
		expect(idle.atmosphere.steps).toBe(13);
		expect(idle.surface.steps).toBe(11);
	});

	test('preserves terrain texture availability and atlas diagnostics', () => {
		const unavailable = createPlanetTerrainTextureStats(null, true);

		expect(unavailable).toEqual({
			available: false,
			enabled: false,
			resolution: 0,
			atlasWidth: 0,
			atlasHeight: 0,
			atlasColumns: 0,
			atlasRows: 0,
		});

		const textureSet = {
			options: {
				resolution: 256,
				atlasColumns: 3,
				atlasRows: 2,
			},
			getDataAtlasTexture: () => ({
				image: {
					width: 768,
					height: 512,
				},
			}),
		} as unknown as TerrainTextureSet;

		const stats = createPlanetTerrainTextureStats(textureSet, true);

		expect(stats.available).toBe(true);
		expect(stats.enabled).toBe(true);
		expect(stats.resolution).toBe(256);
		expect(stats.atlasWidth).toBe(768);
		expect(stats.atlasHeight).toBe(512);
		expect(stats.atlasColumns).toBe(3);
		expect(stats.atlasRows).toBe(2);
	});
});
