import { TerrainGeometryWorkerPool } from './TerrainGeometryWorkerPool';

let sharedTerrainWorkerPool: TerrainGeometryWorkerPool | null | undefined;

/**
 * Reuse one persistent terrain worker pool across planet renderers.
 *
 * Worker requests carry the full terrain seed config and may additionally
 * return ready-to-upload patch geometry for dynamic CubeSphere refinement.
 */
export function getSharedTerrainWorkerPool(): TerrainGeometryWorkerPool | null {
	if (sharedTerrainWorkerPool !== undefined) {
		return sharedTerrainWorkerPool;
	}

	sharedTerrainWorkerPool = TerrainGeometryWorkerPool.isSupported()
		? new TerrainGeometryWorkerPool()
		: null;

	return sharedTerrainWorkerPool;
}
