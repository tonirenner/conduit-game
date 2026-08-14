import { TerrainWorkerPool } from './TerrainWorkerPool';

let sharedTerrainWorkerPool: TerrainWorkerPool | null | undefined;

/**
 * Reuse one persistent terrain worker pool across planet renderers.
 *
 * Worker requests already carry the full terrain seed config, so a shared
 * pool can safely service different planets without tying worker lifetime to
 * a single CubeSphere instance.
 */
export function getSharedTerrainWorkerPool(): TerrainWorkerPool | null {
	if (sharedTerrainWorkerPool !== undefined) {
		return sharedTerrainWorkerPool;
	}

	sharedTerrainWorkerPool = TerrainWorkerPool.isSupported()
		? new TerrainWorkerPool()
		: null;

	return sharedTerrainWorkerPool;
}
