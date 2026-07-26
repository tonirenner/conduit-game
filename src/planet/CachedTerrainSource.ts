import * as THREE from 'three';

import type { TerrainSample } from '../utils/noise';

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
	constructor(
		private readonly terrainHeightCache = new TerrainHeightCache(2200),
	) {}

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
