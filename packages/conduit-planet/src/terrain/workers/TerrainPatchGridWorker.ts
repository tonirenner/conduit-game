import { TerrainHeightCache } from '../../TerrainHeightCache';
import {
	deserializeCubeFace,
	deserializeTerrainSeedConfig,
	type TerrainWorkerPatchRequest,
	type TerrainWorkerPatchResult,
	type TerrainWorkerResponse,
} from './TerrainWorkerProtocol';

const caches = new Map<string, TerrainHeightCache>();

const workerScope = self as unknown as {
	onmessage: ((event: MessageEvent<TerrainWorkerPatchRequest>) => void) | null;
	postMessage: (message: TerrainWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event): void => {
	const request = event.data;

	if (request.type !== 'build-patch-grid') {
		return;
	}

	try {
		const configKey = JSON.stringify(request.terrainSeedConfig);
		let cache = caches.get(configKey);

		if (!cache) {
			cache = new TerrainHeightCache(
				192,
				deserializeTerrainSeedConfig(request.terrainSeedConfig),
			);
			caches.set(configKey, cache);
		}

		const grid = cache.getPatchGrid(
			deserializeCubeFace(request.face),
			request.bounds,
			request.resolution,
		);

		// Keep the worker-side cache intact. The copies below are transferred,
		// so their ArrayBuffers leave the worker without touching cached data.
		const heights = grid.heights.slice();
		const landMasks = grid.landMasks.slice();
		const continents = grid.continents.slice();
		const mountainMasks = grid.mountainMasks.slice();
		const colors = grid.colors.slice();

		const response: TerrainWorkerPatchResult = {
			type: 'patch-grid',
			id: request.id,
			generation: request.generation,
			key: grid.key,
			resolution: grid.resolution,
			rowSize: grid.rowSize,
			heights: heights.buffer as ArrayBuffer,
			landMasks: landMasks.buffer as ArrayBuffer,
			continents: continents.buffer as ArrayBuffer,
			mountainMasks: mountainMasks.buffer as ArrayBuffer,
			colors: colors.buffer as ArrayBuffer,
		};

		workerScope.postMessage(response, [
			response.heights,
			response.landMasks,
			response.continents,
			response.mountainMasks,
			response.colors,
		]);
	} catch (error) {
		workerScope.postMessage({
			type: 'error',
			id: request.id,
			generation: request.generation,
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
