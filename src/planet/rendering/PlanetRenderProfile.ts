import type {
	PlanetClass,
	PlanetDefinition,
} from '../model/PlanetDefinition';

export type PlanetRendererKind =
	| 'solid_surface'
	| 'gas_giant'
	| 'ice_giant';

export type PlanetRenderProfile = {
	rendererKind: PlanetRendererKind;

	enableTerrain: boolean;
	enableOcean: boolean;
	enableClouds: boolean;
	enableAtmosphere: boolean;
	enableRings: boolean;

	surfacePalette: string;
	atmospherePalette: string;
	cloudPalette: string;

	terrainRoughness: number;
	mountainScale: number;
	oceanLevel: number;
	cloudCoverage: number;
	atmosphereDensity: number;
};

export function createPlanetRenderProfile(
	planet: PlanetDefinition,
): PlanetRenderProfile {
	const rendererKind = getRendererKind(planet.class);

	return {
		rendererKind,

		enableTerrain: planet.surface.hasSolidSurface,
		enableOcean: planet.surface.hasOcean,
		enableClouds: planet.atmosphere.cloudCoverage > 0.02,
		enableAtmosphere: planet.atmosphere.type !== 'none',
		enableRings: planet.rings?.enabled ?? false,

		surfacePalette: getSurfacePalette(planet.class),
		atmospherePalette: planet.atmosphere.color,
		cloudPalette: getCloudPalette(planet.class),

		terrainRoughness: planet.surface.terrainRoughness,
		mountainScale: planet.surface.mountainScale,
		oceanLevel: planet.surface.oceanLevel,
		cloudCoverage: planet.atmosphere.cloudCoverage,
		atmosphereDensity: planet.atmosphere.density,
	};
}

function getRendererKind(planetClass: PlanetClass): PlanetRendererKind {
	if (planetClass === 'gas_giant') {
		return 'gas_giant';
	}

	if (planetClass === 'ice_giant') {
		return 'ice_giant';
	}

	return 'solid_surface';
}

function getSurfacePalette(planetClass: PlanetClass): string {
	switch (planetClass) {
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
		case 'gas_giant':
			return 'gas_bands';
		case 'metal_rich':
			return 'metallic';
		case 'carbon':
			return 'carbon';
		case 'terrestrial':
			return 'earthlike';
		case 'rocky':
		case 'barren':
		default:
			return 'rocky';
	}
}

function getCloudPalette(planetClass: PlanetClass): string {
	switch (planetClass) {
		case 'gas_giant':
			return 'gas_bands';
		case 'ice_giant':
			return 'methane_clouds';
		case 'toxic':
			return 'sulfur_clouds';
		case 'lava':
			return 'ash_clouds';
		case 'ice':
			return 'thin_ice_haze';
		default:
			return 'water_clouds';
	}
}
