import * as THREE from 'three';

function fract(value: number): number {
	return value - Math.floor(value);
}

function hash3(x: number, y: number, z: number): number {
	return fract(
		Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123,
	);
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

	return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
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

function fbm(point: THREE.Vector3, octaves = 6): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		value +=
			amplitude *
			valueNoise3D(
			point.x * frequency,
			point.y * frequency,
			point.z * frequency,
			);

		normalizer += amplitude;
		frequency *= 2;
		amplitude *= 0.5;
	}

	return value / normalizer;
}

function ridgedFbm(point: THREE.Vector3, octaves = 5): number {
	let value = 0;
	let amplitude = 0.52;
	let frequency = 1;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		const n = valueNoise3D(
			point.x * frequency,
			point.y * frequency,
			point.z * frequency,
		);

		const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
		const sharpened = ridge * ridge;

		value += sharpened * amplitude;
		normalizer += amplitude;

		frequency *= 2.15;
		amplitude *= 0.48;
	}

	return value / normalizer;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export type TerrainSample = {
	height: number;
	landMask: number;
	continent: number;
	mountainMask: number;
};

export function getTerrainSample(normal: THREE.Vector3): TerrainSample {
	const continentBase = fbm(
		normal.clone().multiplyScalar(1.25),
		6,
	);

	const coastNoise =
		      (fbm(
			      normal.clone().multiplyScalar(2.4),
			      5,
		      ) - 0.5) * 0.045;

	const continent = continentBase + coastNoise;

	const landMask = smoothstep(0.525, 0.585, continent);

	const highlands = Math.max(0, continent - 0.54);

	const mountainMask =
		      smoothstep(0.62, 0.78, continent) *
		      landMask;

	const ridgeLarge = ridgedFbm(
		normal.clone().multiplyScalar(3.8),
		5,
	);

	const ridgeMedium = ridgedFbm(
		normal.clone().multiplyScalar(8.5),
		5,
	);

	const ridgeFine = ridgedFbm(
		normal.clone().multiplyScalar(18.0),
		4,
	);

	const mountainChains =
		      smoothstep(0.46, 0.84, ridgeLarge) *
		      (
			      ridgeMedium * 0.72 +
			      ridgeFine * 0.28
		      );

	const sharpPeaks =
		      Math.pow(
			      clamp01(mountainChains),
			      1.75,
		      );

	const mountains =
		      sharpPeaks *
		      mountainMask;

	const foothills =
		      smoothstep(0.48, 0.74, ridgeLarge) *
		      mountainMask *
		      0.45;

	const detail =
		      (fbm(
			      normal.clone().multiplyScalar(24.0),
			      4,
		      ) - 0.5) *
		      0.010 *
		      landMask;

	const height =
		      landMask * 0.006 +
		      highlands * 0.095 +
		      foothills * 0.055 +
		      mountains * 0.165 +
		      detail;

	return {
		height: Math.max(0, height),
		landMask,
		continent,
		mountainMask,
	};
}

export function getTerrainHeight(normal: THREE.Vector3): number {
	return getTerrainSample(normal).height;
}

export function getCloudDensity(normal: THREE.Vector3): number {
	const large = fbm(normal.clone().multiplyScalar(1.1), 5);
	const medium = fbm(normal.clone().multiplyScalar(2.6), 4);
	const detail = fbm(normal.clone().multiplyScalar(7.5), 3);

	return large * 0.58 + medium * 0.30 + detail * 0.12;
}
