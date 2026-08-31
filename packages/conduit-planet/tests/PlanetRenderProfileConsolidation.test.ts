import { describe, expect, test } from 'bun:test';
import { generatePlanetDefinition } from '../src/generation';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';
import { createSurfaceRenderProfile } from '../src/rendering/SurfaceRenderProfile';
import { resolveSurfacePalette } from '../src/rendering/SurfacePalette';

function createDefinition() {
	const definition = generatePlanetDefinition(73030, {
		forcePlanetClass: 'terrestrial',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});

	definition.climate.temperature01 = 0.61;
	definition.climate.humidity = 0.72;
	definition.climate.aridity = 0.23;
	definition.climate.windStrength = 0.44;
	definition.climate.stormActivity = 0.37;
	definition.climate.cloudPersistence = 0.68;
	definition.climate.ashLoad = 0.11;
	return definition;
}

describe('render profile consolidation', () => {
	test('uses one canonical surface palette mapping', () => {
		const definition = createDefinition();
		const renderProfile = createPlanetRenderProfile(definition);
		const surfaceProfile = createSurfaceRenderProfile(definition, renderProfile);

		expect(renderProfile.surfacePalette).toBe(resolveSurfacePalette(definition.class));
		expect(surfaceProfile.palette).toBe(renderProfile.surfacePalette);
	});

	test('forwards derived climate values from PlanetRenderProfile into SurfaceRenderProfile', () => {
		const definition = createDefinition();
		const renderProfile = createPlanetRenderProfile(definition);
		const surfaceProfile = createSurfaceRenderProfile(definition, renderProfile);

		expect(surfaceProfile.climateTemperature).toBe(renderProfile.climateTemperature);
		expect(surfaceProfile.climateHumidity).toBe(renderProfile.climateHumidity);
		expect(surfaceProfile.climateAridity).toBe(renderProfile.climateAridity);
		expect(surfaceProfile.climateWindStrength).toBe(renderProfile.climateWindStrength);
		expect(surfaceProfile.climateStormActivity).toBe(renderProfile.climateStormActivity);
		expect(surfaceProfile.climateCloudPersistence).toBe(renderProfile.climateCloudPersistence);
		expect(surfaceProfile.climateAshLoad).toBe(renderProfile.climateAshLoad);
		expect(surfaceProfile.enabled).toBe(renderProfile.enableTerrain);
		expect(surfaceProfile.hasOcean).toBe(renderProfile.enableOcean);
	});
});
