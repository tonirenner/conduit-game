import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import { GpuRegionalSurfaceTerrain } from './GpuRegionalSurfaceTerrain';
import { applyRegionalHydraulicErosion } from './RegionalHydraulicErosion';

const ORBIT_HANDOFF_START_METERS = 9_000_000;
const ORBIT_HANDOFF_END_METERS = 7_500_000;
const EDGE_MORPH_WIDTH = 0.10;

/**
 * Adds deterministic hydraulic erosion plus a geometry-only orbit -> regional
 * handoff without changing the stable GPU terrain renderer itself.
 */
export class HydraulicRegionalSurfaceTerrain extends GpuRegionalSurfaceTerrain {
	private lastHeightTexture: THREE.Texture | null = null;
	private readonly erosionSeed: number;
	private readonly planetRadiusMeters: number;
	private hydraulicHeight: Float32Array | null = null;
	private hydraulicResolution = 0;
	private rawDisplacementScale = 0;
	private rawDisplacementBias = 0;
	private lastSeamStrength = Number.NaN;

	constructor(
		private readonly hydraulicDefinition: PlanetDefinition,
		private readonly hydraulicRenderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		super(hydraulicDefinition, hydraulicRenderRadius, cameraRenderPosition);
		this.erosionSeed = hydraulicDefinition.render.terrainSeed;
		this.planetRadiusMeters = getPlanetRadiusMeters(hydraulicDefinition);
		this.applyHydraulicPass(cameraRenderPosition);
		this.applyPresentation(cameraRenderPosition, true);
	}

	override update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		super.update(cameraRenderPosition, opacity);
		this.applyHydraulicPass(cameraRenderPosition);
		this.applyPresentation(cameraRenderPosition, false);
	}

	override dispose(): void {
		this.hydraulicHeight = null;
		super.dispose();
	}

	private getTerrainMaterial(): THREE.MeshStandardMaterial | null {
		const mesh = this.group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
		return mesh ? mesh.material as THREE.MeshStandardMaterial : null;
	}

	private getAltitudeMeters(cameraRenderPosition: THREE.Vector3): number {
		return Math.max(
			0,
			(cameraRenderPosition.length() / this.hydraulicRenderRadius - 1) * this.planetRadiusMeters,
		);
	}

	private applyHydraulicPass(cameraRenderPosition: THREE.Vector3): void {
		const material = this.getTerrainMaterial();
		if (!material) return;

		const heightTexture = material.displacementMap as THREE.DataTexture | null;
		if (!heightTexture || heightTexture === this.lastHeightTexture) return;

		const image = heightTexture.image as { data?: ArrayBufferView; width?: number; height?: number };
		if (!(image.data instanceof Float32Array) || !image.width || image.width !== image.height) return;

		const resolution = image.width;
		const count = resolution * resolution;
		const heightData = image.data;
		const heights = new Float32Array(count);
		const original = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			const value = heightData[i * 4];
			heights[i] = value;
			original[i] = value;
		}

		const direction = cameraRenderPosition.clone().normalize();
		const spatialSeed = hashDirection(direction);
		applyRegionalHydraulicErosion(
			heights,
			resolution,
			this.hydraulicDefinition.class,
			this.erosionSeed ^ spatialSeed,
		);

		// Keep macro terrain recognizable; hydraulic erosion stays a meso pass.
		const blend = getHydraulicBlend(this.hydraulicDefinition.class);
		this.hydraulicHeight = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			const value = THREE.MathUtils.clamp(
				THREE.MathUtils.lerp(original[i], heights[i], blend),
				0,
				1,
			);
			this.hydraulicHeight[i] = value;
			const offset = i * 4;
			heightData[offset] = value;
			heightData[offset + 1] = value;
			heightData[offset + 2] = value;
		}
		heightTexture.needsUpdate = true;

		this.hydraulicResolution = resolution;
		this.rawDisplacementScale = material.displacementScale;
		this.rawDisplacementBias = material.displacementBias;
		material.normalScale.set(1.35, 1.35);
		material.aoMapIntensity = 0.78;

		// The previous local alpha feather exposed the orbit renderer through the
		// regional patch and created bright islands. Keep the patch closed and let
		// geometry do the handoff instead.
		if (material.alphaMap) {
			material.alphaMap = null;
			material.needsUpdate = true;
		}

		this.rebuildDerivedMaps(material, heightData, resolution);
		this.lastHeightTexture = heightTexture;
		this.lastSeamStrength = Number.NaN;
	}

	private applyPresentation(cameraRenderPosition: THREE.Vector3, force: boolean): void {
		const material = this.getTerrainMaterial();
		const heightTexture = material?.displacementMap as THREE.DataTexture | null;
		if (!material || !heightTexture || !this.hydraulicHeight || this.hydraulicResolution <= 0) return;

		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		const relief = getReliefScale(altitudeMeters);
		material.displacementScale = this.rawDisplacementScale * relief;
		material.displacementBias = this.rawDisplacementBias * relief;

		const seamStrength = THREE.MathUtils.smoothstep(
			altitudeMeters,
			ORBIT_HANDOFF_END_METERS,
			ORBIT_HANDOFF_START_METERS,
		);
		if (!force && Number.isFinite(this.lastSeamStrength) && Math.abs(seamStrength - this.lastSeamStrength) < 0.025) return;

		const image = heightTexture.image as { data?: ArrayBufferView };
		if (!(image.data instanceof Float32Array)) return;
		const heightData = image.data;
		const resolution = this.hydraulicResolution;
		const neutralHeight = this.rawDisplacementScale !== 0
			? THREE.MathUtils.clamp(-this.rawDisplacementBias / this.rawDisplacementScale, 0, 1)
			: 0.5;

		for (let y = 0; y < resolution; y++) {
			const v = y / Math.max(1, resolution - 1);
			for (let x = 0; x < resolution; x++) {
				const u = x / Math.max(1, resolution - 1);
				const i = y * resolution + x;
				const edgeDistance = Math.min(u, 1 - u, v, 1 - v);
				const interior = smooth01(edgeDistance / EDGE_MORPH_WIDTH);
				const edgeMorph = seamStrength * (1 - interior);
				const value = THREE.MathUtils.lerp(this.hydraulicHeight[i], neutralHeight, edgeMorph);
				const offset = i * 4;
				heightData[offset] = value;
				heightData[offset + 1] = value;
				heightData[offset + 2] = value;
			}
		}
		heightTexture.needsUpdate = true;
		this.lastSeamStrength = seamStrength;
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
				const i = y * resolution + x;
				const o = i * 4;
				const h = sample(x, y);
				const left = sample(x - 1, y);
				const right = sample(x + 1, y);
				const down = sample(x, y - 1);
				const up = sample(x, y + 1);
				const dx = (right - left) * 4.6;
				const dy = (up - down) * 4.6;
				const inv = 1 / Math.max(0.000001, Math.hypot(dx, dy, 1));
				normalData[o] = toByte(-dx * inv * 0.5 + 0.5);
				normalData[o + 1] = toByte(-dy * inv * 0.5 + 0.5);
				normalData[o + 2] = toByte(inv * 0.5 + 0.5);
				normalData[o + 3] = 255;

				if (aoData instanceof Uint8Array) {
					const curvature = Math.abs(left + right + down + up - h * 4);
					const cavity = THREE.MathUtils.clamp(curvature * 5.2, 0, 0.34);
					const value = toByte(THREE.MathUtils.clamp(1 - cavity, 0.58, 1));
					aoData[o] = value;
					aoData[o + 1] = value;
					aoData[o + 2] = value;
					aoData[o + 3] = 255;
				}
			}
		}

		normal.needsUpdate = true;
		if (ao && aoData instanceof Uint8Array) ao.needsUpdate = true;
	}
}

function getReliefScale(altitudeMeters: number): number {
	if (altitudeMeters >= 9_000_000) return 0.18;
	if (altitudeMeters >= 7_500_000) {
		const t = smooth01((9_000_000 - altitudeMeters) / 1_500_000);
		return THREE.MathUtils.lerp(0.18, 0.30, t);
	}
	if (altitudeMeters >= 4_500_000) {
		const t = smooth01((7_500_000 - altitudeMeters) / 3_000_000);
		return THREE.MathUtils.lerp(0.30, 0.54, t);
	}
	if (altitudeMeters >= 2_000_000) {
		const t = smooth01((4_500_000 - altitudeMeters) / 2_500_000);
		return THREE.MathUtils.lerp(0.54, 0.68, t);
	}
	if (altitudeMeters >= 500_000) {
		const t = smooth01((2_000_000 - altitudeMeters) / 1_500_000);
		return THREE.MathUtils.lerp(0.68, 0.78, t);
	}
	return 0.80;
}

function getHydraulicBlend(planetClass: PlanetDefinition['class']): number {
	switch (planetClass) {
		case 'terrestrial': return 0.52;
		case 'ocean': return 0.48;
		case 'desert': return 0.42;
		case 'toxic': return 0.34;
		case 'carbon': return 0.30;
		case 'rocky': return 0.22;
		case 'barren': return 0.18;
		case 'metal_rich': return 0.15;
		case 'ice': return 0.12;
		case 'lava': return 0;
		default: return 0.24;
	}
}

function smooth01(value: number): number {
	const t = THREE.MathUtils.clamp(value, 0, 1);
	return t * t * (3 - 2 * t);
}

function hashDirection(direction: THREE.Vector3): number {
	const x = Math.round((direction.x + 1) * 8192);
	const y = Math.round((direction.y + 1) * 8192);
	const z = Math.round((direction.z + 1) * 8192);
	return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
}

function toByte(value: number): number {
	return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}
