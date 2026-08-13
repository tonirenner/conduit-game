import * as THREE from 'three';

import type { Vector3Like } from '../internal/ProceduralMath';
import type { CubeFace } from '../TerrainSource';

export function createDefaultCubeFaces(): CubeFace[] {
	return [
		{
			normal: new THREE.Vector3(1, 0, 0),
			up: new THREE.Vector3(0, 1, 0),
			right: new THREE.Vector3(0, 0, -1),
		},
		{
			normal: new THREE.Vector3(-1, 0, 0),
			up: new THREE.Vector3(0, 1, 0),
			right: new THREE.Vector3(0, 0, 1),
		},
		{
			normal: new THREE.Vector3(0, 1, 0),
			up: new THREE.Vector3(0, 0, 1),
			right: new THREE.Vector3(-1, 0, 0),
		},
		{
			normal: new THREE.Vector3(0, -1, 0),
			up: new THREE.Vector3(0, 0, -1),
			right: new THREE.Vector3(-1, 0, 0),
		},
		{
			normal: new THREE.Vector3(0, 0, 1),
			up: new THREE.Vector3(0, 1, 0),
			right: new THREE.Vector3(1, 0, 0),
		},
		{
			normal: new THREE.Vector3(0, 0, -1),
			up: new THREE.Vector3(0, 1, 0),
			right: new THREE.Vector3(-1, 0, 0),
		},
	];
}

export function appendRegularGridIndices(
	indices: number[],
	resolution: number,
	rowSize = resolution + 1,
): void {
	for (let y = 0; y < resolution; y++) {
		for (let x = 0; x < resolution; x++) {
			const a = x + y * rowSize;
			const b = x + (y + 1) * rowSize;
			const c = x + 1 + y * rowSize;
			const d = x + 1 + (y + 1) * rowSize;

			indices.push(a, c, b, c, d, b);
		}
	}
}

export function getCubeFaceIndex(normal: Vector3Like): number {
	if (normal.x > 0.5) return 0;
	if (normal.x < -0.5) return 1;
	if (normal.y > 0.5) return 2;
	if (normal.y < -0.5) return 3;
	if (normal.z > 0.5) return 4;

	return 5;
}
