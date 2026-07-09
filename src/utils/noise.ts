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

function fbm(point: THREE.Vector3): number {
	let value     = 0;
	let amplitude = 0.5;
	let frequency = 1;

	for (let i = 0; i < 6; i++) {
		value +=
			amplitude *
			valueNoise3D(
			point.x * frequency,
			point.y * frequency,
			point.z * frequency,
			);

		frequency *= 2;
		amplitude *= 0.5;
	}

	return value;
}

export type TerrainSample = {
	height: number;
	landMask: number;
	continent: number;
	mountainMask: number;
};

export function getTerrainSample(normal: THREE.Vector3): TerrainSample {
	const continentBase = fbm(normal.clone()
		                          .multiplyScalar(1.25));

	// Küstenform ja, aber nicht zu hochfrequent, sonst franst es aus
	const coastNoise =
		      (fbm(normal.clone()
			           .multiplyScalar(2.4)) - 0.5) * 0.045;

	const continent = continentBase + coastNoise;

	// breiter Übergang = weichere Küsten
	const landMask = smoothstep(0.525, 0.585, continent);

	const highlands = Math.max(0, continent - 0.54);

	const mountainMask = smoothstep(0.66, 0.82, continent);

	const mountains =
		      Math.pow(fbm(normal.clone()
			                   .multiplyScalar(7.0)), 2.4) *
		      mountainMask;

	const detail =
		      (fbm(normal.clone()
			           .multiplyScalar(18.0)) - 0.5) *
		      0.012 *
		      landMask;

	const height =
		      landMask * 0.01 +
		      highlands * 0.12 +
		      mountains * 0.09 +
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
	const large = fbm(normal.clone().multiplyScalar(1.1));
	const medium = fbm(normal.clone().multiplyScalar(2.6));
	const detail = fbm(normal.clone().multiplyScalar(7.5));

	return large * 0.58 + medium * 0.30 + detail * 0.12;
}
