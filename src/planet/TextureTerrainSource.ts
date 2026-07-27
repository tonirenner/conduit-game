import * as THREE from 'three';

import type { TerrainSample } from '../utils/noise';

import {
	TerrainDataCache,
	type TerrainDataCacheOptions,
} from './TerrainDataCache';

import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainSource,
	TerrainSourceStats,
} from './TerrainSource';

export class TextureTerrainSource implements TerrainSource {
	private readonly terrainDataCache: TerrainDataCache;

	constructor(options: Partial<TerrainDataCacheOptions> = {}) {
		this.terrainDataCache = new TerrainDataCache(options);
	}

	getPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainGrid {
		const key = this.getPatchKey(
			face,
			bounds,
			resolution,
		);

		const rowSize = resolution + 1;
		const vertexCount = rowSize * rowSize;

		const heights = new Float32Array(vertexCount);
		const landMasks = new Float32Array(vertexCount);
		const continents = new Float32Array(vertexCount);
		const mountainMasks = new Float32Array(vertexCount);
		const colors = new Float32Array(vertexCount * 3);

		let index = 0;

		for (let y = 0; y <= resolution; y++) {
			const localV = y / resolution;
			const cubeY = bounds.y + localV * bounds.size;

			for (let x = 0; x <= resolution; x++) {
				const localU = x / resolution;
				const cubeX = bounds.x + localU * bounds.size;

				const sample = this.terrainDataCache.sampleFace(
					face,
					cubeX,
					cubeY,
				);

				heights[index] = sample.height;
				landMasks[index] = sample.landMask;
				continents[index] = sample.continent;
				mountainMasks[index] = sample.mountainMask;

				const colorIndex = index * 3;

				colors[colorIndex + 0] = sample.color.r;
				colors[colorIndex + 1] = sample.color.g;
				colors[colorIndex + 2] = sample.color.b;

				index++;
			}
		}

		return {
			key,
			resolution,
			rowSize,
			heights,
			landMasks,
			continents,
			mountainMasks,
			colors,
		};
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		return this.terrainDataCache.sampleNormal(normal);
	}

	getStats(): TerrainSourceStats {
		return {
			entries: this.terrainDataCache.getFaceCount(),
			maxEntries: 6,
		};
	}

	clear(): void {
		this.terrainDataCache.clear();
	}

	private getPatchKey(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): string {
		return [
			'texture',
			this.vectorKey(face.normal),
			this.vectorKey(face.up),
			this.vectorKey(face.right),
			this.numberKey(bounds.x),
			this.numberKey(bounds.y),
			this.numberKey(bounds.size),
			resolution,
		].join('|');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${this.numberKey(vector.x)},${this.numberKey(vector.y)},${this.numberKey(vector.z)}`;
	}

	private numberKey(value: number): string {
		return value.toFixed(8);
	}
}
