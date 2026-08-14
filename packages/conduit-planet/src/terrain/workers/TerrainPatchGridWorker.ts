import { TerrainHeightCache } from '../../TerrainHeightCache';
import { buildTerrainPatchGeometryData } from './TerrainPatchGeometryBuilder';
import {
	deserializeCubeFace,
	deserializeTerrainSeedConfig,
	type TerrainWorkerGeometryResult,
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

		const face = deserializeCubeFace(request.face);
		const grid = cache.getPatchGrid(
			face,
			request.bounds,
			request.resolution,
		);

		const heights = grid.heights.slice();
		const landMasks = grid.landMasks.slice();
		const continents = grid.continents.slice();
		const mountainMasks = grid.mountainMasks.slice();
		const colors = grid.colors.slice();

		let geometry: TerrainWorkerGeometryResult | undefined;
		if (request.geometry) {
			const geometryData = buildTerrainPatchGeometryData(
				face,
				request.bounds,
				request.resolution,
				grid,
				(normal) => cache!.sampleNormal(normal),
				request.geometry,
			);

			geometry = {
				positions: geometryData.positions.buffer as ArrayBuffer,
				morphPositions: geometryData.morphPositions.buffer as ArrayBuffer,
				sphereNormals: geometryData.sphereNormals.buffer as ArrayBuffer,
				terrainNormals: geometryData.terrainNormals.buffer as ArrayBuffer,
				terrainDisplacements: geometryData.terrainDisplacements.buffer as ArrayBuffer,
				terrainDataUvs: geometryData.terrainDataUvs.buffer as ArrayBuffer,
				patchOrigins: geometryData.patchOrigins.buffer as ArrayBuffer,
			};
		}

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
			geometry,
		};

		const transfer: Transferable[] = [
			response.heights,
			response.landMasks,
			response.continents,
			response.mountainMasks,
			response.colors,
		];
		if (geometry) {
			transfer.push(
				geometry.positions,
				geometry.morphPositions,
				geometry.sphereNormals,
				geometry.terrainNormals,
				geometry.terrainDisplacements,
				geometry.terrainDataUvs,
				geometry.patchOrigins,
			);
		}

		workerScope.postMessage(response, transfer);
	} catch (error) {
		workerScope.postMessage({
			type: 'error',
			id: request.id,
			generation: request.generation,
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
