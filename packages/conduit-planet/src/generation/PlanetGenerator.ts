import {
	normalizeComposition,
	type PlanetMaterialComposition,
} from '@conduit/planet/model';

import {
	type PlanetAtmosphereDefinition,
	type PlanetClass,
	type PlanetClimateDefinition,
	type PlanetDefinition,
	type PlanetMoonDefinition,
	type PlanetOrbitDefinition,
	type PlanetPhysicalDefinition,
	type PlanetRingDefinition,
	type PlanetSurfaceDefinition,
} from '@conduit/planet/model';

import { SeededRandom } from './SeededRandom';
import { resolvePlanetClass } from './PlanetClassResolver';
import { generatePlanetResourceProfile } from './PlanetResourceGenerator';

export type PlanetGenerationOptions = {
	id?: string;
	name?: string;
	semiMajorAxis?: number;
	starIrradiance?: number;
	forceGasGiant?: boolean;
	forcePlanetClass?: PlanetClass;
	forceRings?: boolean;
};

export function generatePlanetDefinition(
	seed: number,
	options: PlanetGenerationOptions = {},
): PlanetDefinition {
	const random = new SeededRandom(seed);

	const orbit = generateOrbit(random, options);
	const composition = generateComposition(random, orbit.temperature, options);
	const planetClass: PlanetClass =
		      options.forcePlanetClass ??
		      (
			      options.forceGasGiant
			      ? 'gas_giant'
			      : resolvePlanetClass(composition, orbit.temperature)
		      );

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
	const resources = generatePlanetResourceProfile({
		planetClass,
		composition,
		atmosphere,
		surface,
		climate,
	});

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
		resources,

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
	let temperature01 = clamp01(
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

	let humidity = clamp01(
		waterHumidity -
		volcanicDryness +
		random.range(-0.08, 0.08),
	);

	let aridity = clamp01(
		1.0 -
		humidity * 0.72 +
		temperature01 * 0.35 -
		composition.ice * 0.20 +
		random.range(-0.08, 0.08),
	);

	const atmosphereStrength = clamp01(
		atmosphere.density / 2.5,
	);

	let windStrength = clamp01(
		atmosphereStrength * 0.55 +
		orbit.eccentricity * 1.35 +
		random.range(0.08, 0.40),
	);

	let stormActivity = clamp01(
		atmosphere.cloudCoverage * 0.55 +
		windStrength * 0.30 +
		composition.volatiles * 0.45 +
		random.range(-0.08, 0.18),
	);

	let seasonality = clamp01(
		orbit.eccentricity * 2.25 +
		random.range(0.02, 0.28),
	);

	let cloudPersistence = clamp01(
		atmosphere.cloudCoverage * 0.78 +
		humidity * 0.28 +
		stormActivity * 0.18,
	);

	let ashLoad = clamp01(
		planetClass === 'lava'
		? 0.58 + random.range(0.08, 0.30)
		: surface.hasVolcanism
		  ? 0.18 + random.range(0.05, 0.22)
		  : random.range(0.00, 0.05),
	);

	const classClimate = getClassClimateProfile(
		random,
		planetClass,
	);

	temperature01 = clamp01(
		temperature01 * classClimate.temperatureScale +
		classClimate.temperatureOffset,
	);

	humidity = clamp01(
		humidity * classClimate.humidityScale +
		classClimate.humidityOffset,
	);

	aridity = clamp01(
		aridity * classClimate.aridityScale +
		classClimate.aridityOffset,
	);

	windStrength = clamp01(
		windStrength * classClimate.windScale +
		classClimate.windOffset,
	);

	stormActivity = clamp01(
		stormActivity * classClimate.stormScale +
		classClimate.stormOffset,
	);

	seasonality = clamp01(
		seasonality * classClimate.seasonalityScale +
		classClimate.seasonalityOffset,
	);

	cloudPersistence = clamp01(
		cloudPersistence * classClimate.cloudScale +
		classClimate.cloudOffset,
	);

	ashLoad = clamp01(
		ashLoad * classClimate.ashScale +
		classClimate.ashOffset,
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

type ClassClimateProfile = {
	temperatureScale: number;
	temperatureOffset: number;
	humidityScale: number;
	humidityOffset: number;
	aridityScale: number;
	aridityOffset: number;
	windScale: number;
	windOffset: number;
	stormScale: number;
	stormOffset: number;
	seasonalityScale: number;
	seasonalityOffset: number;
	cloudScale: number;
	cloudOffset: number;
	ashScale: number;
	ashOffset: number;
};

function getClassClimateProfile(
	random: SeededRandom,
	planetClass: string,
): ClassClimateProfile {
	const base: ClassClimateProfile = {
		temperatureScale: 1.0,
		temperatureOffset: 0.0,
		humidityScale: 1.0,
		humidityOffset: 0.0,
		aridityScale: 1.0,
		aridityOffset: 0.0,
		windScale: 1.0,
		windOffset: 0.0,
		stormScale: 1.0,
		stormOffset: 0.0,
		seasonalityScale: 1.0,
		seasonalityOffset: 0.0,
		cloudScale: 1.0,
		cloudOffset: 0.0,
		ashScale: 1.0,
		ashOffset: 0.0,
	};

	switch (planetClass) {
		case 'barren':
			return {
				...base,
				humidityScale: 0.08,
				aridityScale: 0.85,
				aridityOffset: 0.30,
				windScale: 0.35,
				stormScale: 0.10,
				cloudScale: 0.05,
				ashScale: 0.20,
			};

		case 'rocky':
			return {
				...base,
				humidityScale: 0.20,
				aridityScale: 0.90,
				aridityOffset: 0.18,
				windScale: 0.55,
				stormScale: 0.20,
				cloudScale: 0.14,
				ashScale: 0.30,
			};

		case 'terrestrial':
			return {
				...base,
				temperatureScale: 0.86,
				temperatureOffset: 0.08,
				humidityScale: 0.92,
				humidityOffset: 0.10,
				aridityScale: 0.62,
				windScale: 0.90,
				stormScale: 0.88,
				cloudScale: 0.90,
				cloudOffset: 0.10,
			};

		case 'ocean':
			return {
				...base,
				temperatureScale: 0.82,
				temperatureOffset: 0.07,
				humidityScale: 0.72,
				humidityOffset: 0.38,
				aridityScale: 0.22,
				windScale: 1.10,
				windOffset: 0.10,
				stormScale: 1.18,
				stormOffset: 0.18,
				cloudScale: 0.92,
				cloudOffset: 0.28,
				ashScale: 0.0,
			};

		case 'desert':
			return {
				...base,
				temperatureScale: 0.94,
				temperatureOffset: 0.13,
				humidityScale: 0.10,
				aridityScale: 0.70,
				aridityOffset: 0.42,
				windScale: 1.12,
				windOffset: 0.10,
				stormScale: 0.50,
				stormOffset: 0.06,
				cloudScale: 0.14,
				ashScale: 0.25,
			};

		case 'ice':
			return {
				...base,
				temperatureScale: 0.20,
				temperatureOffset: random.range(0.02, 0.07),
				humidityScale: 0.32,
				humidityOffset: 0.08,
				aridityScale: 0.56,
				aridityOffset: 0.34,
				windScale: 0.95,
				windOffset: 0.06,
				stormScale: 0.44,
				stormOffset: 0.08,
				seasonalityScale: 1.15,
				seasonalityOffset: 0.08,
				cloudScale: 0.24,
				cloudOffset: 0.04,
				ashScale: 0.0,
			};

		case 'lava':
			return {
				...base,
				temperatureScale: 0.35,
				temperatureOffset: 0.68,
				humidityScale: 0.03,
				aridityScale: 0.72,
				aridityOffset: 0.42,
				windScale: 0.95,
				windOffset: 0.12,
				stormScale: 0.75,
				stormOffset: 0.16,
				cloudScale: 0.42,
				cloudOffset: 0.10,
				ashScale: 0.65,
				ashOffset: 0.30,
			};

		case 'toxic':
			return {
				...base,
				temperatureScale: 0.92,
				temperatureOffset: 0.10,
				humidityScale: 0.65,
				humidityOffset: 0.12,
				aridityScale: 0.36,
				aridityOffset: 0.16,
				windScale: 1.05,
				windOffset: 0.08,
				stormScale: 1.10,
				stormOffset: 0.16,
				cloudScale: 0.88,
				cloudOffset: 0.22,
				ashScale: 0.40,
			};

		case 'carbon':
			return {
				...base,
				humidityScale: 0.20,
				aridityScale: 0.86,
				aridityOffset: 0.18,
				windScale: 0.52,
				stormScale: 0.22,
				cloudScale: 0.18,
				ashScale: 0.18,
			};

		case 'metal_rich':
			return {
				...base,
				humidityScale: 0.08,
				aridityScale: 0.90,
				aridityOffset: 0.24,
				windScale: 0.42,
				stormScale: 0.14,
				cloudScale: 0.08,
				ashScale: 0.20,
			};

		case 'gas_giant':
			return {
				...base,
				humidityScale: 0.70,
				humidityOffset: 0.16,
				aridityScale: 0.0,
				windScale: 1.30,
				windOffset: 0.16,
				stormScale: 1.20,
				stormOffset: 0.24,
				cloudScale: 0.90,
				cloudOffset: 0.36,
				ashScale: 0.0,
			};

		case 'ice_giant':
			return {
				...base,
				temperatureScale: 0.45,
				temperatureOffset: 0.04,
				humidityScale: 0.54,
				humidityOffset: 0.14,
				aridityScale: 0.0,
				windScale: 1.10,
				windOffset: 0.12,
				stormScale: 0.82,
				stormOffset: 0.16,
				cloudScale: 0.82,
				cloudOffset: 0.26,
				ashScale: 0.0,
			};

		default:
			return base;
	}
}

function generateComposition(
	random: SeededRandom,
	temperature: number,
	options: PlanetGenerationOptions,
): PlanetMaterialComposition {
	if (options.forcePlanetClass) {
		return generateCompositionForClass(
			random,
			options.forcePlanetClass,
		);
	}

	if (options.forceGasGiant) {
		return generateCompositionForClass(
			random,
			'gas_giant',
		);
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

function generateCompositionForClass(
	random: SeededRandom,
	planetClass: PlanetClass,
): PlanetMaterialComposition {
	switch (planetClass) {
		case 'barren':
			return normalizeComposition({
				                            rock: random.range(0.68, 0.86),
				                            metal: random.range(0.10, 0.24),
				                            ice: random.range(0.00, 0.03),
				                            water: random.range(0.00, 0.02),
				                            gas: random.range(0.00, 0.01),
				                            organic: random.range(0.00, 0.01),
				                            volatiles: random.range(0.00, 0.02),
			                            });

		case 'rocky':
			return normalizeComposition({
				                            rock: random.range(0.58, 0.78),
				                            metal: random.range(0.10, 0.28),
				                            ice: random.range(0.00, 0.08),
				                            water: random.range(0.00, 0.06),
				                            gas: random.range(0.00, 0.03),
				                            organic: random.range(0.00, 0.03),
				                            volatiles: random.range(0.02, 0.08),
			                            });

		case 'terrestrial':
			return normalizeComposition({
				                            rock: random.range(0.36, 0.54),
				                            metal: random.range(0.10, 0.22),
				                            ice: random.range(0.00, 0.08),
				                            water: random.range(0.16, 0.30),
				                            gas: random.range(0.03, 0.08),
				                            organic: random.range(0.04, 0.12),
				                            volatiles: random.range(0.04, 0.12),
			                            });

		case 'ocean':
			return normalizeComposition({
				                            rock: random.range(0.22, 0.42),
				                            metal: random.range(0.05, 0.15),
				                            ice: random.range(0.00, 0.08),
				                            water: random.range(0.36, 0.58),
				                            gas: random.range(0.03, 0.08),
				                            organic: random.range(0.02, 0.08),
				                            volatiles: random.range(0.04, 0.12),
			                            });

		case 'desert':
			return normalizeComposition({
				                            rock: random.range(0.54, 0.74),
				                            metal: random.range(0.08, 0.20),
				                            ice: random.range(0.00, 0.02),
				                            water: random.range(0.00, 0.035),
				                            gas: random.range(0.02, 0.07),
				                            organic: random.range(0.00, 0.02),
				                            volatiles: random.range(0.06, 0.14),
			                            });

		case 'ice':
			return normalizeComposition({
				                            rock: random.range(0.18, 0.36),
				                            metal: random.range(0.03, 0.12),
				                            ice: random.range(0.42, 0.64),
				                            water: random.range(0.04, 0.16),
				                            gas: random.range(0.01, 0.05),
				                            organic: random.range(0.00, 0.03),
				                            volatiles: random.range(0.06, 0.18),
			                            });

		case 'lava':
			return normalizeComposition({
				                            rock: random.range(0.58, 0.76),
				                            metal: random.range(0.14, 0.30),
				                            ice: 0,
				                            water: 0,
				                            gas: random.range(0.00, 0.04),
				                            organic: 0,
				                            volatiles: random.range(0.08, 0.18),
			                            });

		case 'toxic':
			return normalizeComposition({
				                            rock: random.range(0.34, 0.54),
				                            metal: random.range(0.06, 0.18),
				                            ice: random.range(0.00, 0.06),
				                            water: random.range(0.04, 0.16),
				                            gas: random.range(0.04, 0.12),
				                            organic: random.range(0.00, 0.04),
				                            volatiles: random.range(0.22, 0.38),
			                            });

		case 'carbon':
			return normalizeComposition({
				                            rock: random.range(0.32, 0.54),
				                            metal: random.range(0.04, 0.14),
				                            ice: random.range(0.00, 0.08),
				                            water: random.range(0.00, 0.08),
				                            gas: random.range(0.01, 0.05),
				                            organic: random.range(0.18, 0.34),
				                            volatiles: random.range(0.04, 0.14),
			                            });

		case 'metal_rich':
			return normalizeComposition({
				                            rock: random.range(0.26, 0.46),
				                            metal: random.range(0.38, 0.58),
				                            ice: random.range(0.00, 0.03),
				                            water: random.range(0.00, 0.04),
				                            gas: random.range(0.00, 0.03),
				                            organic: random.range(0.00, 0.01),
				                            volatiles: random.range(0.00, 0.05),
			                            });

		case 'gas_giant':
			return normalizeComposition({
				                            rock: random.range(0.02, 0.08),
				                            metal: random.range(0.01, 0.05),
				                            ice: random.range(0.02, 0.12),
				                            water: random.range(0.00, 0.04),
				                            gas: random.range(0.68, 0.88),
				                            organic: random.range(0.00, 0.01),
				                            volatiles: random.range(0.04, 0.16),
			                            });

		case 'ice_giant':
			return normalizeComposition({
				                            rock: random.range(0.01, 0.05),
				                            metal: random.range(0.01, 0.04),
				                            ice: random.range(0.14, 0.28),
				                            water: random.range(0.02, 0.08),
				                            gas: random.range(0.58, 0.76),
				                            organic: random.range(0.00, 0.01),
				                            volatiles: random.range(0.12, 0.24),
			                            });
	}
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

	if (planetClass === 'ice') {
		return {
			type: 'thin',
			density: random.range(0.08, 0.26),
			pressure: random.range(0.04, 0.32),
			cloudCoverage: random.range(0.02, 0.14),
			haze: random.range(0.04, 0.18),
			color: '#c8e8ff',
		};
	}

	if (planetClass === 'barren' || planetClass === 'metal_rich') {
		const hasTraceAtmosphere = random.chance(
			planetClass === 'metal_rich' ? 0.22 : 0.16,
		);

		return {
			type: hasTraceAtmosphere ? 'thin' : 'none',
			density: hasTraceAtmosphere ? random.range(0.015, 0.09) : 0,
			pressure: hasTraceAtmosphere ? random.range(0.005, 0.06) : 0,
			cloudCoverage: 0,
			haze: hasTraceAtmosphere ? random.range(0.01, 0.06) : 0,
			color: hasTraceAtmosphere ? '#9aa3aa' : '#000000',
		};
	}

	if (planetClass === 'rocky') {
		return {
			type: random.chance(0.38) ? 'thin' : 'none',
			density: random.range(0.00, 0.22),
			pressure: random.range(0.00, 0.18),
			cloudCoverage: random.range(0.00, 0.08),
			haze: random.range(0.00, 0.16),
			color: '#8f9aa4',
		};
	}

	if (planetClass === 'desert') {
		return {
			type: 'thin',
			density: random.range(0.12, 0.56),
			pressure: random.range(0.08, 0.75),
			cloudCoverage: random.range(0.01, 0.14),
			haze: random.range(0.18, 0.48),
			color: '#d8a96b',
		};
	}

	if (planetClass === 'ocean') {
		return {
			type: random.chance(0.62) ? 'breathable' : 'dense',
			density: random.range(0.82, 1.95),
			pressure: random.range(0.85, 3.2),
			cloudCoverage: random.range(0.48, 0.86),
			haze: random.range(0.10, 0.34),
			color: '#8ecfff',
		};
	}

	if (planetClass === 'terrestrial') {
		return {
			type: 'breathable',
			density: random.range(0.62, 1.35),
			pressure: random.range(0.55, 1.60),
			cloudCoverage: random.range(0.22, 0.56),
			haze: random.range(0.04, 0.24),
			color: '#8ec5ff',
		};
	}

	if (planetClass === 'lava') {
		return {
			type: random.chance(0.42) ? 'dense' : 'toxic',
			density: random.range(0.18, 0.72),
			pressure: random.range(0.12, 1.55),
			cloudCoverage: random.range(0.10, 0.34),
			haze: random.range(0.22, 0.58),
			color: '#d65a32',
		};
	}

	if (planetClass === 'toxic') {
		return {
			type: 'toxic',
			density: random.range(1.45, 2.95),
			pressure: random.range(1.8, 8.5),
			cloudCoverage: random.range(0.62, 0.98),
			haze: random.range(0.66, 1.0),
			color: '#c4c79a',
		};
	}

	if (planetClass === 'carbon') {
		return {
			type: random.chance(0.42) ? 'thin' : 'none',
			density: random.range(0.00, 0.26),
			pressure: random.range(0.00, 0.22),
			cloudCoverage: random.range(0.00, 0.10),
			haze: random.range(0.02, 0.18),
			color: '#7c6a62',
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

	if (planetClass === 'ice') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: true,
			hasVolcanism: false,
			hasTectonics: false,
			terrainRoughness: random.range(0.18, 0.56),
			mountainScale: random.range(0.16, 0.72),
			oceanLevel: -0.35,
		};
	}

	if (planetClass === 'ocean') {
		return {
			hasSolidSurface: true,
			hasOcean: true,
			hasIceCaps: composition.ice > 0.12,
			hasVolcanism: random.chance(0.12),
			hasTectonics: random.chance(0.52),
			terrainRoughness: random.range(0.10, 0.34),
			mountainScale: random.range(0.05, 0.30),
			oceanLevel: random.range(0.72, 0.92),
		};
	}

	if (planetClass === 'terrestrial') {
		return {
			hasSolidSurface: true,
			hasOcean: true,
			hasIceCaps: composition.ice > 0.06 || random.chance(0.46),
			hasVolcanism: random.chance(0.28),
			hasTectonics: true,
			terrainRoughness: random.range(0.32, 0.74),
			mountainScale: random.range(0.32, 0.92),
			oceanLevel: random.range(0.38, 0.64),
		};
	}

	if (planetClass === 'desert') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: random.chance(0.10),
			hasTectonics: random.chance(0.22),
			terrainRoughness: random.range(0.22, 0.58),
			mountainScale: random.range(0.16, 0.56),
			oceanLevel: random.range(-0.58, -0.22),
		};
	}

	if (planetClass === 'barren') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: false,
			hasTectonics: false,
			terrainRoughness: random.range(0.62, 1.0),
			mountainScale: random.range(0.48, 1.18),
			oceanLevel: random.range(-0.78, -0.44),
		};
	}

	if (planetClass === 'rocky') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: composition.ice > 0.06 && random.chance(0.20),
			hasVolcanism: random.chance(0.12),
			hasTectonics: random.chance(0.18),
			terrainRoughness: random.range(0.50, 0.92),
			mountainScale: random.range(0.52, 1.26),
			oceanLevel: random.range(-0.62, -0.28),
		};
	}

	if (planetClass === 'toxic') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: random.chance(0.24),
			hasTectonics: random.chance(0.26),
			terrainRoughness: random.range(0.16, 0.48),
			mountainScale: random.range(0.10, 0.54),
			oceanLevel: random.range(0.22, 0.54),
		};
	}

	if (planetClass === 'carbon') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: random.chance(0.08),
			hasTectonics: random.chance(0.10),
			terrainRoughness: random.range(0.34, 0.82),
			mountainScale: random.range(0.22, 0.74),
			oceanLevel: random.range(-0.66, -0.32),
		};
	}

	if (planetClass === 'metal_rich') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: random.chance(0.22),
			hasTectonics: random.chance(0.16),
			terrainRoughness: random.range(0.52, 0.96),
			mountainScale: random.range(0.74, 1.42),
			oceanLevel: random.range(-0.76, -0.42),
		};
	}

	if (planetClass === 'lava') {
		return {
			hasSolidSurface: true,
			hasOcean: false,
			hasIceCaps: false,
			hasVolcanism: true,
			hasTectonics: true,
			terrainRoughness: random.range(0.72, 1.0),
			mountainScale: random.range(1.05, 1.68),
			oceanLevel: -1.0,
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
