import * as THREE from 'three';
import { appendRegularGridIndices } from '../terrain/TerrainGeometryUtils';
import type { PlanetReferenceFrame } from './PlanetReferenceFrame';
import {
	createPlanetNearViewVisualProfile,
	getNearViewSurfaceColor,
	type PlanetNearViewVisualProfile,
} from './PlanetNearViewSurfaceColor';
import type { PlanetTerrainSampler } from './PlanetTerrainSampler';

export type PlanetTerrainChunkAddress = {
	lod: number;
	x: number;
	y: number;
};

export type PlanetNearViewTerrainStats = {
	visibleChunks: number;
	cachedChunks: number;
	generatedChunks: number;
	finestLod: number;
	shiftCount: number;
	activeLodCount: number;
	coverageRadiusMeters: number;
	horizonDistanceMeters: number;
};

export type PlanetNearViewChunkSpec = {
	lod: number;
	sizeMeters: number;
	resolution: number;
	radius: number;
};

type ChartBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

type TerrainChunk = {
	address: PlanetTerrainChunkAddress;
	mesh: THREE.Mesh;
	buildOrigin: THREE.Vector3;
	lastUsedFrame: number;
};

export const PLANET_NEAR_VIEW_CHUNK_SPECS: readonly PlanetNearViewChunkSpec[] = [
	{ lod: 0, sizeMeters: 512, resolution: 32, radius: 2 },
	{ lod: 1, sizeMeters: 2_560, resolution: 20, radius: 2 },
	{ lod: 2, sizeMeters: 12_800, resolution: 12, radius: 2 },
	{ lod: 3, sizeMeters: 64_000, resolution: 8, radius: 2 },
	{ lod: 4, sizeMeters: 320_000, resolution: 4, radius: 2 },
];

const MAX_CACHED_CHUNKS = 150;
const HORIZON_COVERAGE_MARGIN = 1.12;

export class PlanetNearViewTerrain {
	readonly group = new THREE.Group();
	private readonly chunks = new Map<string, TerrainChunk>();
	private readonly material: THREE.MeshStandardMaterial;
	private readonly visualProfile: PlanetNearViewVisualProfile;
	private readonly chartCenter: THREE.Vector3;
	private readonly chartOrigin: THREE.Vector3;
	private readonly east = new THREE.Vector3();
	private readonly north = new THREE.Vector3();
	private frameNumber = 0;
	private generatedChunks = 0;
	private activeLodCount = 0;
	private coverageRadiusMeters = 0;
	private horizonDistanceMeters = 0;

	constructor(
		private readonly sampler: PlanetTerrainSampler,
		private readonly referenceFrame: PlanetReferenceFrame,
		chartCenterDirection: THREE.Vector3,
	) {
		this.group.name = 'PlanetNearViewTerrain';
		this.chartCenter = chartCenterDirection.clone().normalize();
		this.chartOrigin = this.sampler.getSurfacePosition(this.chartCenter);
		this.createTangentBasis(this.chartCenter, this.east, this.north);
		this.visualProfile = createPlanetNearViewVisualProfile(
			this.sampler.definition,
		);
		this.material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: this.visualProfile.roughness,
			metalness: this.visualProfile.metalness,
			side: THREE.FrontSide,
		});
	}

	update(
		observerPlanetMeters: THREE.Vector3,
		altitudeAboveTerrainMeters: number,
	): PlanetNearViewTerrainStats {
		this.frameNumber++;

		const observerOffset = observerPlanetMeters.clone().sub(this.chartOrigin);
		const localX = observerOffset.dot(this.east);
		const localY = observerOffset.dot(this.north);
		const desired = new Set<string>();
		this.horizonDistanceMeters = getPlanetHorizonDistance(
			this.sampler.radiusMeters,
			altitudeAboveTerrainMeters,
		);
		const requiredCoverage = this.horizonDistanceMeters * HORIZON_COVERAGE_MARGIN;
		const activeSpecs = getActiveChunkSpecs(requiredCoverage);
		this.activeLodCount = activeSpecs.length;
		this.coverageRadiusMeters = getChunkSpecCoverageRadius(
			activeSpecs[activeSpecs.length - 1],
		);

		let coveredBounds: ChartBounds | null = null;

		for (const spec of activeSpecs) {
			const centerX = Math.round(localX / spec.sizeMeters);
			const centerY = Math.round(localY / spec.sizeMeters);

			for (let y = -spec.radius; y <= spec.radius; y++) {
				for (let x = -spec.radius; x <= spec.radius; x++) {
					const addressX = centerX + x;
					const addressY = centerY + y;
					if (isChunkCovered(
						addressX,
						addressY,
						spec.sizeMeters,
						coveredBounds,
					)) {
						continue;
					}

					const address = {
						lod: spec.lod,
						x: addressX,
						y: addressY,
					};
					const key = getChunkKey(address);
					desired.add(key);
					const chunk = this.chunks.get(key) ?? this.createChunk(address, spec);
					chunk.lastUsedFrame = this.frameNumber;
					chunk.mesh.visible = true;
				}
			}

			coveredBounds = getSpecChartBounds(spec, centerX, centerY);
		}

		for (const [key, chunk] of this.chunks) {
			chunk.mesh.visible = desired.has(key);
			chunk.mesh.position.subVectors(
				chunk.buildOrigin,
				this.referenceFrame.originPlanetMeters,
			);
		}

		this.trimCache(desired);

		return this.getStats();
	}

	setEnabled(enabled: boolean): void {
		this.group.visible = enabled;

		if (!enabled) {
			for (const chunk of this.chunks.values()) {
				chunk.mesh.visible = false;
			}
		}
	}

	getStats(): PlanetNearViewTerrainStats {
		let visibleChunks = 0;

		if (this.group.visible) {
			for (const chunk of this.chunks.values()) {
				if (chunk.mesh.visible) visibleChunks++;
			}
		}

		return {
			visibleChunks,
			cachedChunks: this.chunks.size,
			generatedChunks: this.generatedChunks,
			finestLod: 0,
			shiftCount: this.referenceFrame.getShiftCount(),
			activeLodCount: this.activeLodCount,
			coverageRadiusMeters: this.coverageRadiusMeters,
			horizonDistanceMeters: this.horizonDistanceMeters,
		};
	}

	dispose(): void {
		for (const chunk of this.chunks.values()) {
			chunk.mesh.geometry.dispose();
		}

		this.chunks.clear();
		this.material.dispose();
		this.group.clear();
	}

	private createChunk(
		address: PlanetTerrainChunkAddress,
		spec: PlanetNearViewChunkSpec,
	): TerrainChunk {
		const buildOrigin = this.referenceFrame.originPlanetMeters.clone();
		const geometry = this.createChunkGeometry(address, spec, buildOrigin);
		const mesh = new THREE.Mesh(geometry, this.material);
		mesh.name = `PlanetTerrainChunk:${getChunkKey(address)}`;
		mesh.frustumCulled = true;
		mesh.renderOrder = address.lod;
		this.group.add(mesh);

		const chunk = {
			address,
			mesh,
			buildOrigin,
			lastUsedFrame: this.frameNumber,
		};
		this.chunks.set(getChunkKey(address), chunk);
		this.generatedChunks++;

		return chunk;
	}

	private createChunkGeometry(
		address: PlanetTerrainChunkAddress,
		spec: PlanetNearViewChunkSpec,
		buildOrigin: THREE.Vector3,
	): THREE.BufferGeometry {
		const rowSize = spec.resolution + 1;
		const positions: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];
		const centerX = address.x * spec.sizeMeters;
		const centerY = address.y * spec.sizeMeters;

		for (let y = 0; y <= spec.resolution; y++) {
			for (let x = 0; x <= spec.resolution; x++) {
				const chartX = centerX + (x / spec.resolution - 0.5) * spec.sizeMeters;
				const chartY = centerY + (y / spec.resolution - 0.5) * spec.sizeMeters;
				const direction = this.chartCenter.clone()
					.multiplyScalar(this.sampler.radiusMeters)
					.addScaledVector(this.east, chartX)
					.addScaledVector(this.north, chartY)
					.normalize();
				const sample = this.sampler.sample(direction, false);
				const position = direction
					.multiplyScalar(
						sample.surfaceRadiusMeters - address.lod * 0.45,
					)
					.sub(buildOrigin);
				const color = getNearViewSurfaceColor(
					sample,
					this.visualProfile,
				);

				positions.push(position.x, position.y, position.z);
				colors.push(color.r, color.g, color.b);
			}
		}

		appendRegularGridIndices(indices, spec.resolution, rowSize);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();

		return geometry;
	}

	private trimCache(desired: Set<string>): void {
		if (this.chunks.size <= MAX_CACHED_CHUNKS) return;

		const candidates = [...this.chunks.entries()]
			.filter(([key]) => !desired.has(key))
			.sort((a, b) => a[1].lastUsedFrame - b[1].lastUsedFrame);

		for (const [key, chunk] of candidates) {
			if (this.chunks.size <= MAX_CACHED_CHUNKS) break;
			this.group.remove(chunk.mesh);
			chunk.mesh.geometry.dispose();
			this.chunks.delete(key);
		}
	}

	private createTangentBasis(
		normal: THREE.Vector3,
		outEast: THREE.Vector3,
		outNorth: THREE.Vector3,
	): void {
		const reference = Math.abs(normal.y) < 0.92
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		outEast.crossVectors(reference, normal).normalize();
		outNorth.crossVectors(normal, outEast).normalize();
	}
}

export function getChunkKey(address: PlanetTerrainChunkAddress): string {
	return `${address.lod}:${address.x}:${address.y}`;
}

export function getPlanetHorizonDistance(
	planetRadiusMeters: number,
	altitudeMeters: number,
): number {
	const altitude = Math.max(0, altitudeMeters);
	return Math.sqrt(altitude * (2 * planetRadiusMeters + altitude));
}

export function getChunkSpecCoverageRadius(spec: PlanetNearViewChunkSpec): number {
	return (spec.radius + 0.5) * spec.sizeMeters;
}

function getActiveChunkSpecs(
	requiredCoverageMeters: number,
): readonly PlanetNearViewChunkSpec[] {
	for (let index = 0; index < PLANET_NEAR_VIEW_CHUNK_SPECS.length; index++) {
		if (
			getChunkSpecCoverageRadius(PLANET_NEAR_VIEW_CHUNK_SPECS[index]) >=
			requiredCoverageMeters
		) {
			return PLANET_NEAR_VIEW_CHUNK_SPECS.slice(0, index + 1);
		}
	}

	return PLANET_NEAR_VIEW_CHUNK_SPECS;
}

function getSpecChartBounds(
	spec: PlanetNearViewChunkSpec,
	centerX: number,
	centerY: number,
): ChartBounds {
	return {
		minX: (centerX - spec.radius - 0.5) * spec.sizeMeters,
		maxX: (centerX + spec.radius + 0.5) * spec.sizeMeters,
		minY: (centerY - spec.radius - 0.5) * spec.sizeMeters,
		maxY: (centerY + spec.radius + 0.5) * spec.sizeMeters,
	};
}

function isChunkCovered(
	x: number,
	y: number,
	sizeMeters: number,
	coveredBounds: ChartBounds | null,
): boolean {
	if (!coveredBounds) return false;

	const halfSize = sizeMeters * 0.5;
	const minX = x * sizeMeters - halfSize;
	const maxX = x * sizeMeters + halfSize;
	const minY = y * sizeMeters - halfSize;
	const maxY = y * sizeMeters + halfSize;
	const epsilon = 0.001;

	return minX >= coveredBounds.minX - epsilon &&
		maxX <= coveredBounds.maxX + epsilon &&
		minY >= coveredBounds.minY - epsilon &&
		maxY <= coveredBounds.maxY + epsilon;
}
