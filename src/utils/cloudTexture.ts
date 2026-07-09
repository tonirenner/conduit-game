import * as THREE from 'three';

export type CloudTextureOptions = {
	size?: number;
	seed?: number;
	coverage?: number;
	softness?: number;
	blurRadius?: number;
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function fract(value: number): number {
	return value - Math.floor(value);
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function hash3(x: number, y: number, z: number, seed: number): number {
	return fract(
		Math.sin(
			x * 127.1 +
			y * 311.7 +
			z * 74.7 +
			seed * 91.13,
		) * 43758.5453123,
	);
}

function valueNoise3D(
	x: number,
	y: number,
	z: number,
	seed: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = smooth(x - ix);
	const fy = smooth(y - iy);
	const fz = smooth(z - iz);

	const v000 = hash3(ix, iy, iz, seed);
	const v100 = hash3(ix + 1, iy, iz, seed);
	const v010 = hash3(ix, iy + 1, iz, seed);
	const v110 = hash3(ix + 1, iy + 1, iz, seed);

	const v001 = hash3(ix, iy, iz + 1, seed);
	const v101 = hash3(ix + 1, iy, iz + 1, seed);
	const v011 = hash3(ix, iy + 1, iz + 1, seed);
	const v111 = hash3(ix + 1, iy + 1, iz + 1, seed);

	const x00 = lerp(v000, v100, fx);
	const x10 = lerp(v010, v110, fx);
	const x01 = lerp(v001, v101, fx);
	const x11 = lerp(v011, v111, fx);

	const y0 = lerp(x00, x10, fy);
	const y1 = lerp(x01, x11, fy);

	return lerp(y0, y1, fz);
}

function fbm(
	point: THREE.Vector3,
	seed: number,
	octaves = 6,
): number {
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
			seed + i * 19.19,
			);

		normalizer += amplitude;
		frequency *= 2;
		amplitude *= 0.5;
	}

	return value / normalizer;
}

function domainWarp(
	normal: THREE.Vector3,
	seed: number,
	strength: number,
	scale: number,
): THREE.Vector3 {
	const p = normal.clone().multiplyScalar(scale);

	const wx =
		      fbm(
			      new THREE.Vector3(p.x + 11.5, p.y - 3.7, p.z + 8.1),
			      seed + 10,
			      4,
		      ) - 0.5;

	const wy =
		      fbm(
			      new THREE.Vector3(p.x - 6.2, p.y + 14.4, p.z - 1.8),
			      seed + 20,
			      4,
		      ) - 0.5;

	const wz =
		      fbm(
			      new THREE.Vector3(p.x + 2.9, p.y + 5.5, p.z + 17.2),
			      seed + 30,
			      4,
		      ) - 0.5;

	return normal
		.clone()
		.add(new THREE.Vector3(wx, wy, wz).multiplyScalar(strength))
		.normalize();
}

function getCloudDensity(
	normal: THREE.Vector3,
	seed: number,
): {
	density: number;
	detail: number;
} {
	const warpedLarge = domainWarp(normal, seed, 0.45, 1.4);
	const warpedFine = domainWarp(warpedLarge, seed + 50, 0.18, 4.5);

	const large = fbm(warpedLarge.clone().multiplyScalar(1.15), seed, 6);
	const medium = fbm(warpedFine.clone().multiplyScalar(3.2), seed + 100, 5);
	const fine = fbm(warpedFine.clone().multiplyScalar(13.0), seed + 200, 4);

	const latitude = Math.asin(normal.y);

	const bandNoise =
		      fbm(warpedLarge.clone().multiplyScalar(1.8), seed + 300, 4) - 0.5;

	const band =
		      0.5 +
		      0.5 *
		      Math.sin(
		      latitude * 7.0 +
		      bandNoise * 4.5 +
		      seed * 0.4,
		      );

	const bandMask = smoothstep(0.35, 0.88, band);

	const streak =
		      1 -
		      Math.abs(
		      fbm(warpedFine.clone().multiplyScalar(8.0), seed + 400, 4) -
		      0.5,
		      ) *
		      2;

	const streakMask = Math.pow(clamp01(streak), 1.8);

	const density =
		      large * 0.36 +
		      medium * 0.25 +
		      fine * 0.08 +
		      bandMask * 0.24 +
		      streakMask * 0.07;

	return {
		density,
		detail: fine,
	};
}

function blurAlpha(
	source: Float32Array,
	width: number,
	height: number,
	radius: number,
): Float32Array {
	if (radius <= 0) {
		return source;
	}

	const temp = new Float32Array(source.length);
	const out = new Float32Array(source.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let count = 0;

			for (let k = -radius; k <= radius; k++) {
				const sx = Math.max(0, Math.min(width - 1, x + k));

				sum += source[y * width + sx];
				count++;
			}

			temp[y * width + x] = sum / count;
		}
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let count = 0;

			for (let k = -radius; k <= radius; k++) {
				const sy = Math.max(0, Math.min(height - 1, y + k));

				sum += temp[sy * width + x];
				count++;
			}

			out[y * width + x] = sum / count;
		}
	}

	return out;
}

export function createCloudTexture(
	options: CloudTextureOptions = {},
): THREE.CanvasTexture {
	const size = options.size ?? 1024;
	const seed = options.seed ?? 0;
	const coverage = options.coverage ?? 0.56;
	const softness = options.softness ?? 0.26;
	const blurRadius = options.blurRadius ?? 4;

	const width = size;
	const height = Math.floor(size / 2);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext('2d');

	if (!context) {
		throw new Error('2D canvas context konnte nicht erstellt werden.');
	}

	const rawAlpha = new Float32Array(width * height);
	const details = new Float32Array(width * height);

	for (let y = 0; y < height; y++) {
		const v = y / height;
		const phi = v * Math.PI;

		for (let x = 0; x < width; x++) {
			const u = x / width;
			const theta = u * Math.PI * 2;

			const normal = new THREE.Vector3(
				Math.sin(phi) * Math.cos(theta),
				Math.cos(phi),
				Math.sin(phi) * Math.sin(theta),
			);

			const sample = getCloudDensity(normal, seed);

			const alpha = smoothstep(
				coverage,
				coverage + softness,
				sample.density,
			);

			const shapedAlpha = Math.pow(alpha, 1.45);

			const index = y * width + x;
			rawAlpha[index] = shapedAlpha;
			details[index] = sample.detail;
		}
	}

	const blurredAlpha = blurAlpha(rawAlpha, width, height, blurRadius);

	const imageData = context.createImageData(width, height);
	const data = imageData.data;

	for (let i = 0; i < blurredAlpha.length; i++) {
		const alpha = clamp01(
			blurredAlpha[i] * 0.72 +
			rawAlpha[i] * 0.28,
		);

		const detail = details[i];

		const brightness = clamp01(
			0.68 +
			alpha * 0.27 +
			detail * 0.12,
		);

		const r = Math.floor(235 * brightness);
		const g = Math.floor(242 * brightness);
		const b = Math.floor(246 * brightness);
		const a = Math.floor(Math.pow(alpha, 1.15) * 255);

		const p = i * 4;

		data[p + 0] = r;
		data[p + 1] = g;
		data[p + 2] = b;
		data[p + 3] = a;
	}

	context.putImageData(imageData, 0, 0);

	const texture = new THREE.CanvasTexture(canvas);

	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 8;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;

	return texture;
}
