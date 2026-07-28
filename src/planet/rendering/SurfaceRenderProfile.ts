import type {
	PlanetDefinition,
	PlanetClass,
} from '../model/PlanetDefinition';

import type { PlanetRenderProfile } from './PlanetRenderProfile';

export type SurfacePaletteKind =
	| 'rocky'
	| 'earthlike'
	| 'oceanic'
	| 'ice'
	| 'desert'
	| 'lava'
	| 'toxic'
	| 'metallic'
	| 'carbon'
	| 'gas_bands';

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
	const planetClass = planet.class;

	const hasSolidSurface = planet.surface.hasSolidSurface;

	const waterInfluence =
		      planet.composition.water *
		      (planet.surface.hasOcean ? 1.0 : 0.35);

	const iceInfluence =
		      planet.composition.ice +
		      (planet.surface.hasIceCaps ? 0.25 : 0.0);

	const lavaInfluence =
		      planetClass === 'lava' || planet.surface.hasVolcanism
		      ? 1.0
		      : 0.0;

	const toxicInfluence =
		      planetClass === 'toxic'
		      ? 1.0
		      : planet.composition.volatiles;

	const metalInfluence =
		      planetClass === 'metal_rich'
		      ? 1.0
		      : planet.composition.metal;

	const climateShadowBoost =
		      planet.climate.aridity * 0.05 +
		      planet.climate.ashLoad * 0.12 +
		      planet.climate.stormActivity * 0.04;

	return {
		enabled: hasSolidSurface,

		palette: resolveSurfacePalette(planetClass),

		hasOcean: planet.surface.hasOcean,
		hasIceCaps: planet.surface.hasIceCaps,
		hasVolcanism: planet.surface.hasVolcanism,
		hasTectonics: planet.surface.hasTectonics,

		oceanLevel: renderProfile.oceanLevel,
		mountainScale: renderProfile.mountainScale,
		terrainRoughness: renderProfile.terrainRoughness,

		waterInfluence,
		iceInfluence: Math.min(1, iceInfluence),
		lavaInfluence,
		toxicInfluence: Math.min(1, toxicInfluence),
		metalInfluence: Math.min(1, metalInfluence),

		climateTemperature: planet.climate.temperature01,
		climateHumidity: planet.climate.humidity,
		climateAridity: planet.climate.aridity,
		climateWindStrength: planet.climate.windStrength,
		climateStormActivity: planet.climate.stormActivity,
		climateCloudPersistence: planet.climate.cloudPersistence,
		climateAshLoad: planet.climate.ashLoad,

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

function resolveSurfacePalette(
	planetClass: PlanetClass,
): SurfacePaletteKind {
	switch (planetClass) {
		case 'terrestrial':
			return 'earthlike';

		case 'ocean':
			return 'oceanic';

		case 'ice':
		case 'ice_giant':
			return 'ice';

		case 'desert':
			return 'desert';

		case 'lava':
			return 'lava';

		case 'toxic':
			return 'toxic';

		case 'metal_rich':
			return 'metallic';

		case 'carbon':
			return 'carbon';

		case 'gas_giant':
			return 'gas_bands';

		case 'rocky':
		case 'barren':
		default:
			return 'rocky';
	}
}
