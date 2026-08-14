import * as THREE from 'three';
import { TerrainPatch } from '../../TerrainPatch';
import type { TerrainGrid } from '../../TerrainSource';
import { appendRegularGridIndices } from '../TerrainGeometryUtils';

type TerrainPatchGeometryRuntime = {
	terrainGrid: TerrainGrid;
	resolution: number;
	patchOrigin?: THREE.Vector3;
};

type TerrainPatchPrototypeRuntime = {
	createGeometry: (this: TerrainPatch) => THREE.BufferGeometry;
	getCenterLocal: (this: TerrainPatch) => THREE.Vector3;
	getPatchBoundingRadiusLocal: (
		this: TerrainPatch,
		centerLocal: THREE.Vector3,
	) => number;
	__workerGeometryBridgeInstalled?: boolean;
};

const prototype = TerrainPatch.prototype as unknown as TerrainPatchPrototypeRuntime;

if (!prototype.__workerGeometryBridgeInstalled) {
	const createLegacyGeometry = prototype.createGeometry;
	const getLegacyCenterLocal = prototype.getCenterLocal;
	const getLegacyPatchBoundingRadiusLocal = prototype.getPatchBoundingRadiusLocal;
	const boundingRadiusCache = new WeakMap<TerrainPatch, number>();

	prototype.getCenterLocal = function getCachedCenterLocal(
		this: TerrainPatch,
	): THREE.Vector3 {
		const state = this as unknown as TerrainPatchGeometryRuntime;
		return state.patchOrigin ?? getLegacyCenterLocal.call(this);
	};

	prototype.getPatchBoundingRadiusLocal = function getCachedPatchBoundingRadiusLocal(
		this: TerrainPatch,
		centerLocal: THREE.Vector3,
	): number {
		const cached = boundingRadiusCache.get(this);
		if (cached !== undefined) {
			return cached;
		}

		const radius = getLegacyPatchBoundingRadiusLocal.call(this, centerLocal);
		boundingRadiusCache.set(this, radius);
		return radius;
	};

	prototype.createGeometry = function createWorkerAwareGeometry(
		this: TerrainPatch,
	): THREE.BufferGeometry {
		const state = this as unknown as TerrainPatchGeometryRuntime;
		const grid = state.terrainGrid;
		const data = grid?.geometry;

		if (!data) {
			return createLegacyGeometry.call(this);
		}

		const expectedSamples = (state.resolution + 1) * (state.resolution + 1);
		if (
			data.positions.length !== expectedSamples * 3 ||
			data.morphPositions.length !== expectedSamples * 3 ||
			data.sphereNormals.length !== expectedSamples * 3 ||
			data.terrainNormals.length !== expectedSamples * 3 ||
			data.terrainDisplacements.length !== expectedSamples ||
			data.terrainDataUvs.length !== expectedSamples * 2 ||
			data.patchOrigins.length !== expectedSamples * 3
		) {
			return createLegacyGeometry.call(this);
		}

		const geometry = new THREE.BufferGeometry();
		const indices: number[] = [];
		appendRegularGridIndices(indices, state.resolution, state.resolution + 1);

		geometry.setAttribute('color', new THREE.BufferAttribute(grid.colors, 3));
		geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
		geometry.setAttribute('morphPosition', new THREE.BufferAttribute(data.morphPositions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(data.terrainNormals, 3));
		geometry.setAttribute('sphereNormal', new THREE.BufferAttribute(data.sphereNormals, 3));
		geometry.setAttribute('terrainHeight', new THREE.BufferAttribute(grid.heights, 1));
		geometry.setAttribute('terrainDisplacement', new THREE.BufferAttribute(data.terrainDisplacements, 1));
		geometry.setAttribute('landMask', new THREE.BufferAttribute(grid.landMasks, 1));
		geometry.setAttribute('mountainMask', new THREE.BufferAttribute(grid.mountainMasks, 1));
		geometry.setAttribute('terrainDataUv', new THREE.BufferAttribute(data.terrainDataUvs, 2));
		geometry.setAttribute('patchOrigin', new THREE.BufferAttribute(data.patchOrigins, 3));
		geometry.setIndex(indices);
		geometry.computeBoundingSphere();

		return geometry;
	};

	prototype.__workerGeometryBridgeInstalled = true;
}
