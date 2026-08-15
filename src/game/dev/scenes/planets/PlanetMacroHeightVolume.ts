import * as THREE from 'three';
import type { TerrainSeedConfig } from '@conduit/planet/terrain/noise';
import { noise3d } from '@conduit/planet/terrain/noise';

export type PlanetMacroHeightVolume = {
	texture: THREE.Data3DTexture;
	resolution: number;
};

export const DEFAULT_MACRO_HEIGHT_VOLUME_RESOLUTION = 48;

/**
 * Builds a direction-addressed macro terrain LUT once per planet config.
 *
 * Layout (RGBA16F):
 *   R = final macro displacement in render/game units
 *   G = mountain mask
 *   B = land mask
 *   A = 1
 *
 * Sampling uses uvw = direction * .49 + .5. Every voxel stores the terrain
 * value for normalize((uvw - .5) / .49), so trilinear 3D filtering remains
 * seam-free across CubeSphere faces.
 */
export function createPlanetMacroHeightVolume(
	config: TerrainSeedConfig,
	terrainHeightScale: number,
	resolution = DEFAULT_MACRO_HEIGHT_VOLUME_RESOLUTION,
): PlanetMacroHeightVolume {
	const size = Math.max(8, Math.floor(resolution));
	const pixels = new Uint16Array(size * size * size * 4);
	const direction = new THREE.Vector3();

	let write = 0;
	for (let z = 0; z < size; z++) {
		const w = (z + 0.5) / size;
		for (let y = 0; y < size; y++) {
			const v = (y + 0.5) / size;
			for (let x = 0; x < size; x++) {
				const u = (x + 0.5) / size;
				direction.set(
					(u - 0.5) / 0.49,
					(v - 0.5) / 0.49,
					(w - 0.5) / 0.49,
				);
				if (direction.lengthSq() < 1e-10) direction.set(0, 0, 1);
				else direction.normalize();

				const sample = sampleMacroTerrain(direction, config);
				pixels[write++] = THREE.DataUtils.toHalfFloat(
					sample.height * Math.max(0, terrainHeightScale),
				);
				pixels[write++] = THREE.DataUtils.toHalfFloat(sample.mountainMask);
				pixels[write++] = THREE.DataUtils.toHalfFloat(sample.landMask);
				pixels[write++] = THREE.DataUtils.toHalfFloat(1);
			}
		}
	}

	const texture = new THREE.Data3DTexture(pixels, size, size, size);
	texture.name = `PlanetMacroHeightVolume:${config.seed}:${config.profile}:${size}`;
	texture.format = THREE.RGBAFormat;
	texture.type = THREE.HalfFloatType;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.wrapR = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.unpackAlignment = 1;
	texture.colorSpace = THREE.NoColorSpace;
	texture.needsUpdate = true;

	return { texture, resolution: size };
}

type MacroTerrainSample = {
	height: number;
	landMask: number;
	mountainMask: number;
};

function sampleMacroTerrain(
	direction: THREE.Vector3,
	config: TerrainSeedConfig,
): MacroTerrainSample {
	const cx = direction.x * config.continentScale + config.continentOffset.x;
	const cy = direction.y * config.continentScale + config.continentOffset.y;
	const cz = direction.z * config.continentScale + config.continentOffset.z;

	const continentBase = fbm(cx * 1.25, cy * 1.25, cz * 1.25, 5);
	const coastNoise = (
		fbm(
			direction.x * config.coastScale * 2.4 + config.continentOffset.x,
			direction.y * config.coastScale * 2.4 + config.continentOffset.y,
			direction.z * config.coastScale * 2.4 + config.continentOffset.z,
			3,
		) - 0.5
	) * 0.045;
	const continent = continentBase + coastNoise - config.oceanBias;

	const landMask = smoothstep(0.525, 0.585, continent);
	const highlands = Math.max(continent - 0.54, 0);
	const mountainMask = smoothstep(0.62, 0.78, continent) * landMask;

	const rx = direction.x * config.mountainScale + config.ridgeOffset.x;
	const ry = direction.y * config.mountainScale + config.ridgeOffset.y;
	const rz = direction.z * config.mountainScale + config.ridgeOffset.z;
	const ridgeLarge = ridgedFbm(rx * 3.8, ry * 3.8, rz * 3.8, 4);
	const ridgeMedium = ridgedFbm(rx * 8.5, ry * 8.5, rz * 8.5, 3);
	const ridgeFine = ridgedFbm(rx * 18, ry * 18, rz * 18, 2);
	const mountainChains = smoothstep(0.46, 0.84, ridgeLarge) *
		(ridgeMedium * 0.72 + ridgeFine * 0.28);
	const mountains = Math.pow(Math.max(mountainChains, 0), 1.8) * mountainMask;
	const foothills = smoothstep(0.48, 0.74, ridgeLarge) * mountainMask * 0.40;

	const height = Math.max(
		landMask * 0.006 +
		highlands * 0.095 +
		foothills * 0.055 +
		mountains * 0.165,
		0,
	) * config.heightScale;

	return { height, landMask, mountainMask };
}

function fbm(x: number, y: number, z: number, octaves: number): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;
	for (let i = 0; i < octaves; i++) {
		value += noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
		normalizer += amplitude;
		frequency *= 2;
		amplitude *= 0.5;
	}
	return normalizer > 0 ? value / normalizer : 0;
}

function ridgedFbm(x: number, y: number, z: number, octaves: number): number {
	let value = 0;
	let amplitude = 0.52;
	let frequency = 1;
	let normalizer = 0;
	for (let i = 0; i < octaves; i++) {
		const n = noise3d(x * frequency, y * frequency, z * frequency);
		const ridge = 1 - Math.abs(n * 2 - 1);
		value += ridge * ridge * amplitude;
		normalizer += amplitude;
		frequency *= 2.15;
		amplitude *= 0.48;
	}
	return normalizer > 0 ? value / normalizer : 0;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
