import * as THREE from 'three';

import {
	DEFAULT_TERRAIN_SEED_CONFIG,
	type TerrainSample,
	type TerrainSeedConfig,
} from './terrain/noise';

import {
	TerrainHeightCache,
	type TerrainHeightGrid,
} from './TerrainHeightCache';

import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainSource,
	TerrainSourceStats,
} from './TerrainSource';
import { getSharedTerrainWorkerPool } from './terrain/workers/SharedTerrainWorkerPool';
import type { TerrainWorkerPoolStats } from './terrain/workers/TerrainWorkerPool';

export class CachedTerrainSource implements TerrainSource {
	private readonly terrainHeightCache: TerrainHeightCache;
	private readonly prefetchedGrids = new Map<string, TerrainGrid>();
	private readonly inFlightGrids = new Map<string, Promise<TerrainGrid>>();

	constructor(
		private readonly terrainSeedConfig: TerrainSeedConfig = DEFAULT_TERRAIN_SEED_CONFIG,
		maxEntries = 2200,
	) {
		this.terrainHeightCache = new TerrainHeightCache(
			maxEntries,
			terrainSeedConfig,
		);
	}

	getPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainGrid {
		const key = this.getPatchKey(face, bounds, resolution);
		const prefetched = this.prefetchedGrids.get(key);

		if (prefetched) {
			this.prefetchedGrids.delete(key);
			return prefetched;
		}

		return this.terrainHeightCache.getPatchGrid(
			face,
			bounds,
			resolution,
		) as TerrainHeightGrid;
	}

	requestPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
		priority = 0,
	): Promise<TerrainGrid> {
		const key = this.getPatchKey(face, bounds, resolution);
		const prefetched = this.prefetchedGrids.get(key);

		if (prefetched) {
			return Promise.resolve(prefetched);
		}

		const inFlight = this.inFlightGrids.get(key);
		if (inFlight) {
			return inFlight;
		}

		const workerPool = getSharedTerrainWorkerPool();
		if (!workerPool) {
			return Promise.resolve(
				this.getPatchGrid(face, bounds, resolution),
			);
		}

		const request = workerPool.requestPatchGrid({
			face,
			bounds,
			resolution,
			terrainSeedConfig: this.terrainSeedConfig,
			priority,
		}).then((grid) => {
			this.prefetchedGrids.set(grid.key, grid);
			return grid;
		}).finally(() => {
			this.inFlightGrids.delete(key);
		});

		this.inFlightGrids.set(key, request);
		return request;
	}

	getWorkerStats(): TerrainWorkerPoolStats | null {
		return getSharedTerrainWorkerPool()?.getStats() ?? null;
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		return this.terrainHeightCache.sampleNormal(normal);
	}

	getStats(): TerrainSourceStats {
		return this.terrainHeightCache.getStats();
	}

	clear(): void {
		this.prefetchedGrids.clear();
		this.inFlightGrids.clear();
		this.terrainHeightCache.clear();
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
			this.terrainSeedConfig.seed,
			this.terrainSeedConfig.profile,
		].join('|');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${this.numberKey(vector.x)},${this.numberKey(vector.y)},${this.numberKey(vector.z)}`;
	}

	private numberKey(value: number): string {
		return value.toFixed(8);
	}
}
