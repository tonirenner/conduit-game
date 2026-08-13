import * as THREE from 'three';

import type { TerrainSample } from './terrain/noise';

export type CubeFace = {
	normal: THREE.Vector3;
	up: THREE.Vector3;
	right: THREE.Vector3;
};

export type PatchBounds = {
	x: number;
	y: number;
	size: number;
};

export type TerrainGrid = {
	key: string;
	resolution: number;
	rowSize: number;

	heights: Float32Array;
	landMasks: Float32Array;
	continents: Float32Array;
	mountainMasks: Float32Array;

	colors: Float32Array;
};

export type TerrainSourceStats = {
	entries: number;
	maxEntries: number;
};

export interface TerrainSource {
	getPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainGrid;

	sampleNormal(normal: THREE.Vector3): TerrainSample;

	getStats(): TerrainSourceStats;

	clear(): void;
}
