import * as THREE from 'three';
import type { PlanetClimateDefinition } from '../model';
import type { ClimateSample } from './Climate';
import {
	clamp01,
	mixRgb,
	sampleFbm3D as fbm,
	smoothstep,
} from '../internal/ProceduralMath';

export type WeatherSample = {
	pressure: number;
	lowPressure: number;
	highPressure: number;
	windBand: number;
	windStrength: number;
	stormPotential: number;
	cloudBoost: number;
	swirl: number;
};

export type WeatherDebugMode =
	| 'weatherPressure'
	| 'weatherLowPressure'
	| 'weatherHighPressure'
	| 'weatherWind'
	| 'weatherStorm'
	| 'weatherCloudBoost'
	| 'weatherSwirl';

export const WEATHER_DEBUG_MODES: WeatherDebugMode[] = [
	'weatherPressure',
	'weatherLowPressure',
	'weatherHighPressure',
	'weatherWind',
	'weatherStorm',
	'weatherCloudBoost',
	'weatherSwirl',
];

function clampSigned(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

/**
 * Deterministic local weather sample.
 *
 * Passing the generated PlanetClimateDefinition enables the per-planet weather
 * identity. The optional fourth argument preserves the historical three-
 * argument API while migration is in progress.
 *
 * Phase 4 weather step 1 owns only:
 * - weatherSeed: spatial identity for dynamic weather fields
 * - windStrength: global intensity for the existing local wind structure
 *
 * stormActivity, seasonality and cloudPersistence are intentionally not wired
 * here and remain isolated later migration steps.
 */
export function getWeatherSample(
	normal: THREE.Vector3,
	climate: ClimateSample,
	time = 0,
	definition?: PlanetClimateDefinition,
): WeatherSample {
	const latitude = Math.asin(clampSigned(normal.y));
	const ocean = 1 - climate.landMask;
	const weatherOffsets = definition
		? getSeedOffsets(definition.weatherSeed, 0x6f31)
		: [0, 0, 0] as const;

	const latitudeWind =
		0.5 +
		0.5 *
		Math.sin(
			latitude * 10.0 +
			climate.pressure * 3.2 +
			time * 0.16 +
			weatherOffsets[0] * 0.025,
		);

	const jetBands =
		0.5 +
		0.5 *
		Math.sin(
			latitude * 18.0 +
			(fbm(
				normal,
				1.1,
				13.4 + weatherOffsets[0],
				2.7 + weatherOffsets[1],
				9.1 + weatherOffsets[2],
			) - 0.5) * 5.0 +
			time * 0.22,
		);

	const pressureBase = fbm(
		normal,
		1.20,
		19.1 + weatherOffsets[0] + time * 0.025,
		2.4 + weatherOffsets[1],
		33.7 + weatherOffsets[2],
		5,
	);

	const pressureDetail = fbm(
		normal,
		3.40,
		31.3 + weatherOffsets[2],
		8.6 + weatherOffsets[0] + time * 0.045,
		12.7 + weatherOffsets[1],
		4,
	);

	const pressure = clamp01(
		pressureBase * 0.58 +
		pressureDetail * 0.22 +
		climate.cloudPotential * 0.13 +
		ocean * 0.07,
	);

	const lowPressure =
		1 -
		smoothstep(0.40, 0.74, pressure);

	const highPressure =
		smoothstep(0.56, 0.84, pressure);

	const instability = clamp01(
		climate.humidity * 0.48 +
		climate.temperature * 0.28 +
		ocean * 0.14 -
		climate.aridity * 0.34 +
		lowPressure * 0.22,
	);

	const cellNoise = fbm(
		normal,
		6.2,
		5.1 + weatherOffsets[1] + time * 0.075,
		91.4 + weatherOffsets[2],
		17.7 + weatherOffsets[0],
		4,
	);

	const stormCells =
		smoothstep(0.58, 0.86, cellNoise) *
		(1 - highPressure * 0.55);

	const stormPotential = clamp01(
		climate.cloudPotential * 0.48 +
		instability * 0.34 +
		stormCells * 0.32 +
		lowPressure * 0.18 -
		highPressure * 0.18,
	);

	const localWindStrength = clamp01(
		0.18 +
		latitudeWind * 0.30 +
		jetBands * 0.28 +
		Math.abs(pressure - 0.5) * 0.34,
	);
	const globalWindStrength = definition
		? clamp01(definition.windStrength)
		: 0.5;
	const windStrength = definition
		? clamp01(localWindStrength * 0.65 + globalWindStrength * 0.45)
		: localWindStrength;

	const cloudBoost = clamp01(
		climate.cloudPotential * 0.66 +
		lowPressure * 0.22 +
		stormPotential * 0.24 -
		highPressure * 0.12,
	);

	const swirlNoise = fbm(
		normal,
		8.4,
		73.2 + weatherOffsets[0],
		14.5 + weatherOffsets[1] + time * 0.10,
		42.0 + weatherOffsets[2],
		4,
	);

	const swirl = clamp01(
		stormPotential *
		(
			swirlNoise * 0.72 +
			jetBands * 0.20 +
			lowPressure * 0.18
		),
	);

	return {
		pressure,
		lowPressure,
		highPressure,
		windBand: latitudeWind,
		windStrength,
		stormPotential,
		cloudBoost,
		swirl,
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

export function getWeatherDebugColor(
	sample: WeatherSample,
	mode: WeatherDebugMode,
): [number, number, number] {
	switch (mode) {
		case 'weatherPressure':
			return pressureScale(sample.pressure);

		case 'weatherLowPressure':
			return blueScale(sample.lowPressure);

		case 'weatherHighPressure':
			return orangeScale(sample.highPressure);

		case 'weatherWind':
			return cyanScale(sample.windStrength);

		case 'weatherStorm':
			return stormScale(sample.stormPotential);

		case 'weatherCloudBoost':
			return cloudScale(sample.cloudBoost);

		case 'weatherSwirl':
			return purpleScale(sample.swirl);
	}
}

function pressureScale(value: number): [number, number, number] {
	const t = clamp01(value);

	if (t < 0.5) {
		return mixRgb([35, 70, 170], [60, 70, 80], t / 0.5);
	}

	return mixRgb([60, 70, 80], [220, 125, 45], (t - 0.5) / 0.5);
}

function blueScale(value: number): [number, number, number] {
	return mixRgb([15, 20, 35], [60, 130, 255], value);
}

function orangeScale(value: number): [number, number, number] {
	return mixRgb([30, 25, 20], [240, 145, 55], value);
}

function cyanScale(value: number): [number, number, number] {
	return mixRgb([20, 25, 35], [70, 220, 230], value);
}

function stormScale(value: number): [number, number, number] {
	const t = clamp01(value);

	if (t < 0.55) {
		return mixRgb([20, 25, 35], [120, 130, 150], t / 0.55);
	}

	return mixRgb([120, 130, 150], [255, 255, 255], (t - 0.55) / 0.45);
}

function cloudScale(value: number): [number, number, number] {
	return mixRgb([15, 20, 30], [230, 235, 240], value);
}

function purpleScale(value: number): [number, number, number] {
	return mixRgb([30, 20, 50], [210, 110, 255], value);
}
