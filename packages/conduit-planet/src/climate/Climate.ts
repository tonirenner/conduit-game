import * as THREE from 'three';
import type { PlanetClimateDefinition } from '../model';

import {
	clamp01,
	mixRgb,
	sampleFbm3D as fbm,
	smoothstep,
} from '../internal/ProceduralMath';

export type BiomeId =
	| 'deepOcean'
	| 'shallowOcean'
	| 'coast'
	| 'ice'
	| 'tundra'
	| 'borealForest'
	| 'temperateForest'
	| 'rainforest'
	| 'grassland'
	| 'savanna'
	| 'desert'
	| 'dryHills'
	| 'mountain'
	| 'snow';

export type ClimateSample = {
	latitude: number;
	latitudeAbs: number;
	height: number;
	landMask: number;

	temperature: number;
	humidity: number;
	aridity: number;
	vegetation: number;
	snow: number;
	cloudPotential: number;
	pressure: number;
	windBand: number;

	biome: BiomeId;
	biomeColor: number;
};

export type ClimateDebugMode =
	| 'biome'
	| 'temperature'
	| 'humidity'
	| 'aridity'
	| 'vegetation'
	| 'snow'
	| 'cloudPotential'
	| 'pressure'
	| 'height'
	| 'landMask';

export const CLIMATE_DEBUG_MODES: ClimateDebugMode[] = [
	'biome',
	'temperature',
	'humidity',
	'aridity',
	'vegetation',
	'snow',
	'cloudPotential',
	'pressure',
	'height',
	'landMask',
];

const BIOME_COLORS: Record<BiomeId, number> = {
	deepOcean: 0x071f2f,
	shallowOcean: 0x155463,
	coast: 0x607052,

	ice: 0xc8d2d6,
	tundra: 0x8b9278,
	borealForest: 0x3f5f3d,
	temperateForest: 0x3e733d,
	rainforest: 0x24783d,
	grassland: 0x6f8546,
	savanna: 0x9a8147,
	desert: 0xb28b55,
	dryHills: 0x776a4b,
	mountain: 0x6f6d61,
	snow: 0xd6d8cf,
};

/**
 * Deterministic local climate sample.
 *
 * Passing a PlanetClimateDefinition enables the canonical per-planet climate
 * identity. The optional argument preserves the historical renderer-independent
 * sample contract for direct callers while PlanetTerrainSampler supplies the
 * generated definition.
 *
 * Phase 4 currently owns:
 * - climate.seed: spatial identity for the temperature noise field
 * - climate.temperature01: global temperature baseline
 * - climate.humidity: global humidity baseline
 * - climate.aridity: global aridity baseline
 * - climate.biomeSeed: ecological variation within plausible land-biome zones
 *
 * Weather integration is wired in a later isolated step.
 */
export function getClimateSample(
	normal: THREE.Vector3,
	height: number,
	landMask: number,
	climate?: PlanetClimateDefinition,
): ClimateSample {
	const latitude = Math.asin(clamp01Signed(normal.y));
	const latitudeAbs = Math.abs(normal.y);

	const altitude = clamp01(height / 0.28);
	const ocean = 1 - landMask;

	const coast =
		      1 -
		      Math.abs(landMask * 2 - 1);

	const coastInfluence = clamp01(coast);

	const equatorWarmth =
		      1 -
		      smoothstep(0.12, 0.98, latitudeAbs);

	const temperatureSeedOffsets = climate
		? getSeedOffsets(climate.seed, 0x43a7)
		: [0, 0, 0] as const;
	const temperatureNoise =
		      (fbm(
			normal,
			1.7,
			12.4 + temperatureSeedOffsets[0],
			4.1 + temperatureSeedOffsets[1],
			8.8 + temperatureSeedOffsets[2],
		) - 0.5) *
		      0.18;

	const localTemperature =
		equatorWarmth +
		temperatureNoise -
		altitude * 0.46 -
		smoothstep(0.72, 1.0, latitudeAbs) * 0.22;
	const globalTemperatureBias = climate
		? (clamp01(climate.temperature01) - 0.5) * 0.85
		: 0;
	const temperature = clamp01(
		localTemperature + globalTemperatureBias,
	);

	const rainBand =
		      0.5 +
		      0.5 *
		      Math.sin(
		      latitude * 8.5 +
		      (fbm(normal, 1.2, 3.7, 9.1, 2.6) - 0.5) * 5.8,
		      );

	const humidityNoise = fbm(normal, 2.05, 41.2, 7.3, 18.1);
	const localHumidity =
		humidityNoise * 0.52 +
		coastInfluence * 0.22 +
		ocean * 0.22 +
		rainBand * 0.18 -
		altitude * 0.18;
	const globalHumidityBias = climate
		? (clamp01(climate.humidity) - 0.5) * 0.70
		: 0;
	const humidity = clamp01(
		localHumidity + globalHumidityBias,
	);

	const dryNoise = fbm(normal, 2.8, 8.6, 71.2, 4.0);
	const localAridity =
		1 -
		humidity +
		temperature * 0.16 +
		(dryNoise - 0.5) * 0.20 -
		coastInfluence * 0.10;
	const globalAridityBias = climate
		? (clamp01(climate.aridity) - 0.5) * 0.65
		: 0;
	const aridity = clamp01(
		localAridity + globalAridityBias,
	);

	const snow = clamp01(
		landMask *
		(
			smoothstep(0.70, 0.98, latitudeAbs) * 0.72 +
			smoothstep(0.15, 0.30, height) * 0.66 +
			(1 - temperature) * 0.22
		),
	);

	const vegetation = clamp01(
		landMask *
		temperature *
		humidity *
		(1 - aridity * 0.55) *
		(1 - snow * 0.95) *
		(1 - altitude * 0.42),
	);

	const pressure = clamp01(
		fbm(normal, 1.35, 19.1, 2.4, 33.7) * 0.70 +
		rainBand * 0.20 +
		ocean * 0.10,
	);

	const windBand =
		      0.5 +
		      0.5 *
		      Math.sin(latitude * 10.0 + pressure * 3.2);

	const cloudPotential = clamp01(
		humidity * 0.62 +
		ocean * 0.20 +
		rainBand * 0.14 +
		pressure * 0.12 -
		aridity * 0.24,
	);

	const biomeSeedOffsets = climate
		? getSeedOffsets(climate.biomeSeed, 0x71bd)
		: [0, 0, 0] as const;
	const biomeEcologyBias = climate
		? (
			fbm(
				normal,
				3.6,
				22.1 + biomeSeedOffsets[0],
				63.7 + biomeSeedOffsets[1],
				11.4 + biomeSeedOffsets[2],
				4,
			) - 0.5
		) * 0.12
		: 0;

	const biome = getBiome({
		height,
		landMask,
		temperature,
		humidity,
		aridity,
		vegetation,
		snow,
		latitudeAbs,
		ecologyBias: biomeEcologyBias,
	});

	return {
		latitude,
		latitudeAbs,
		height,
		landMask,
		temperature,
		humidity,
		aridity,
		vegetation,
		snow,
		cloudPotential,
		pressure,
		windBand,
		biome,
		biomeColor: BIOME_COLORS[biome],
	};
}

function getSeedOffsets(seed: number, salt: number): readonly [number, number, number] {
	return [
		(seedHash01(seed, salt) - 0.5) * 96,
		(seedHash01(seed, salt + 1) - 0.5) * 96,
		(seedHash01(seed, salt + 2) - 0.5) * 96,
	];
}

function seedHash01(seed: number, salt: number): number {
	let value = (Math.trunc(seed) ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
	value ^= value >>> 16;
	value = Math.imul(value, 0x7feb352d) >>> 0;
	value ^= value >>> 15;
	value = Math.imul(value, 0x846ca68b) >>> 0;
	value ^= value >>> 16;
	return value / 0xffffffff;
}

function getBiome(input: {
	height: number;
	landMask: number;
	temperature: number;
	humidity: number;
	aridity: number;
	vegetation: number;
	snow: number;
	latitudeAbs: number;
	ecologyBias: number;
}): BiomeId {
	if (input.landMask < 0.34) {
		return 'deepOcean';
	}

	if (input.landMask < 0.58) {
		return 'shallowOcean';
	}

	if (input.landMask < 0.68) {
		return 'coast';
	}

	if (input.snow > 0.62) {
		return input.height > 0.16 ? 'snow' : 'ice';
	}

	if (input.height > 0.20) {
		return 'mountain';
	}

	if (input.temperature < 0.20) {
		return 'tundra';
	}

	// biomeSeed does not rewrite climate. It only nudges ecological thresholds
	// inside otherwise plausible temperate/warm land-biome zones.
	const ecologicalHumidity = clamp01(input.humidity + input.ecologyBias);
	const ecologicalAridity = clamp01(input.aridity - input.ecologyBias * 0.85);
	const ecologicalVegetation = clamp01(input.vegetation + input.ecologyBias * 0.35);

	if (ecologicalHumidity > 0.72 && input.temperature > 0.60) {
		return 'rainforest';
	}

	if (ecologicalHumidity > 0.62 && input.temperature > 0.36) {
		return 'temperateForest';
	}

	if (ecologicalHumidity > 0.54 && input.temperature <= 0.36) {
		return 'borealForest';
	}

	if (ecologicalAridity > 0.72 && input.temperature > 0.44) {
		return 'desert';
	}

	if (ecologicalAridity > 0.58 && input.temperature > 0.52) {
		return 'savanna';
	}

	if (ecologicalVegetation > 0.28) {
		return 'grassland';
	}

	return 'dryHills';
}

function clamp01Signed(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

export function getClimateDebugColor(
	sample: ClimateSample,
	mode: ClimateDebugMode,
): [number, number, number] {
	switch (mode) {
		case 'biome':
			return hexToRgb(sample.biomeColor);

		case 'temperature':
			return heatColor(sample.temperature);

		case 'humidity':
			return blueScale(sample.humidity);

		case 'aridity':
			return dryScale(sample.aridity);

		case 'vegetation':
			return greenScale(sample.vegetation);

		case 'snow':
			return whiteScale(sample.snow);

		case 'cloudPotential':
			return cloudScale(sample.cloudPotential);

		case 'pressure':
			return purpleScale(sample.pressure);

		case 'height':
			return heightScale(sample.height);

		case 'landMask':
			return whiteScale(sample.landMask);
	}
}

function hexToRgb(hex: number): [number, number, number] {
	return [
		(hex >> 16) & 255,
		(hex >> 8) & 255,
		hex & 255,
	];
}

function heatColor(value: number): [number, number, number] {
	const t = clamp01(value);

	if (t < 0.33) {
		return mixRgb([20, 45, 120], [80, 180, 220], t / 0.33);
	}

	if (t < 0.66) {
		return mixRgb([80, 180, 220], [230, 190, 70], (t - 0.33) / 0.33);
	}

	return mixRgb([230, 190, 70], [220, 70, 45], (t - 0.66) / 0.34);
}

function blueScale(value: number): [number, number, number] {
	return mixRgb([30, 35, 45], [50, 160, 230], value);
}

function dryScale(value: number): [number, number, number] {
	return mixRgb([45, 65, 55], [210, 145, 60], value);
}

function greenScale(value: number): [number, number, number] {
	return mixRgb([35, 45, 35], [60, 180, 70], value);
}

function whiteScale(value: number): [number, number, number] {
	const v = Math.round(clamp01(value) * 255);

	return [v, v, v];
}

function cloudScale(value: number): [number, number, number] {
	return mixRgb([15, 20, 30], [230, 235, 240], value);
}

function purpleScale(value: number): [number, number, number] {
	return mixRgb([35, 25, 55], [190, 120, 235], value);
}

function heightScale(height: number): [number, number, number] {
	const t = clamp01(height / 0.30);

	if (t < 0.35) {
		return mixRgb([15, 45, 80], [60, 125, 90], t / 0.35);
	}

	if (t < 0.70) {
		return mixRgb([60, 125, 90], [145, 120, 80], (t - 0.35) / 0.35);
	}

	return mixRgb([145, 120, 80], [240, 240, 230], (t - 0.70) / 0.30);
}
