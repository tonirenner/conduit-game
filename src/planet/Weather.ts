import * as THREE from 'three';
import type { ClimateSample } from './Climate';

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

function fract(value: number): number {
	return value - Math.floor(value);
}

function hash3(x: number, y: number, z: number): number {
	return fract(
		Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123,
	);
}

function smooth(value: number): number {
	return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));

	return t * t * (3 - 2 * t);
}

function valueNoise3D(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = smooth(x - ix);
	const fy = smooth(y - iy);
	const fz = smooth(z - iz);

	const v000 = hash3(ix, iy, iz);
	const v100 = hash3(ix + 1, iy, iz);
	const v010 = hash3(ix, iy + 1, iz);
	const v110 = hash3(ix + 1, iy + 1, iz);

	const v001 = hash3(ix, iy, iz + 1);
	const v101 = hash3(ix + 1, iy, iz + 1);
	const v011 = hash3(ix, iy + 1, iz + 1);
	const v111 = hash3(ix + 1, iy + 1, iz + 1);

	const x00 = lerp(v000, v100, fx);
	const x10 = lerp(v010, v110, fx);
	const x01 = lerp(v001, v101, fx);
	const x11 = lerp(v011, v111, fx);

	const y0 = lerp(x00, x10, fy);
	const y1 = lerp(x01, x11, fy);

	return lerp(y0, y1, fz);
}

function fbm(
	normal: THREE.Vector3,
	scale: number,
	offsetX = 0,
	offsetY = 0,
	offsetZ = 0,
	octaves = 5,
): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		value +=
			valueNoise3D(
				normal.x * scale * frequency + offsetX,
				normal.y * scale * frequency + offsetY,
				normal.z * scale * frequency + offsetZ,
			) * amplitude;

		normalizer += amplitude;
		frequency *= 2;
		amplitude *= 0.5;
	}

	return value / normalizer;
}

export function getWeatherSample(
	normal: THREE.Vector3,
	climate: ClimateSample,
	time = 0,
): WeatherSample {
	const latitude = Math.asin(clampSigned(normal.y));
	const ocean = 1 - climate.landMask;

	const latitudeWind =
		      0.5 +
		      0.5 *
		      Math.sin(
		      latitude * 10.0 +
		      climate.pressure * 3.2 +
		      time * 0.16,
		      );

	const jetBands =
		      0.5 +
		      0.5 *
		      Math.sin(
		      latitude * 18.0 +
		      (fbm(normal, 1.1, 13.4, 2.7, 9.1) - 0.5) * 5.0 +
		      time * 0.22,
		      );

	const pressureBase = fbm(
		normal,
		1.20,
		19.1 + time * 0.025,
		2.4,
		33.7,
		5,
	);

	const pressureDetail = fbm(
		normal,
		3.40,
		31.3,
		8.6 + time * 0.045,
		12.7,
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
		5.1 + time * 0.075,
		91.4,
		17.7,
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

	const windStrength = clamp01(
		0.18 +
		latitudeWind * 0.30 +
		jetBands * 0.28 +
		Math.abs(pressure - 0.5) * 0.34,
	);

	const cloudBoost = clamp01(
		climate.cloudPotential * 0.66 +
		lowPressure * 0.22 +
		stormPotential * 0.24 -
		highPressure * 0.12,
	);

	const swirlNoise = fbm(
		normal,
		8.4,
		73.2,
		14.5 + time * 0.10,
		42.0,
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

function mixRgb(
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] {
	const x = clamp01(t);

	return [
		Math.round(lerp(a[0], b[0], x)),
		Math.round(lerp(a[1], b[1], x)),
		Math.round(lerp(a[2], b[2], x)),
	];
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
