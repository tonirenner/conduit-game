export type Vector3Like = {
	x: number;
	y: number;
	z: number;
};

export type RgbColor = [number, number, number];

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
	return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function smoothstep(
	edge0: number,
	edge1: number,
	value: number,
): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));

	return t * t * (3 - 2 * t);
}

export function valueNoise3D(
	x: number,
	y: number,
	z: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = smoothFraction(x - ix);
	const fy = smoothFraction(y - iy);
	const fz = smoothFraction(z - iz);

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

export function sampleFbm3D(
	normal: Vector3Like,
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
		value += valueNoise3D(
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

export function mixRgb(
	a: RgbColor,
	b: RgbColor,
	t: number,
): RgbColor {
	const amount = clamp01(t);

	return [
		Math.round(lerp(a[0], b[0], amount)),
		Math.round(lerp(a[1], b[1], amount)),
		Math.round(lerp(a[2], b[2], amount)),
	];
}

function smoothFraction(value: number): number {
	return value * value * (3 - 2 * value);
}

function hash3(x: number, y: number, z: number): number {
	const dot = x * 127.1 + y * 311.7 + z * 74.7;

	return fract(Math.sin(dot) * 43758.5453123);
}

function fract(value: number): number {
	return value - Math.floor(value);
}
