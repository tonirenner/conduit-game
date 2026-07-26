import * as THREE from 'three';

import {
	getTerrainSample,
	type TerrainSample,
} from '../utils/noise';

import type {
	CubeFace,
	PatchBounds,
} from './TerrainPatch';

export type TerrainHeightGrid = {
	key: string;
	resolution: number;
	rowSize: number;
	heights: Float32Array;
	landMasks: Float32Array;
	continents: Float32Array;
	mountainMasks: Float32Array;
};

export class TerrainHeightCache {
	private readonly grids = new Map<string, TerrainHeightGrid>();
	private readonly usage = new Map<string, number>();

	private tick = 0;

	constructor(
		private readonly maxEntries = 1800,
	) {}

	getPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainHeightGrid {
		const key = this.getPatchKey(face, bounds, resolution);

		const existing = this.grids.get(key);

		if (existing) {
			this.touch(key);
			return existing;
		}

		const grid = this.createPatchGrid(
			key,
			face,
			bounds,
			resolution,
		);

		this.grids.set(key, grid);
		this.touch(key);
		this.evictIfNeeded();

		return grid;
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		return getTerrainSample(normal);
	}

	getStats(): {
		entries: number;
		maxEntries: number;
	} {
		return {
			entries: this.grids.size,
			maxEntries: this.maxEntries,
		};
	}

	clear(): void {
		this.grids.clear();
		this.usage.clear();
		this.tick = 0;
	}

	private createPatchGrid(
		key: string,
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainHeightGrid {
		const rowSize = resolution + 1;
		const vertexCount = rowSize * rowSize;

		const heights = new Float32Array(vertexCount);
		const landMasks = new Float32Array(vertexCount);
		const continents = new Float32Array(vertexCount);
		const mountainMasks = new Float32Array(vertexCount);

		let index = 0;

		for (let y = 0; y <= resolution; y++) {
			for (let x = 0; x <= resolution; x++) {
				const localU = x / resolution;
				const localV = y / resolution;

				const cubeX = bounds.x + localU * bounds.size;
				const cubeY = bounds.y + localV * bounds.size;

				const sphereNormal = this.getSphereNormal(
					face,
					cubeX,
					cubeY,
				);

				const sample = getTerrainSample(sphereNormal);

				heights[index] = sample.height;
				landMasks[index] = sample.landMask;
				continents[index] = sample.continent;
				mountainMasks[index] = sample.mountainMask;

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
		};
	}

	private getSphereNormal(
		face: CubeFace,
		cubeX: number,
		cubeY: number,
	): THREE.Vector3 {
		return face.normal
			.clone()
			.add(
				face.right
					.clone()
					.multiplyScalar(cubeX),
			)
			.add(
				face.up
					.clone()
					.multiplyScalar(cubeY),
			)
			.normalize();
	}

	private getPatchKey(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): string {
		return [
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

	private touch(key: string): void {
		this.tick++;
		this.usage.set(key, this.tick);
	}

	private evictIfNeeded(): void {
		if (this.grids.size <= this.maxEntries) {
			return;
		}

		const entries = [...this.usage.entries()]
			.sort((a, b) => a[1] - b[1]);

		const removeCount = Math.ceil(this.maxEntries * 0.15);

		for (let i = 0; i < removeCount && i < entries.length; i++) {
			const key = entries[i][0];

			this.grids.delete(key);
			this.usage.delete(key);
		}
	}
}
