import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import { HydraulicRegionalSurfaceTerrain } from './HydraulicRegionalSurfaceTerrain';

const BASE_RELIEF_EXAGGERATION = 8;
const EDGE_FEATHER_START = 0.018;
const EDGE_FEATHER_END = 0.17;

/**
 * Final handoff layer for the regional prototype.
 *
 * - morphs displacement back to the planet sphere at the patch border
 * - reduces relief exaggeration while the orbit renderer is still visible
 * - rebuilds normals/AO after the border morph so the edge does not read as a shell
 * - converts rebuilt regional geometry to non-indexed before WebGPU renders it
 */
export class RegionalSurfaceHandoffTerrain extends HydraulicRegionalSurfaceTerrain {
	private lastHeightTexture: THREE.Texture | null = null;
	private baseDisplacementScale = 0;
	private baseDisplacementBias = 0;
	private readonly physicalRadiusMeters: number;

	constructor(
		definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		super(definition, renderRadius, cameraRenderPosition);
		this.physicalRadiusMeters = getPlanetRadiusMeters(definition);
		this.applyHandoff(cameraRenderPosition);
	}

	override update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		super.update(cameraRenderPosition, opacity);
		this.applyHandoff(cameraRenderPosition);
	}

	private applyHandoff(cameraRenderPosition: THREE.Vector3): void {
		const mesh = this.group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
		if (!mesh) return;

		// GpuRegionalSurfaceTerrain may rebuild an indexed grid when its extent or
		// resolution changes. Convert it immediately, in the same update tick,
		// before WebGPU sees the mesh. This removes createIndexAttribute from the
		// production handoff path and avoids stale index-buffer lifecycle races.
		if (mesh.geometry.index) {
			const indexedGeometry = mesh.geometry;
			const nonIndexedGeometry = indexedGeometry.toNonIndexed();
			nonIndexedGeometry.computeBoundingSphere();
			mesh.geometry = nonIndexedGeometry;
			indexedGeometry.dispose();
		}

		const material = mesh.material as THREE.MeshStandardMaterial;
		const heightTexture = material.displacementMap as THREE.DataTexture | null;
		if (!heightTexture) return;

		if (heightTexture !== this.lastHeightTexture) {
			this.baseDisplacementScale = material.displacementScale / BASE_RELIEF_EXAGGERATION;
			this.baseDisplacementBias = material.displacementBias / BASE_RELIEF_EXAGGERATION;
			this.featherHeightfield(material, heightTexture);
			this.lastHeightTexture = heightTexture;
		}

		const altitudeMeters = Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.physicalRadiusMeters,
		);
		const relief = getReliefExaggeration(altitudeMeters);
		material.displacementScale = this.baseDisplacementScale * relief;
		material.displacementBias = this.baseDisplacementBias * relief;
	}

	private featherHeightfield(
		material: THREE.MeshStandardMaterial,
		heightTexture: THREE.DataTexture,
	): void {
		const image = heightTexture.image as { data?: ArrayBufferView; width?: number; height?: number };
		if (!(image.data instanceof Float32Array) || !image.width || image.width !== image.height) return;

		const resolution = image.width;
		const heightData = image.data;
		const zeroHeight = this.getZeroDisplacementHeight();

		for (let y = 0; y < resolution; y++) {
			for (let x = 0; x < resolution; x++) {
				const weight = getEdgeWeight(x, y, resolution);
				const offset = (y * resolution + x) * 4;
				const value = THREE.MathUtils.lerp(zeroHeight, heightData[offset], weight);
				heightData[offset] = value;
				heightData[offset + 1] = value;
				heightData[offset + 2] = value;
			}
		}
		heightTexture.needsUpdate = true;
		this.rebuildDerivedMaps(material, heightData, resolution);
	}

	private getZeroDisplacementHeight(): number {
		if (Math.abs(this.baseDisplacementScale) < 1e-9) return 0;
		return THREE.MathUtils.clamp(
			-this.baseDisplacementBias / this.baseDisplacementScale,
			-0.25,
			1.25,
		);
	}

	private rebuildDerivedMaps(
		material: THREE.MeshStandardMaterial,
		heightData: Float32Array,
		resolution: number,
	): void {
		const normal = material.normalMap as THREE.DataTexture | null;
		const ao = material.aoMap as THREE.DataTexture | null;
		const normalData = (normal?.image as { data?: ArrayBufferView } | undefined)?.data;
		const aoData = (ao?.image as { data?: ArrayBufferView } | undefined)?.data;
		if (!(normalData instanceof Uint8Array)) return;

		const sample = (x: number, y: number): number => {
			const px = THREE.MathUtils.clamp(x, 0, resolution - 1);
			const py = THREE.MathUtils.clamp(y, 0, resolution - 1);
			return heightData[(py * resolution + px) * 4];
		};

		for (let y = 0; y < resolution; y++) {
			for (let x = 0; x < resolution; x++) {
				const offset = (y * resolution + x) * 4;
				const h = sample(x, y);
				const left = sample(x - 1, y);
				const right = sample(x + 1, y);
				const down = sample(x, y - 1);
				const up = sample(x, y + 1);
				const dx = (right - left) * 5.0;
				const dy = (up - down) * 5.0;
				const inv = 1 / Math.max(0.000001, Math.hypot(dx, dy, 1));

				normalData[offset] = toByte(-dx * inv * 0.5 + 0.5);
				normalData[offset + 1] = toByte(-dy * inv * 0.5 + 0.5);
				normalData[offset + 2] = toByte(inv * 0.5 + 0.5);
				normalData[offset + 3] = 255;

				if (aoData instanceof Uint8Array) {
					const curvature = Math.abs(left + right + down + up - h * 4);
					const cavity = THREE.MathUtils.clamp(curvature * 4.2, 0, 0.30);
					const value = toByte(THREE.MathUtils.clamp(1 - cavity, 0.68, 1));
					aoData[offset] = value;
					aoData[offset + 1] = value;
					aoData[offset + 2] = value;
					aoData[offset + 3] = 255;
				}
			}
		}

		normal.needsUpdate = true;
		if (ao && aoData instanceof Uint8Array) ao.needsUpdate = true;
	}
}

function getReliefExaggeration(altitudeMeters: number): number {
	const t = THREE.MathUtils.clamp((9_000_000 - altitudeMeters) / 7_500_000, 0, 1);
	const smooth = t * t * (3 - 2 * t);
	return THREE.MathUtils.lerp(2.25, 6.15, smooth);
}

function getEdgeWeight(x: number, y: number, resolution: number): number {
	const pixels = Math.min(x, y, resolution - 1 - x, resolution - 1 - y);
	const distance = pixels / Math.max(1, resolution - 1);
	const t = THREE.MathUtils.clamp(
		(distance - EDGE_FEATHER_START) / (EDGE_FEATHER_END - EDGE_FEATHER_START),
		0,
		1,
	);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function toByte(value: number): number {
	return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}
