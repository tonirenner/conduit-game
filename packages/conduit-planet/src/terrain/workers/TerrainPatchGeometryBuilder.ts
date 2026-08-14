import * as THREE from 'three';
import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainPatchGeometryData,
} from '../../TerrainSource';
import type { TerrainSample } from '../noise';
import { getCubeFaceIndex } from '../TerrainGeometryUtils';

export type TerrainPatchGeometryBuildOptions = {
	radius: number;
	terrainHeightScale: number;
	useGpuVertexDisplacement: boolean;
};

export function buildTerrainPatchGeometryData(
	face: CubeFace,
	bounds: PatchBounds,
	resolution: number,
	grid: TerrainGrid,
	sampleNormal: (normal: THREE.Vector3) => TerrainSample,
	options: TerrainPatchGeometryBuildOptions,
): TerrainPatchGeometryData {
	const rowSize = resolution + 1;
	const sampleCount = rowSize * rowSize;
	const positions = new Float32Array(sampleCount * 3);
	const morphPositions = new Float32Array(sampleCount * 3);
	const sphereNormals = new Float32Array(sampleCount * 3);
	const terrainNormals = new Float32Array(sampleCount * 3);
	const terrainDisplacements = new Float32Array(sampleCount);
	const terrainDataUvs = new Float32Array(sampleCount * 2);
	const patchOrigins = new Float32Array(sampleCount * 3);

	const patchOrigin = getTerrainPoint(
		getSphereNormal(
			face,
			bounds.x + bounds.size * 0.5,
			bounds.y + bounds.size * 0.5,
		),
		sampleNormal,
		options.radius,
		options.terrainHeightScale,
	);

	const terrainFaceIndex = getCubeFaceIndex(face.normal);
	const atlasColumn = terrainFaceIndex % 3;
	const atlasRow = Math.floor(terrainFaceIndex / 3);
	const atlasFaceUvInset = 2.0 / 2048.0;

	for (let y = 0; y <= resolution; y++) {
		for (let x = 0; x <= resolution; x++) {
			const index = x + y * rowSize;
			const index3 = index * 3;
			const index2 = index * 2;
			const localU = x / resolution;
			const localV = y / resolution;
			const cubeX = bounds.x + localU * bounds.size;
			const cubeY = bounds.y + localV * bounds.size;
			const sphereNormal = getSphereNormal(face, cubeX, cubeY);
			const height = grid.heights[index];
			const renderRadius = options.radius + (
				options.useGpuVertexDisplacement
					? 0
					: height * options.terrainHeightScale
			);
			const renderX = sphereNormal.x * renderRadius - patchOrigin.x;
			const renderY = sphereNormal.y * renderRadius - patchOrigin.y;
			const renderZ = sphereNormal.z * renderRadius - patchOrigin.z;

			positions[index3 + 0] = renderX;
			positions[index3 + 1] = renderY;
			positions[index3 + 2] = renderZ;
			sphereNormals[index3 + 0] = sphereNormal.x;
			sphereNormals[index3 + 1] = sphereNormal.y;
			sphereNormals[index3 + 2] = sphereNormal.z;
			terrainDisplacements[index] = height * options.terrainHeightScale;
			patchOrigins[index3 + 0] = patchOrigin.x;
			patchOrigins[index3 + 1] = patchOrigin.y;
			patchOrigins[index3 + 2] = patchOrigin.z;

			const faceU = clamp01((cubeX + 1.0) * 0.5);
			const faceV = clamp01((cubeY + 1.0) * 0.5);
			const atlasFaceU = lerp(atlasFaceUvInset, 1.0 - atlasFaceUvInset, faceU);
			const atlasFaceV = lerp(atlasFaceUvInset, 1.0 - atlasFaceUvInset, faceV);
			terrainDataUvs[index2 + 0] = (atlasColumn + atlasFaceU) / 3.0;
			terrainDataUvs[index2 + 1] = (atlasRow + atlasFaceV) / 2.0;
		}
	}

	buildTerrainNormals(
		face,
		bounds,
		resolution,
		sphereNormals,
		terrainNormals,
		sampleNormal,
		options,
	);
	buildCoarseMorphPositions(positions, morphPositions, resolution, rowSize);

	return {
		positions,
		morphPositions,
		sphereNormals,
		terrainNormals,
		terrainDisplacements,
		terrainDataUvs,
		patchOrigins,
	};
}

function buildTerrainNormals(
	face: CubeFace,
	bounds: PatchBounds,
	resolution: number,
	sphereNormals: Float32Array,
	terrainNormals: Float32Array,
	sampleNormal: (normal: THREE.Vector3) => TerrainSample,
	options: TerrainPatchGeometryBuildOptions,
): void {
	const rowSize = resolution + 1;
	const sampleStep = Math.max(0.0005, bounds.size / Math.max(1, resolution));
	const pMinusX = new THREE.Vector3();
	const pPlusX = new THREE.Vector3();
	const pMinusY = new THREE.Vector3();
	const pPlusY = new THREE.Vector3();
	const tangentX = new THREE.Vector3();
	const tangentY = new THREE.Vector3();
	const normal = new THREE.Vector3();
	const sphereNormal = new THREE.Vector3();

	for (let y = 0; y < rowSize; y++) {
		for (let x = 0; x < rowSize; x++) {
			const index = x + y * rowSize;
			const index3 = index * 3;
			sphereNormal.set(
				sphereNormals[index3 + 0],
				sphereNormals[index3 + 1],
				sphereNormals[index3 + 2],
			);

			const localU = x / Math.max(1, rowSize - 1);
			const localV = y / Math.max(1, rowSize - 1);
			const cubeX = bounds.x + localU * bounds.size;
			const cubeY = bounds.y + localV * bounds.size;

			sampleTerrainPoint(face, cubeX - sampleStep, cubeY, sampleNormal, options, pMinusX);
			sampleTerrainPoint(face, cubeX + sampleStep, cubeY, sampleNormal, options, pPlusX);
			sampleTerrainPoint(face, cubeX, cubeY - sampleStep, sampleNormal, options, pMinusY);
			sampleTerrainPoint(face, cubeX, cubeY + sampleStep, sampleNormal, options, pPlusY);

			tangentX.subVectors(pPlusX, pMinusX);
			tangentY.subVectors(pPlusY, pMinusY);
			normal.crossVectors(tangentX, tangentY);

			if (normal.lengthSq() < 0.0000001) {
				normal.copy(sphereNormal);
			} else {
				normal.normalize();
				if (normal.dot(sphereNormal) < 0) normal.multiplyScalar(-1);
				normal.lerp(sphereNormal, 0.025).normalize();
			}

			terrainNormals[index3 + 0] = normal.x;
			terrainNormals[index3 + 1] = normal.y;
			terrainNormals[index3 + 2] = normal.z;
		}
	}
}

function sampleTerrainPoint(
	face: CubeFace,
	cubeX: number,
	cubeY: number,
	sampleNormal: (normal: THREE.Vector3) => TerrainSample,
	options: TerrainPatchGeometryBuildOptions,
	out: THREE.Vector3,
): THREE.Vector3 {
	const normal = getSphereNormal(face, cubeX, cubeY);
	const sample = sampleNormal(normal);
	return out.copy(normal).multiplyScalar(
		options.radius + sample.height * options.terrainHeightScale,
	);
}

function getTerrainPoint(
	normal: THREE.Vector3,
	sampleNormal: (normal: THREE.Vector3) => TerrainSample,
	radius: number,
	terrainHeightScale: number,
): THREE.Vector3 {
	return normal.clone().multiplyScalar(
		radius + sampleNormal(normal).height * terrainHeightScale,
	);
}

function getSphereNormal(face: CubeFace, cubeX: number, cubeY: number): THREE.Vector3 {
	return face.normal.clone()
		.addScaledVector(face.right, cubeX)
		.addScaledVector(face.up, cubeY)
		.normalize();
}

function buildCoarseMorphPositions(
	positions: Float32Array,
	result: Float32Array,
	resolution: number,
	rowSize: number,
): void {
	const read = (x: number, y: number, component: number): number =>
		positions[(x + y * rowSize) * 3 + component];

	let writeIndex = 0;
	for (let y = 0; y <= resolution; y++) {
		for (let x = 0; x <= resolution; x++) {
			const x0 = x - x % 2;
			const y0 = y - y % 2;
			const x1 = Math.min(resolution, x0 + 2);
			const y1 = Math.min(resolution, y0 + 2);
			const tx = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
			const ty = y1 === y0 ? 0 : (y - y0) / (y1 - y0);

			for (let component = 0; component < 3; component++) {
				const top = lerp(read(x0, y0, component), read(x1, y0, component), tx);
				const bottom = lerp(read(x0, y1, component), read(x1, y1, component), tx);
				result[writeIndex++] = lerp(top, bottom, ty);
			}
		}
	}
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
