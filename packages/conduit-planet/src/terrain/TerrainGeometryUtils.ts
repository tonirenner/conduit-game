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

export type TerrainGridStitchEdges = {
	top: boolean;
	right: boolean;
	bottom: boolean;
	left: boolean;
};

export function createStitchedGridIndices(
	resolution: number,
	edges: TerrainGridStitchEdges,
): number[] {
	const indices: number[] = [];
	const rowSize = resolution + 1;
	const mapVertex = (x: number, y: number): number => {
		let mappedX = x;
		let mappedY = y;

		if (edges.top && y === 0 && x % 2 === 1) mappedX = x - 1;
		if (edges.bottom && y === resolution && x % 2 === 1) mappedX = x - 1;
		if (edges.left && x === 0 && y % 2 === 1) mappedY = y - 1;
		if (edges.right && x === resolution && y % 2 === 1) mappedY = y - 1;

		return mappedX + mappedY * rowSize;
	};

	for (let y = 0; y < resolution; y++) {
		for (let x = 0; x < resolution; x++) {
			const a = mapVertex(x, y);
			const b = mapVertex(x, y + 1);
			const c = mapVertex(x + 1, y);
			const d = mapVertex(x + 1, y + 1);
			indices.push(a, c, b, c, d, b);
		}
	}

	return indices;
}

export function getCubeFaceIndex(normal: Vector3Like): number {
	if (normal.x > 0.5) return 0;
	if (normal.x < -0.5) return 1;
	if (normal.y > 0.5) return 2;
	if (normal.y < -0.5) return 3;
	if (normal.z > 0.5) return 4;

	return 5;
}
