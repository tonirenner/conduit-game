import type { PlanetMaterialComposition } from './PlanetComposition';

export type PlanetClass =
	| 'barren'
	| 'rocky'
	| 'terrestrial'
	| 'ocean'
	| 'desert'
	| 'ice'
	| 'lava'
	| 'toxic'
	| 'carbon'
	| 'metal_rich'
	| 'gas_giant'
	| 'ice_giant';

export type AtmosphereType =
	| 'none'
	| 'thin'
	| 'breathable'
	| 'toxic'
	| 'dense'
	| 'gas_giant';

export type PlanetPhysicalDefinition = {
	radius: number;
	mass: number;
	gravity: number;
	density: number;
	rotationSpeed: number;
	axialTilt: number;
};

export type PlanetOrbitDefinition = {
	semiMajorAxis: number;
	eccentricity: number;
	orbitalPeriod: number;
	starIrradiance: number;
	temperature: number;
};

export type PlanetAtmosphereDefinition = {
	type: AtmosphereType;
	density: number;
	pressure: number;
	cloudCoverage: number;
	haze: number;
	color: string;
};

export type PlanetSurfaceDefinition = {
	hasSolidSurface: boolean;
	hasOcean: boolean;
	hasIceCaps: boolean;
	hasVolcanism: boolean;
	hasTectonics: boolean;
	terrainRoughness: number;
	mountainScale: number;
	oceanLevel: number;
};

export type PlanetClimateDefinition = {
	seed: number;
	biomeSeed: number;
	weatherSeed: number;

	temperature01: number;
	humidity: number;
	aridity: number;
	windStrength: number;
	stormActivity: number;
	seasonality: number;
	cloudPersistence: number;
	ashLoad: number;
};

export type PlanetResourceProfile = {
	metal: number;
	rareMaterials: number;
	fuel: number;
	water: number;
	volatiles: number;
	researchValue: number;
	extractionDifficulty: number;
};

export type PlanetRingBandDefinition = {
	offset: number;
	width: number;
	density: number;
	color: string;
};

export type PlanetRingDefinition = {
	enabled: boolean;
	seed: number;
	innerRadius: number;
	outerRadius: number;
	density: number;
	opacity: number;
	composition: {
		ice: number;
		rock: number;
		dust: number;
	};
	bands: PlanetRingBandDefinition[];
};

export type PlanetMoonDefinition = {
	id: string;
	name: string;
	seed: number;
	class: PlanetClass;
	radius: number;
	orbitRadius: number;
	orbitPeriod: number;
	composition: PlanetMaterialComposition;
};

export type PlanetRenderSeeds = {
	paletteSeed: number;
	terrainSeed: number;
	cloudSeed: number;
	atmosphereSeed: number;
	ringSeed: number;
	climateSeed: number;
	biomeSeed: number;
	weatherSeed: number;
};

export type PlanetDefinition = {
	id: string;
	name: string;
	seed: number;

	class: PlanetClass;
	composition: PlanetMaterialComposition;

	physical: PlanetPhysicalDefinition;
	orbit: PlanetOrbitDefinition;
	atmosphere: PlanetAtmosphereDefinition;
	surface: PlanetSurfaceDefinition;
	climate: PlanetClimateDefinition;
	resources: PlanetResourceProfile;

	rings?: PlanetRingDefinition;
	moons: PlanetMoonDefinition[];

	render: PlanetRenderSeeds;
};
