import * as THREE from 'three';
import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainPatchGeometryData,
} from '../../TerrainSource';
import type { TerrainSeedConfig } from '../noise';

export type SerializedVector3 = readonly [number, number, number];

export type SerializedCubeFace = {
	normal: SerializedVector3;
	up: SerializedVector3;
	right: SerializedVector3;
};

export type SerializedTerrainSeedConfig = {
	seed: number;
	profile: TerrainSeedConfig['profile'];
	continentOffset: SerializedVector3;
	ridgeOffset: SerializedVector3;
	detailOffset: SerializedVector3;
	erosionOffset: SerializedVector3;
	riverOffset: SerializedVector3;
	continentScale: number;
	coastScale: number;
	mountainScale: number;
	heightScale: number;
	oceanBias: number;
};

export type TerrainWorkerGeometryRequest = {
	radius: number;
	terrainHeightScale: number;
	useGpuVertexDisplacement: boolean;
};

export type TerrainWorkerPatchRequest = {
	type: 'build-patch-grid';
	id: number;
	generation: number;
	face: SerializedCubeFace;
	bounds: PatchBounds;
	resolution: number;
	terrainSeedConfig: SerializedTerrainSeedConfig;
	geometry?: TerrainWorkerGeometryRequest;
};

export type TerrainWorkerGeometryResult = {
	positions: ArrayBuffer;
	morphPositions: ArrayBuffer;
	sphereNormals: ArrayBuffer;
	terrainNormals: ArrayBuffer;
	terrainDisplacements: ArrayBuffer;
	terrainDataUvs: ArrayBuffer;
	patchOrigins: ArrayBuffer;
};

export type TerrainWorkerPatchResult = {
	type: 'patch-grid';
	id: number;
	generation: number;
	key: string;
	resolution: number;
	rowSize: number;
	heights: ArrayBuffer;
	landMasks: ArrayBuffer;
	continents: ArrayBuffer;
	mountainMasks: ArrayBuffer;
	colors: ArrayBuffer;
	geometry?: TerrainWorkerGeometryResult;
};

export type TerrainWorkerErrorResult = {
	type: 'error';
	id: number;
	generation: number;
	message: string;
};

export type TerrainWorkerResponse =
	| TerrainWorkerPatchResult
	| TerrainWorkerErrorResult;

export function serializeCubeFace(face: CubeFace): SerializedCubeFace {
	return {
		normal: serializeVector3(face.normal),
		up: serializeVector3(face.up),
		right: serializeVector3(face.right),
	};
}

export function deserializeCubeFace(face: SerializedCubeFace): CubeFace {
	return {
		normal: deserializeVector3(face.normal),
		up: deserializeVector3(face.up),
		right: deserializeVector3(face.right),
	};
}

export function serializeTerrainSeedConfig(
	config: TerrainSeedConfig,
): SerializedTerrainSeedConfig {
	return {
		seed: config.seed,
		profile: config.profile,
		continentOffset: serializeVector3(config.continentOffset),
		ridgeOffset: serializeVector3(config.ridgeOffset),
		detailOffset: serializeVector3(config.detailOffset),
		erosionOffset: serializeVector3(config.erosionOffset),
		riverOffset: serializeVector3(config.riverOffset),
		continentScale: config.continentScale,
		coastScale: config.coastScale,
		mountainScale: config.mountainScale,
		heightScale: config.heightScale,
		oceanBias: config.oceanBias,
	};
}

export function deserializeTerrainSeedConfig(
	config: SerializedTerrainSeedConfig,
): TerrainSeedConfig {
	return {
		seed: config.seed,
		profile: config.profile,
		continentOffset: deserializeVector3(config.continentOffset),
		ridgeOffset: deserializeVector3(config.ridgeOffset),
		detailOffset: deserializeVector3(config.detailOffset),
		erosionOffset: deserializeVector3(config.erosionOffset),
		riverOffset: deserializeVector3(config.riverOffset),
		continentScale: config.continentScale,
		coastScale: config.coastScale,
		mountainScale: config.mountainScale,
		heightScale: config.heightScale,
		oceanBias: config.oceanBias,
	};
}

export function terrainGridFromWorkerResult(
	result: TerrainWorkerPatchResult,
): TerrainGrid {
	const geometry: TerrainPatchGeometryData | undefined = result.geometry
		? {
			positions: new Float32Array(result.geometry.positions),
			morphPositions: new Float32Array(result.geometry.morphPositions),
			sphereNormals: new Float32Array(result.geometry.sphereNormals),
			terrainNormals: new Float32Array(result.geometry.terrainNormals),
			terrainDisplacements: new Float32Array(result.geometry.terrainDisplacements),
			terrainDataUvs: new Float32Array(result.geometry.terrainDataUvs),
			patchOrigins: new Float32Array(result.geometry.patchOrigins),
		}
		: undefined;

	return {
		key: result.key,
		resolution: result.resolution,
		rowSize: result.rowSize,
		heights: new Float32Array(result.heights),
		landMasks: new Float32Array(result.landMasks),
		continents: new Float32Array(result.continents),
		mountainMasks: new Float32Array(result.mountainMasks),
		colors: new Float32Array(result.colors),
		geometry,
	};
}

function serializeVector3(vector: THREE.Vector3): SerializedVector3 {
	return [vector.x, vector.y, vector.z];
}

function deserializeVector3(vector: SerializedVector3): THREE.Vector3 {
	return new THREE.Vector3(vector[0], vector[1], vector[2]);
}
