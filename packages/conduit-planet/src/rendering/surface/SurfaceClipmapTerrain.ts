import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';
import { createStitchedRingIndices } from '../../terrain/TerrainGeometryUtils';
import { noise3d } from '../../terrain/noise';
import {
	createSurfaceTerrainNodeMaterial,
	evaluateSurfaceTerrainMaterial,
} from './SurfaceTerrainMaterial';

// SurfaceView stays local. Ten rings with a 4 km base half extent still cover
// +/-2048 km. Each ring is an indexed shared-vertex grid. Fine outer edges are
// collapsed 2:1 onto the next coarser ring so the clipmap stays watertight while
// retaining the ~333 m near-field cell size.
const RING_COUNT = 10;
const GRID_CELLS = 24;
const BASE_HALF_EXTENT_METERS = 4_000;
const MIN_RECENTER_DISTANCE_METERS = 6_000;
const MAX_RECENTER_DISTANCE_METERS = 250_000;
const RECENTER_ALTITUDE_FACTOR = 0.18;
const DEPTH_OWNERSHIP_OPACITY = 0.985;
const DETAIL_LARGE_SCALE_METERS = 6_000;
const DETAIL_FINE_SCALE_METERS = 1_800;
const DETAIL_SAMPLE_STEP_METERS = 450;
const DETAIL_LARGE_AMPLITUDE_METERS = 42;
const DETAIL_FINE_AMPLITUDE_METERS = 14;

export type SurfaceClipmapStats = {
	active: boolean;
	draws: number;
	rings: number;
	gridCells: number;
	outerHalfExtentMeters: number;
	recenterDistanceMeters: number;
	indexed: true;
};

type Ring = {
	mesh: THREE.Mesh;
	geometry: THREE.BufferGeometry;
	material: any;
	grid: Float32Array;
	usedVertices: Uint8Array;
	positions: Float32Array;
	normals: Float32Array;
	colors: Float32Array;
	roughnesses: Float32Array;
	metalnesses: Float32Array;
	emissives: Float32Array;
};

type CachedSample = {
	x: number;
	y: number;
	z: number;
	nx: number;
	ny: number;
	nz: number;
	r: number;
	g: number;
	b: number;
	roughness: number;
	metalness: number;
	er: number;
	eg: number;
	eb: number;
};

/**
 * SurfaceView clipmap terrain.
 *
 * Rings use indexed shared-vertex grids instead of disconnected triangles.
 * The outer edge of every fine ring is stitched 2:1 to the next coarser ring,
 * eliminating LOD T-junctions while keeping a fixed, cheap topology for WebGPU.
 * Vertices are expressed in a local tangent frame where one local unit is one
 * physical meter; the group converts that frame into compact render scale.
 *
 * Terrain is sampled only when the local frame recenters. Surface is re-anchored
 * when its handoff becomes visible and keeps following the camera nadir whenever
 * the configured recenter distance is exceeded.
 *
 * Geometry always comes from the canonical PlanetTerrainSampler. Deterministic
 * high-frequency noise remains shading-only, so landing/collision height and the
 * Orbit -> Regional -> Surface terrain definition stay unified. The material
 * channels are evaluated separately from the existing planet material semantics:
 * class palettes, roughness, metal response, cavity and emissive lava never feed
 * back into the physical terrain height.
 */
export class SurfaceClipmapTerrain {
	readonly group = new THREE.Group();

	private readonly sampler: PlanetTerrainSampler;
	private readonly renderMetersScale: number;
	private readonly rings: Ring[] = [];
	private readonly anchorDirection = new THREE.Vector3();
	private readonly tangentX = new THREE.Vector3();
	private readonly tangentZ = new THREE.Vector3();
	private readonly anchorPhysical = new THREE.Vector3();
	private readonly materialColor = new THREE.Color();
	private readonly materialEmissive = new THREE.Color();
	private hasAnchor = false;
	private currentRecenterDistanceMeters = MAX_RECENTER_DISTANCE_METERS;
	private previousOpacity = 0;

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'PlanetSurfaceClipmapView';
		this.sampler = new PlanetTerrainSampler(definition);
		this.renderMetersScale = renderRadius / this.sampler.radiusMeters;

		for (let level = 0; level < RING_COUNT; level++) {
			const ring = this.createRing(level);
			this.rings.push(ring);
			this.group.add(ring.mesh);
		}

		this.recenter(cameraRenderPosition.clone().normalize());
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		this.currentRecenterDistanceMeters = this.getRecenterDistanceMeters(altitudeMeters);
		const direction = cameraRenderPosition.clone().normalize();
		const enteringHandoff = alpha > 0.001 && this.previousOpacity <= 0.001;

		if (enteringHandoff) {
			this.recenter(direction);
		} else if (
			alpha > 0.001 &&
			this.needsRecenter(direction, this.currentRecenterDistanceMeters)
		) {
			this.recenter(direction);
		}

		this.group.visible = alpha > 0.001;
		const ownsDepth = alpha > DEPTH_OWNERSHIP_OPACITY;
		for (const ring of this.rings) {
			ring.material.opacity = alpha;
			ring.material.depthTest = ownsDepth;
			ring.material.depthWrite = ownsDepth;
		}
		this.previousOpacity = alpha;
	}

	getStats(): SurfaceClipmapStats {
		return {
			active: this.group.visible,
			draws: this.group.visible ? this.rings.length : 0,
			rings: this.rings.length,
			gridCells: GRID_CELLS,
			outerHalfExtentMeters: BASE_HALF_EXTENT_METERS * (1 << (RING_COUNT - 1)),
			recenterDistanceMeters: this.currentRecenterDistanceMeters,
			indexed: true,
		};
	}

	dispose(): void {
		for (const ring of this.rings) {
			ring.geometry.dispose();
			ring.material.dispose();
		}
		this.rings.length = 0;
		this.group.clear();
	}

	private createRing(level: number): Ring {
		const halfExtent = BASE_HALF_EXTENT_METERS * (1 << level);
		const grid = createRingVertexGrid(halfExtent, GRID_CELLS);
		const vertexCount = (GRID_CELLS + 1) * (GRID_CELLS + 1);
		const innerResolution = level === 0 ? 0 : GRID_CELLS / 2;
		const indices = createStitchedRingIndices(
			GRID_CELLS,
			innerResolution,
			level < RING_COUNT - 1,
		);
		const usedVertices = new Uint8Array(vertexCount);
		for (const index of indices) usedVertices[index] = 1;

		const positions = new Float32Array(vertexCount * 3);
		const normals = new Float32Array(vertexCount * 3);
		const colors = new Float32Array(vertexCount * 3);
		const roughnesses = new Float32Array(vertexCount);
		const metalnesses = new Float32Array(vertexCount);
		const emissives = new Float32Array(vertexCount * 3);
		const geometry = new THREE.BufferGeometry();
		const positionAttribute = new THREE.BufferAttribute(positions, 3);
		const normalAttribute = new THREE.BufferAttribute(normals, 3);
		const colorAttribute = new THREE.BufferAttribute(colors, 3);
		const roughnessAttribute = new THREE.BufferAttribute(roughnesses, 1);
		const metalnessAttribute = new THREE.BufferAttribute(metalnesses, 1);
		const emissiveAttribute = new THREE.BufferAttribute(emissives, 3);
		positionAttribute.setUsage(THREE.DynamicDrawUsage);
		normalAttribute.setUsage(THREE.DynamicDrawUsage);
		colorAttribute.setUsage(THREE.DynamicDrawUsage);
		roughnessAttribute.setUsage(THREE.DynamicDrawUsage);
		metalnessAttribute.setUsage(THREE.DynamicDrawUsage);
		emissiveAttribute.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute('position', positionAttribute);
		geometry.setAttribute('normal', normalAttribute);
		geometry.setAttribute('color', colorAttribute);
		geometry.setAttribute('terrainRoughness', roughnessAttribute);
		geometry.setAttribute('terrainMetalness', metalnessAttribute);
		geometry.setAttribute('terrainEmissive', emissiveAttribute);
		geometry.setIndex(indices);

		const material = createSurfaceTerrainNodeMaterial();
		material.name = `PlanetSurfaceClipmapMaterial:${level}`;

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = `PlanetSurfaceClipmapRing:${level}`;
		mesh.frustumCulled = false;
		mesh.renderOrder = 10 + level;

		return {
			mesh,
			geometry,
			material,
			grid,
			usedVertices,
			positions,
			normals,
			colors,
			roughnesses,
			metalnesses,
			emissives,
		};
	}

	private needsRecenter(direction: THREE.Vector3, distanceMeters: number): boolean {
		if (!this.hasAnchor) return true;
		const dot = THREE.MathUtils.clamp(this.anchorDirection.dot(direction), -1, 1);
		const arcMeters = Math.acos(dot) * this.sampler.radiusMeters;
		return arcMeters >= distanceMeters;
	}

	private recenter(direction: THREE.Vector3): void {
		this.anchorDirection.copy(direction).normalize();
		this.hasAnchor = true;

		const reference = Math.abs(this.anchorDirection.y) < 0.92
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		this.tangentX.crossVectors(reference, this.anchorDirection).normalize();
		this.tangentZ.crossVectors(this.tangentX, this.anchorDirection).normalize();

		const anchorSample = this.sampler.sample(this.anchorDirection, false);
		this.anchorPhysical.copy(anchorSample.direction).multiplyScalar(anchorSample.surfaceRadiusMeters);

		const basis = new THREE.Matrix4().makeBasis(
			this.tangentX,
			this.anchorDirection,
			this.tangentZ,
		);
		this.group.position.copy(this.anchorPhysical).multiplyScalar(this.renderMetersScale);
		this.group.quaternion.setFromRotationMatrix(basis);
		this.group.scale.setScalar(this.renderMetersScale);
		this.group.updateMatrix();

		const cache = new Map<string, CachedSample>();
		for (const ring of this.rings) this.fillRing(ring, cache);
	}

	private fillRing(ring: Ring, cache: Map<string, CachedSample>): void {
		for (let vertex = 0; vertex < ring.grid.length / 2; vertex++) {
			if (ring.usedVertices[vertex] === 0) continue;

			const localX = ring.grid[vertex * 2];
			const localZ = ring.grid[vertex * 2 + 1];
			const key = `${localX}:${localZ}`;
			let sample = cache.get(key);
			if (!sample) {
				sample = this.sampleLocal(localX, localZ);
				cache.set(key, sample);
			}

			const offset = vertex * 3;
			ring.positions[offset] = sample.x;
			ring.positions[offset + 1] = sample.y;
			ring.positions[offset + 2] = sample.z;
			ring.normals[offset] = sample.nx;
			ring.normals[offset + 1] = sample.ny;
			ring.normals[offset + 2] = sample.nz;
			ring.colors[offset] = sample.r;
			ring.colors[offset + 1] = sample.g;
			ring.colors[offset + 2] = sample.b;
			ring.roughnesses[vertex] = sample.roughness;
			ring.metalnesses[vertex] = sample.metalness;
			ring.emissives[offset] = sample.er;
			ring.emissives[offset + 1] = sample.eg;
			ring.emissives[offset + 2] = sample.eb;
		}

		(ring.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('terrainRoughness') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('terrainMetalness') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('terrainEmissive') as THREE.BufferAttribute).needsUpdate = true;
		ring.geometry.computeBoundingSphere();
	}

	private sampleLocal(localX: number, localZ: number): CachedSample {
		const samplePosition = this.anchorDirection.clone()
			.multiplyScalar(this.sampler.radiusMeters)
			.addScaledVector(this.tangentX, localX)
			.addScaledVector(this.tangentZ, localZ);
		const sampleDirection = samplePosition.normalize();
		const terrain = this.sampler.sample(sampleDirection, true);
		const surfacePoint = terrain.direction.clone().multiplyScalar(terrain.surfaceRadiusMeters);
		const delta = surfacePoint.sub(this.anchorPhysical);
		const shadingNormal = this.getSurfaceShadingNormal(
			terrain.direction,
			terrain.normal,
			terrain.landMask,
			terrain.rawTerrain.mountainMask,
			terrain.rawTerrain.erosionMask,
		);
		const slope = THREE.MathUtils.clamp(
			(1 - THREE.MathUtils.clamp(terrain.normal.dot(terrain.direction), -1, 1)) * 8,
			0,
			1,
		);
		const surfaceMaterial = evaluateSurfaceTerrainMaterial(
			this.definition,
			{
				direction: terrain.direction,
				detailOffset: this.sampler.terrainSeedConfig.detailOffset,
				height: terrain.rawTerrain.height,
				landMask: terrain.landMask,
				mountainMask: terrain.rawTerrain.mountainMask,
				erosionMask: terrain.rawTerrain.erosionMask,
				riverMask: terrain.rawTerrain.riverMask,
				isWater: terrain.isWater,
				slope,
			},
			this.materialColor,
			this.materialEmissive,
		);

		return {
			x: delta.dot(this.tangentX),
			y: delta.dot(this.anchorDirection),
			z: delta.dot(this.tangentZ),
			nx: shadingNormal.dot(this.tangentX),
			ny: shadingNormal.dot(this.anchorDirection),
			nz: shadingNormal.dot(this.tangentZ),
			r: surfaceMaterial.color.r,
			g: surfaceMaterial.color.g,
			b: surfaceMaterial.color.b,
			roughness: surfaceMaterial.roughness,
			metalness: surfaceMaterial.metalness,
			er: surfaceMaterial.emissive.r,
			eg: surfaceMaterial.emissive.g,
			eb: surfaceMaterial.emissive.b,
		};
	}

	private getSurfaceShadingNormal(
		direction: THREE.Vector3,
		baseNormal: THREE.Vector3,
		landMask: number,
		mountainMask: number,
		erosionMask: number,
	): THREE.Vector3 {
		const landStrength = THREE.MathUtils.clamp((landMask - 0.48) / 0.42, 0, 1);
		if (landStrength <= 0.001) return baseNormal.clone();

		const tangentA = this.tangentX.clone()
			.addScaledVector(direction, -this.tangentX.dot(direction))
			.normalize();
		const tangentB = new THREE.Vector3().crossVectors(direction, tangentA).normalize();
		const angularStep = DETAIL_SAMPLE_STEP_METERS / Math.max(1, this.sampler.radiusMeters);
		const detailStrength = landStrength * THREE.MathUtils.lerp(
			0.42,
			1,
			THREE.MathUtils.clamp(mountainMask * 0.72 + erosionMask * 0.28, 0, 1),
		);

		const plusA = direction.clone().addScaledVector(tangentA, angularStep).normalize();
		const minusA = direction.clone().addScaledVector(tangentA, -angularStep).normalize();
		const plusB = direction.clone().addScaledVector(tangentB, angularStep).normalize();
		const minusB = direction.clone().addScaledVector(tangentB, -angularStep).normalize();
		const slopeA = (
			this.getSurfaceDetailHeightMeters(plusA) -
			this.getSurfaceDetailHeightMeters(minusA)
		) / (DETAIL_SAMPLE_STEP_METERS * 2);
		const slopeB = (
			this.getSurfaceDetailHeightMeters(plusB) -
			this.getSurfaceDetailHeightMeters(minusB)
		) / (DETAIL_SAMPLE_STEP_METERS * 2);

		return baseNormal.clone()
			.addScaledVector(tangentA, -slopeA * detailStrength)
			.addScaledVector(tangentB, -slopeB * detailStrength)
			.normalize();
	}

	private getSurfaceDetailHeightMeters(direction: THREE.Vector3): number {
		const offset = this.sampler.terrainSeedConfig.detailOffset;
		const largeFrequency = this.sampler.radiusMeters / DETAIL_LARGE_SCALE_METERS;
		const fineFrequency = this.sampler.radiusMeters / DETAIL_FINE_SCALE_METERS;
		const large = noise3d(
			direction.x * largeFrequency + offset.x,
			direction.y * largeFrequency + offset.y,
			direction.z * largeFrequency + offset.z,
		) * 2 - 1;
		const fine = noise3d(
			direction.x * fineFrequency + offset.x * 1.37,
			direction.y * fineFrequency + offset.y * 1.37,
			direction.z * fineFrequency + offset.z * 1.37,
		) * 2 - 1;
		return large * DETAIL_LARGE_AMPLITUDE_METERS + fine * DETAIL_FINE_AMPLITUDE_METERS;
	}

	private getAltitudeMeters(cameraRenderPosition: THREE.Vector3): number {
		return Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.sampler.radiusMeters,
		);
	}

	private getRecenterDistanceMeters(altitudeMeters: number): number {
		return THREE.MathUtils.clamp(
			altitudeMeters * RECENTER_ALTITUDE_FACTOR,
			MIN_RECENTER_DISTANCE_METERS,
			MAX_RECENTER_DISTANCE_METERS,
		);
	}
}

function createRingVertexGrid(halfExtent: number, cells: number): Float32Array {
	const vertices = new Float32Array((cells + 1) * (cells + 1) * 2);
	const cellSize = (halfExtent * 2) / cells;
	let offset = 0;
	for (let z = 0; z <= cells; z++) {
		const localZ = -halfExtent + z * cellSize;
		for (let x = 0; x <= cells; x++) {
			vertices[offset++] = -halfExtent + x * cellSize;
			vertices[offset++] = localZ;
		}
	}
	return vertices;
}
