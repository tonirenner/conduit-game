import type { PlanetDefinition } from '@conduit/planet';
import type { PlanetRenderProfile } from '@conduit/planet';
import { createSurfaceMaterialSemantics } from './SurfaceMaterialSemantics';
import type { SurfacePaletteKind } from './SurfacePalette';

export type SurfaceRenderProfile = {
	enabled: boolean;

	palette: SurfacePaletteKind;

	hasOcean: boolean;
	hasIceCaps: boolean;
	hasVolcanism: boolean;
	hasTectonics: boolean;

	oceanLevel: number;
	mountainScale: number;
	terrainRoughness: number;

	waterInfluence: number;
	iceInfluence: number;
	lavaInfluence: number;
	toxicInfluence: number;
	metalInfluence: number;
	rockInfluence: number;
	organicInfluence: number;

	climateTemperature: number;
	climateHumidity: number;
	climateAridity: number;
	climateWindStrength: number;
	climateStormActivity: number;
	climateCloudPersistence: number;
	climateAshLoad: number;

	raymarchOcclusionStrength: number;
};

export function createSurfaceRenderProfile(
	planet: PlanetDefinition,
	renderProfile: PlanetRenderProfile,
): SurfaceRenderProfile {
	const materialSemantics = createSurfaceMaterialSemantics(planet);
	const climateShadowBoost =
		renderProfile.climateAridity * 0.05 +
		renderProfile.climateAshLoad * 0.12 +
		renderProfile.climateStormActivity * 0.04;

	return {
		enabled: renderProfile.enableTerrain,

		palette: renderProfile.surfacePalette,

		hasOcean: renderProfile.enableOcean,
		hasIceCaps: planet.surface.hasIceCaps,
		hasVolcanism: planet.surface.hasVolcanism,
		hasTectonics: planet.surface.hasTectonics,

		oceanLevel: renderProfile.oceanLevel,
		mountainScale: renderProfile.mountainScale,
		terrainRoughness: renderProfile.terrainRoughness,

		...materialSemantics,

		climateTemperature: renderProfile.climateTemperature,
		climateHumidity: renderProfile.climateHumidity,
		climateAridity: renderProfile.climateAridity,
		climateWindStrength: renderProfile.climateWindStrength,
		climateStormActivity: renderProfile.climateStormActivity,
		climateCloudPersistence: renderProfile.climateCloudPersistence,
		climateAshLoad: renderProfile.climateAshLoad,

		raymarchOcclusionStrength: Math.max(
			0.18,
			Math.min(
				0.78,
				0.22 +
				renderProfile.mountainScale * 0.28 +
				renderProfile.terrainRoughness * 0.14 +
				climateShadowBoost,
			),
		),
	};
}
