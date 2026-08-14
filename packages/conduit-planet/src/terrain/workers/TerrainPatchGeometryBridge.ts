import * as THREE from 'three';
import { TerrainPatch } from '../../TerrainPatch';
import type { TerrainGrid } from '../../TerrainSource';
import { appendRegularGridIndices } from '../TerrainGeometryUtils';

type TerrainPatchGeometryRuntime = {
	terrainGrid: TerrainGrid;
	resolution: number;
};

type TerrainPatchPrototypeRuntime = {
	createGeometry: (this: TerrainPatch) => THREE.BufferGeometry;
	__workerGeometryBridgeInstalled?: boolean;
};

const prototype = TerrainPatch.prototype as unknown as TerrainPatchPrototypeRuntime;

if (!prototype.__workerGeometryBridgeInstalled) {
	const createLegacyGeometry = prototype.createGeometry;

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
