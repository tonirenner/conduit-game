import type {
	PlanetDefinition,
	PlanetResourceProfile,
} from '@conduit/planet/model';
import type {
	PlanetRenderFeatures,
	PlanetRenderProfile,
	SurfaceRenderProfile,
} from '@conduit/planet/rendering';
import type { TerrainTextureSet } from '../TerrainTextureSet';

export type PlanetNearSurfaceTerrainStats = {
	enabled: boolean;
	visible: boolean;
	resolution: number;
	patchSize: number;
	height: number;
};

export type PlanetDefinitionStats = {
	available: boolean;
	name: string;
	class: string;
	rendererKind: string;
	composition: {
		rock: number;
		metal: number;
		ice: number;
		water: number;
		gas: number;
		organic: number;
		volatiles: number;
	};
	atmosphere: {
		type: string;
		cloudCoverage: number;
		density: number;
	};
	resources: {
		metal: number;
		rareMaterials: number;
		fuel: number;
		water: number;
		volatiles: number;
		researchValue: number;
		extractionDifficulty: number;
	};
	rings: boolean;
	moons: number;
	terrainSeed: number;
	climate: {
		seed: number;
		biomeSeed: number;
		weatherSeed: number;
		temperature01: number;
		humidity: number;
		aridity: number;
		windStrength: number;
		stormActivity: number;
		cloudPersistence: number;
		ashLoad: number;
	};
	render: {
		enableTerrain: boolean;
		enableOcean: boolean;
		enableClouds: boolean;
		enableAtmosphere: boolean;
		enableRings: boolean;
		cloudCoverage: number;
		atmosphereDensity: number;
		terrainRoughness: number;
		mountainScale: number;
		oceanLevel: number;
	};
	surfaceProfile: {
		enabled: boolean;
		palette: string;
		hasOcean: boolean;
		hasIceCaps: boolean;
		hasVolcanism: boolean;
		hasTectonics: boolean;
		waterInfluence: number;
		iceInfluence: number;
		lavaInfluence: number;
		toxicInfluence: number;
		metalInfluence: number;
		raymarchOcclusionStrength: number;
	};
	nearSurfaceTerrain: PlanetNearSurfaceTerrainStats;
};

export type PlanetRenderFeatureStats = {
	clouds: {
		raymarched: boolean;
		steps: number;
	};
	atmosphere: {
		raymarched: boolean;
		steps: number;
	};
	surface: {
		raymarched: boolean;
		steps: number;
	};
};

export type PlanetTerrainTextureStats = {
	available: boolean;
	enabled: boolean;
	resolution: number;
	atlasWidth: number;
	atlasHeight: number;
	atlasColumns: number;
	atlasRows: number;
};

export function createPlanetDefinitionStats(
	definition: PlanetDefinition | null,
	renderProfile: PlanetRenderProfile | null,
	surfaceProfile: SurfaceRenderProfile | null,
	nearSurfaceTerrain: PlanetNearSurfaceTerrainStats | null,
): PlanetDefinitionStats {
	if (!definition) {
		return createUnavailablePlanetDefinitionStats();
	}

	return {
		available: true,
		name: definition.name,
		class: definition.class,
		rendererKind: renderProfile?.rendererKind ?? 'unknown',
		composition: definition.composition,
		atmosphere: {
			type: definition.atmosphere.type,
			cloudCoverage: definition.atmosphere.cloudCoverage,
			density: definition.atmosphere.density,
		},
		resources: getPlanetResourceProfileOrFallback(definition),
		rings: definition.rings?.enabled ?? false,
		moons: definition.moons.length,
		terrainSeed: definition.render.terrainSeed,
		climate: {
			seed: definition.climate?.seed ?? definition.render.climateSeed ?? 0,
			biomeSeed: definition.climate?.biomeSeed ?? definition.render.biomeSeed ?? 0,
			weatherSeed: definition.climate?.weatherSeed ?? definition.render.weatherSeed ?? 0,
			temperature01: definition.climate?.temperature01 ?? 0,
			humidity: definition.climate?.humidity ?? 0,
			aridity: definition.climate?.aridity ?? 0,
			windStrength: definition.climate?.windStrength ?? 0,
			stormActivity: definition.climate?.stormActivity ?? 0,
			cloudPersistence: definition.climate?.cloudPersistence ?? 0,
			ashLoad: definition.climate?.ashLoad ?? 0,
		},
		render: {
			enableTerrain: renderProfile?.enableTerrain ?? false,
			enableOcean: renderProfile?.enableOcean ?? false,
			enableClouds: renderProfile?.enableClouds ?? false,
			enableAtmosphere: renderProfile?.enableAtmosphere ?? false,
			enableRings: renderProfile?.enableRings ?? false,
			cloudCoverage: renderProfile?.cloudCoverage ?? 0,
			atmosphereDensity: renderProfile?.atmosphereDensity ?? 0,
			terrainRoughness: renderProfile?.terrainRoughness ?? 0,
			mountainScale: renderProfile?.mountainScale ?? 0,
			oceanLevel: renderProfile?.oceanLevel ?? 0,
		},
		surfaceProfile: {
			enabled: surfaceProfile?.enabled ?? false,
			palette: surfaceProfile?.palette ?? 'none',
			hasOcean: surfaceProfile?.hasOcean ?? false,
			hasIceCaps: surfaceProfile?.hasIceCaps ?? false,
			hasVolcanism: surfaceProfile?.hasVolcanism ?? false,
			hasTectonics: surfaceProfile?.hasTectonics ?? false,
			waterInfluence: surfaceProfile?.waterInfluence ?? 0,
			iceInfluence: surfaceProfile?.iceInfluence ?? 0,
			lavaInfluence: surfaceProfile?.lavaInfluence ?? 0,
			toxicInfluence: surfaceProfile?.toxicInfluence ?? 0,
			metalInfluence: surfaceProfile?.metalInfluence ?? 0,
			raymarchOcclusionStrength: surfaceProfile?.raymarchOcclusionStrength ?? 0,
		},
		nearSurfaceTerrain: nearSurfaceTerrain ?? createEmptyNearSurfaceTerrainStats(),
	};
}

export function createPlanetRenderFeatureStats(
	features: PlanetRenderFeatures,
	quality: 'moving' | 'idle',
	actualSteps: Partial<{
		clouds: number;
		atmosphere: number;
		surface: number;
	}> = {},
): PlanetRenderFeatureStats {
	return {
		clouds: {
			raymarched: features.raymarchedClouds,
			steps: actualSteps.clouds ?? features.cloudSteps[quality],
		},
		atmosphere: {
			raymarched: features.raymarchedAtmosphere,
			steps: actualSteps.atmosphere ?? features.atmosphereSteps[quality],
		},
		surface: {
			raymarched: features.raymarchedSurface,
			steps: actualSteps.surface ?? features.surfaceSteps[quality],
		},
	};
}

export function createPlanetTerrainTextureStats(
	terrainTextureSet: TerrainTextureSet | null,
	enabled: boolean,
): PlanetTerrainTextureStats {
	if (!terrainTextureSet) {
		return {
			available: false,
			enabled: false,
			resolution: 0,
			atlasWidth: 0,
			atlasHeight: 0,
			atlasColumns: 0,
			atlasRows: 0,
		};
	}

	const texture = terrainTextureSet.getDataAtlasTexture();
	const image = texture.image as {
		width?: number;
		height?: number;
	};

	return {
		available: true,
		enabled,
		resolution: terrainTextureSet.options.resolution,
		atlasWidth: image.width ?? 0,
		atlasHeight: image.height ?? 0,
		atlasColumns: terrainTextureSet.options.atlasColumns,
		atlasRows: terrainTextureSet.options.atlasRows,
	};
}

function createUnavailablePlanetDefinitionStats(): PlanetDefinitionStats {
	return {
		available: false,
		name: 'none',
		class: 'none',
		rendererKind: 'none',
		composition: {
			rock: 0,
			metal: 0,
			ice: 0,
			water: 0,
			gas: 0,
			organic: 0,
			volatiles: 0,
		},
		atmosphere: {
			type: 'none',
			cloudCoverage: 0,
			density: 0,
		},
		resources: createEmptyResourceProfile(),
		rings: false,
		moons: 0,
		terrainSeed: 0,
		climate: {
			seed: 0,
			biomeSeed: 0,
			weatherSeed: 0,
			temperature01: 0,
			humidity: 0,
			aridity: 0,
			windStrength: 0,
			stormActivity: 0,
			cloudPersistence: 0,
			ashLoad: 0,
		},
		render: {
			enableTerrain: false,
			enableOcean: false,
			enableClouds: false,
			enableAtmosphere: false,
			enableRings: false,
			cloudCoverage: 0,
			atmosphereDensity: 0,
			terrainRoughness: 0,
			mountainScale: 0,
			oceanLevel: 0,
		},
		surfaceProfile: {
			enabled: false,
			palette: 'none',
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: false,
			hasTectonics: false,
			waterInfluence: 0,
			iceInfluence: 0,
			lavaInfluence: 0,
			toxicInfluence: 0,
			metalInfluence: 0,
			raymarchOcclusionStrength: 0,
		},
		nearSurfaceTerrain: createEmptyNearSurfaceTerrainStats(),
	};
}

function getPlanetResourceProfileOrFallback(
	definition: PlanetDefinition,
): PlanetResourceProfile {
	return (
		(definition as Partial<PlanetDefinition>).resources ??
		createEmptyResourceProfile()
	);
}

function createEmptyResourceProfile(): PlanetResourceProfile {
	return {
		metal: 0,
		rareMaterials: 0,
		fuel: 0,
		water: 0,
		volatiles: 0,
		researchValue: 0,
		extractionDifficulty: 0,
	};
}

function createEmptyNearSurfaceTerrainStats(): PlanetNearSurfaceTerrainStats {
	return {
		enabled: false,
		visible: false,
		resolution: 0,
		patchSize: 0,
		height: 0,
	};
}
