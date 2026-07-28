import {
	normalizeComposition,
	type PlanetMaterialComposition,
} from '../model/PlanetComposition';

import {
	type PlanetAtmosphereDefinition,
	type PlanetClimateDefinition,
	type PlanetDefinition,
	type PlanetMoonDefinition,
	type PlanetOrbitDefinition,
	type PlanetPhysicalDefinition,
	type PlanetRingDefinition,
	type PlanetSurfaceDefinition,
} from '../model/PlanetDefinition';

import { SeededRandom } from './SeededRandom';
import { resolvePlanetClass } from './PlanetClassResolver';

export type PlanetGenerationOptions = {
	id?: string;
	name?: string;
	semiMajorAxis?: number;
	starIrradiance?: number;
	forceGasGiant?: boolean;
	forceRings?: boolean;
};

export function generatePlanetDefinition(
	seed: number,
	options: PlanetGenerationOptions = {},
): PlanetDefinition {
	const random = new SeededRandom(seed);

	const orbit = generateOrbit(random, options);
	const composition = generateComposition(random, orbit.temperature, options);
	const planetClass = resolvePlanetClass(composition, orbit.temperature);

	const physical = generatePhysical(random, composition, planetClass);
	const atmosphere = generateAtmosphere(random, composition, planetClass);
	const surface = generateSurface(random, composition, planetClass);

	const climateSeed = random.childSeed();
	const biomeSeed = random.childSeed();
	const weatherSeed = random.childSeed();

	const climate = generateClimate(
		new SeededRandom(climateSeed),
		orbit,
		composition,
		atmosphere,
		surface,
		planetClass,
		climateSeed,
		biomeSeed,
		weatherSeed,
	);

	const rings = generateRings(random, physical.radius, planetClass, options);
	const moons = generateMoons(random, physical.radius, planetClass);

	return {
		id: options.id ?? `planet-${seed}`,
		name: options.name ?? createPlanetName(random),
		seed,

		class: planetClass,
		composition,

		physical,
		orbit,
		atmosphere,
		surface,
		climate,

		rings,
		moons,

		render: {
			paletteSeed: random.childSeed(),
			terrainSeed: random.childSeed(),
			cloudSeed: random.childSeed(),
			atmosphereSeed: random.childSeed(),
			ringSeed: random.childSeed(),
			climateSeed,
			biomeSeed,
			weatherSeed,
		},
	};
}

function generateClimate(
	random: SeededRandom,
	orbit: PlanetOrbitDefinition,
	composition: PlanetMaterialComposition,
	atmosphere: PlanetAtmosphereDefinition,
	surface: PlanetSurfaceDefinition,
	planetClass: string,
	climateSeed: number,
	biomeSeed: number,
	weatherSeed: number,
): PlanetClimateDefinition {
	const temperature01 = clamp01(
		(orbit.temperature - 120) / 760,
	);

	const waterHumidity =
		      composition.water * 1.35 +
		      (surface.hasOcean ? 0.25 : 0.0) +
		      atmosphere.cloudCoverage * 0.30;

	const volcanicDryness =
		      planetClass === 'lava'
		      ? 0.48
		      : 0.0;

	const humidity = clamp01(
		waterHumidity -
		volcanicDryness +
		random.range(-0.08, 0.08),
	);

	const aridity = clamp01(
		1.0 -
		humidity * 0.72 +
		temperature01 * 0.35 -
		composition.ice * 0.20 +
		random.range(-0.08, 0.08),
	);

	const atmosphereStrength = clamp01(
		atmosphere.density / 2.5,
	);

	const windStrength = clamp01(
		atmosphereStrength * 0.55 +
		orbit.eccentricity * 1.35 +
		random.range(0.08, 0.40),
	);

	const stormActivity = clamp01(
		atmosphere.cloudCoverage * 0.55 +
		windStrength * 0.30 +
		composition.volatiles * 0.45 +
		random.range(-0.08, 0.18),
	);

	const seasonality = clamp01(
		orbit.eccentricity * 2.25 +
		random.range(0.02, 0.28),
	);

	const cloudPersistence = clamp01(
		atmosphere.cloudCoverage * 0.78 +
		humidity * 0.28 +
		stormActivity * 0.18,
	);

	const ashLoad = clamp01(
		planetClass === 'lava'
		? 0.58 + random.range(0.08, 0.30)
		: surface.hasVolcanism
		  ? 0.18 + random.range(0.05, 0.22)
		  : random.range(0.00, 0.05),
	);

	return {
		seed: climateSeed,
		biomeSeed,
		weatherSeed,
		temperature01,
		humidity,
		aridity,
		windStrength,
		stormActivity,
		seasonality,
		cloudPersistence,
		ashLoad,
	};
}

function generateComposition(
	random: SeededRandom,
	temperature: number,
	options: PlanetGenerationOptions,
): PlanetMaterialComposition {
	if (options.forceGasGiant) {
		return normalizeComposition({
			                            rock: random.range(0.02, 0.08),
			                            metal: random.range(0.01, 0.05),
			                            ice: random.range(0.02, 0.12),
			                            water: random.range(0.00, 0.04),
			                            gas: random.range(0.68, 0.88),
			                            organic: random.range(0.00, 0.01),
			                            volatiles: random.range(0.04, 0.16),
		                            });
	}

	const coldBoost = temperature < 220 ? 1.0 : 0.0;
	const hotBoost = temperature > 520 ? 1.0 : 0.0;
	const habitableBoost =
		      temperature >= 235 && temperature <= 325 ? 1.0 : 0.0;

	return normalizeComposition({
		                            rock: random.range(0.28, 0.66),
		                            metal: random.range(0.06, 0.26),
		                            ice: random.range(0.00, 0.22 + coldBoost * 0.38),
		                            water: random.range(0.00, 0.28 + habitableBoost * 0.18),
		                            gas: random.range(0.00, 0.10),
		                            organic: random.range(0.00, 0.10 + habitableBoost * 0.08),
		                            volatiles: random.range(0.00, 0.16 + hotBoost * 0.08),
	                            });
}

function generateOrbit(
	random: SeededRandom,
	options: PlanetGenerationOptions,
): PlanetOrbitDefinition {
	const semiMajorAxis = options.semiMajorAxis ?? random.range(0.25, 12.0);
	const starIrradiance = options.starIrradiance ?? 1.0;

	const temperature =
		      278 *
		      Math.pow(starIrradiance, 0.25) /
		      Math.sqrt(semiMajorAxis);

	return {
		semiMajorAxis,
		eccentricity: random.range(0.0, 0.18),
		orbitalPeriod: Math.sqrt(semiMajorAxis ** 3),
		starIrradiance,
		temperature,
	};
}

function generatePhysical(
	random: SeededRandom,
	composition: PlanetMaterialComposition,
	planetClass: string,
): PlanetPhysicalDefinition {
	const gasGiant =
		      planetClass === 'gas_giant' ||
		      planetClass === 'ice_giant';

	const radius = gasGiant
	               ? random.range(8.0, 18.0)
	               : random.range(0.35, 2.4);

	const density =
		      composition.metal * 7.8 +
		      composition.rock * 3.8 +
		      composition.ice * 1.2 +
		      composition.water * 1.0 +
		      composition.gas * 0.25 +
		      composition.volatiles * 1.6 +
		      composition.organic * 1.1;

	const mass = Math.max(
		0.02,
		density * Math.pow(radius, 3) / 5.5,
	);

	return {
		radius,
		mass,
		gravity: mass / Math.max(0.01, radius * radius),
		density,
		rotationSpeed: random.range(0.08, 1.80),
		axialTilt: random.range(0, 32),
	};
}

function generateAtmosphere(
	random: SeededRandom,
	composition: PlanetMaterialComposition,
	planetClass: string,
): PlanetAtmosphereDefinition {
	if (planetClass === 'gas_giant' || planetClass === 'ice_giant') {
		return {
			type: 'gas_giant',
			density: random.range(1.4, 3.2),
			pressure: random.range(20, 260),
			cloudCoverage: random.range(0.72, 1.0),
			haze: random.range(0.55, 1.0),
			color: planetClass === 'ice_giant' ? '#9ecaff' : '#d8b07a',
		};
	}

	const atmospherePotential =
		      composition.gas * 2.2 +
		      composition.volatiles * 1.6 +
		      composition.water * 0.45;

	if (atmospherePotential < 0.12) {
		return {
			type: 'none',
			density: 0,
			pressure: 0,
			cloudCoverage: 0,
			haze: 0,
			color: '#000000',
		};
	}

	const toxic = composition.volatiles > 0.18;
	const breathable =
		      composition.water > 0.12 &&
		      composition.organic > 0.05 &&
		      !toxic;

	return {
		type: toxic ? 'toxic' : breathable ? 'breathable' : 'thin',
		density: random.range(0.18, 1.65),
		pressure: random.range(0.12, 3.5),
		cloudCoverage: random.range(0.05, 0.72),
		haze: random.range(0.02, 0.55),
		color: toxic ? '#a6b86a' : '#8ec5ff',
	};
}

function generateSurface(
	random: SeededRandom,
	composition: PlanetMaterialComposition,
	planetClass: string,
): PlanetSurfaceDefinition {
	const hasSolidSurface =
		      planetClass !== 'gas_giant' &&
		      planetClass !== 'ice_giant';

	if (!hasSolidSurface) {
		return {
			hasSolidSurface: false,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: false,
			hasTectonics: false,
			terrainRoughness: 0,
			mountainScale: 0,
			oceanLevel: 0,
		};
	}

	return {
		hasSolidSurface: true,
		hasOcean: composition.water > 0.12,
		hasIceCaps: composition.ice > 0.10,
		hasVolcanism:
			planetClass === 'lava' ||
			(composition.rock + composition.metal > 0.70 &&
			 random.chance(0.35)),
		hasTectonics:
			planetClass === 'terrestrial' ||
			(composition.water > 0.08 && random.chance(0.45)),
		terrainRoughness: random.range(0.25, 1.0),
		mountainScale: random.range(0.18, 1.25),
		oceanLevel: composition.water > 0.12
		            ? random.range(0.35, 0.68)
		            : random.range(0.02, 0.18),
	};
}

function generateRings(
	random: SeededRandom,
	planetRadius: number,
	planetClass: string,
	options: PlanetGenerationOptions,
): PlanetRingDefinition | undefined {
	const ringChance =
		      options.forceRings ||
		      planetClass === 'gas_giant' ||
		      planetClass === 'ice_giant'
		      ? 0.65
		      : 0.08;

	if (!options.forceRings && !random.chance(ringChance)) {
		return undefined;
	}

	const innerRadius = planetRadius * random.range(1.45, 2.15);
	const outerRadius = innerRadius * random.range(1.35, 2.50);

	return {
		enabled: true,
		seed: random.childSeed(),
		innerRadius,
		outerRadius,
		density: random.range(0.25, 1.0),
		opacity: random.range(0.20, 0.72),
		composition: {
			ice: random.range(0.25, 0.82),
			rock: random.range(0.10, 0.55),
			dust: random.range(0.05, 0.42),
		},
		bands: Array.from({
			                  length: random.int(4, 11),
		                  }).map(() => ({
			offset: random.range(0, 1),
			width: random.range(0.015, 0.12),
			density: random.range(0.18, 1.0),
			color: random.pick([
				                   '#d9d1bd',
				                   '#b8aa91',
				                   '#e8e4d8',
				                   '#8c8172',
			                   ]),
		})),
	};
}

function generateMoons(
	random: SeededRandom,
	planetRadius: number,
	planetClass: string,
): PlanetMoonDefinition[] {
	const maxMoons =
		      planetClass === 'gas_giant' ||
		      planetClass === 'ice_giant'
		      ? random.int(4, 14)
		      : random.int(0, 3);

	return Array.from({
		                  length: maxMoons,
	                  }).map((_, index) => {
		const seed = random.childSeed();

		return {
			id: `moon-${seed}`,
			name: `Moon ${index + 1}`,
			seed,
			class: random.pick([
				                   'barren',
				                   'rocky',
				                   'ice',
			                   ]),
			radius: random.range(0.04, 0.38) * planetRadius,
			orbitRadius: planetRadius * random.range(3.0, 24.0),
			orbitPeriod: random.range(0.8, 90.0),
			composition: normalizeComposition({
				                                  rock: random.range(0.28, 0.74),
				                                  metal: random.range(0.04, 0.20),
				                                  ice: random.range(0.00, 0.55),
				                                  water: random.range(0.00, 0.10),
				                                  gas: 0,
				                                  organic: 0,
				                                  volatiles: random.range(0.00, 0.12),
			                                  }),
		};
	});
}

function createPlanetName(random: SeededRandom): string {
	const prefix = random.pick([
		                           'Astra',
		                           'Noma',
		                           'Vel',
		                           'Oris',
		                           'Kyra',
		                           'Eos',
		                           'Mira',
		                           'Thal',
		                           'Rhea',
		                           'Khar',
	                           ]);

	const suffix = random.pick([
		                           'Prime',
		                           'VII',
		                           'Minor',
		                           'Major',
		                           'B',
		                           'C',
		                           'Nova',
		                           'Reach',
		                           'Drift',
	                           ]);

	return `${prefix} ${suffix}`;
}

function clamp01(value: number): number {
	return Math.min(
		1,
		Math.max(0, value),
	);
}
