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
import type { TerrainWorkerGeometryRequest } from './terrain/workers/TerrainWorkerProtocol';

type ConstructionSampleContext = {
	face: CubeFace;
	bounds: PatchBounds;
	grid: TerrainGrid;
	remaining: number;
};

export class CachedTerrainSource implements TerrainSource {
	private readonly terrainHeightCache: TerrainHeightCache;
	private readonly prefetchedGrids = new Map<string, TerrainGrid>();
	private readonly inFlightGrids = new Map<string, Promise<TerrainGrid>>();
	private constructionSampleContext: ConstructionSampleContext | null = null;

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
			if (prefetched.geometry) {
				const rowSize = resolution + 1;
				this.constructionSampleContext = {
					face,
					bounds: { ...bounds },
					grid: prefetched,
					remaining: 1 + 4 * rowSize * rowSize,
				};
			}
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
		geometry?: TerrainWorkerGeometryRequest,
	): Promise<TerrainGrid> {
		const key = this.getPatchKey(face, bounds, resolution);
		const prefetched = this.prefetchedGrids.get(key);

		if (prefetched && (!geometry || prefetched.geometry)) {
			return Promise.resolve(prefetched);
		}

		const requestKey = geometry ? `${key}|geometry` : key;
		const inFlight = this.inFlightGrids.get(requestKey);
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
			geometry,
			priority,
		}).then((grid) => {
			this.prefetchedGrids.set(grid.key, grid);
			return grid;
		}).finally(() => {
			this.inFlightGrids.delete(requestKey);
		});

		this.inFlightGrids.set(requestKey, request);
		return request;
	}

	getWorkerStats(): TerrainWorkerPoolStats | null {
		return getSharedTerrainWorkerPool()?.getStats() ?? null;
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		const context = this.constructionSampleContext;
		if (!context) {
			return this.terrainHeightCache.sampleNormal(normal);
		}

		context.remaining--;
		if (context.remaining <= 0) {
			this.constructionSampleContext = null;
		}

		return this.sampleConstructionGrid(normal, context) ??
		       this.terrainHeightCache.sampleNormal(normal);
	}

	getStats(): TerrainSourceStats {
		return this.terrainHeightCache.getStats();
	}

	clear(): void {
		this.prefetchedGrids.clear();
		this.inFlightGrids.clear();
		this.constructionSampleContext = null;
		this.terrainHeightCache.clear();
	}

	private sampleConstructionGrid(
		normal: THREE.Vector3,
		context: ConstructionSampleContext,
	): TerrainSample | null {
		const denominator = normal.dot(context.face.normal);
		if (denominator <= 0.000001) {
			return null;
		}

		const cubeX = normal.dot(context.face.right) / denominator;
		const cubeY = normal.dot(context.face.up) / denominator;
		const minX = context.bounds.x;
		const minY = context.bounds.y;
		const maxX = minX + context.bounds.size;
		const maxY = minY + context.bounds.size;
		const epsilon = 0.000001;

		// Edge normal samples intentionally fall back to the exact terrain
		// sampler when they step outside this patch. This keeps neighboring
		// patch lighting continuous while almost all interior samples stay cheap.
		if (
			cubeX < minX - epsilon || cubeX > maxX + epsilon ||
			cubeY < minY - epsilon || cubeY > maxY + epsilon
		) {
			return null;
		}

		const resolution = context.grid.resolution;
		const rowSize = context.grid.rowSize;
		const u = THREE.MathUtils.clamp((cubeX - minX) / context.bounds.size, 0, 1) * resolution;
		const v = THREE.MathUtils.clamp((cubeY - minY) / context.bounds.size, 0, 1) * resolution;
		const x0 = Math.floor(u);
		const y0 = Math.floor(v);
		const x1 = Math.min(resolution, x0 + 1);
		const y1 = Math.min(resolution, y0 + 1);
		const tx = u - x0;
		const ty = v - y0;
		const sample = (values: Float32Array): number => {
			const top = THREE.MathUtils.lerp(
				values[x0 + y0 * rowSize],
				values[x1 + y0 * rowSize],
				tx,
			);
			const bottom = THREE.MathUtils.lerp(
				values[x0 + y1 * rowSize],
				values[x1 + y1 * rowSize],
				tx,
			);
			return THREE.MathUtils.lerp(top, bottom, ty);
		};

		return {
			height: sample(context.grid.heights),
			landMask: sample(context.grid.landMasks),
			continent: sample(context.grid.continents),
			mountainMask: sample(context.grid.mountainMasks),
			erosionMask: 0,
			riverMask: 0,
		};
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
