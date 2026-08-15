import * as THREE from 'three';
import {
	createTerrainSeedConfig,
	getTerrainSample,
} from '@conduit/planet/terrain/noise';
import { resolveTerrainProfileKind } from '@conduit/planet/rendering';
import type { PlanetDefinition } from '@conduit/planet/model';

export const ORBIT_TERRAIN_VOLUME_RESOLUTION = 64;

/**
 * OrbitView terrain LUT.
 *
 * Expensive seeded terrain noise is evaluated once when the planet view is
 * created. The render path then uses a single trilinear texture3D lookup for
 * terrain height/masks instead of evaluating FBM/ridged noise per vertex or
 * fragment every frame.
 *
 * A 64^3 volume keeps the OrbitView displacement close to the canonical
 * PlanetTerrainSampler used by RegionalView. This reduces visible terrain
 * reshaping during the Orbit -> Regional handoff while keeping the runtime
 * render path to one texture lookup.
 *
 * Layout (RGBA16F):
 *   R = raw terrain height
 *   G = land mask
 *   B = mountain mask
 *   A = erosion/river detail mask
 */
export function createOrbitTerrainVolume(
	definition: PlanetDefinition,
	resolution = ORBIT_TERRAIN_VOLUME_RESOLUTION,
): THREE.Data3DTexture {
	const size = Math.max(8, Math.floor(resolution));
	const pixels = new Uint16Array(size * size * size * 4);
	const config = createTerrainSeedConfig(
		definition.render.terrainSeed,
		resolveTerrainProfileKind(definition.class),
	);
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

				const sample = getTerrainSample(direction, config);
				pixels[write++] = THREE.DataUtils.toHalfFloat(sample.height);
				pixels[write++] = THREE.DataUtils.toHalfFloat(sample.landMask);
				pixels[write++] = THREE.DataUtils.toHalfFloat(sample.mountainMask);
				pixels[write++] = THREE.DataUtils.toHalfFloat(
					THREE.MathUtils.clamp(
						sample.erosionMask * 0.68 + sample.riverMask * 0.32,
						0,
						1,
					),
				);
			}
		}
	}

	const texture = new THREE.Data3DTexture(pixels, size, size, size);
	texture.name = `OrbitTerrainVolume:${definition.render.terrainSeed}:${definition.class}:${size}`;
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
	return texture;
}
