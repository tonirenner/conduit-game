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

export class CachedTerrainSource implements TerrainSource {
	private readonly terrainHeightCache: TerrainHeightCache;

	constructor(
		terrainSeedConfig: TerrainSeedConfig = DEFAULT_TERRAIN_SEED_CONFIG,
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
		return this.terrainHeightCache.getPatchGrid(
			face,
			bounds,
			resolution,
		) as TerrainHeightGrid;
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		return this.terrainHeightCache.sampleNormal(normal);
	}

	getStats(): TerrainSourceStats {
		return this.terrainHeightCache.getStats();
	}

	clear(): void {
		this.terrainHeightCache.clear();
	}
}
