import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import { GpuRegionalSurfaceTerrain } from './GpuRegionalSurfaceTerrain';
import { applyRegionalHydraulicErosion } from '../../terrain/erosion/RegionalHydraulicErosion';

/**
 * Adds one deterministic hydraulic-erosion pass to every newly baked regional
 * Float32 heightfield without changing the stable GPU terrain renderer itself.
 */
export class HydraulicRegionalSurfaceTerrain extends GpuRegionalSurfaceTerrain {
	private lastHeightTexture: THREE.Texture | null = null;
	private readonly erosionSeed: number;

	constructor(
		private readonly hydraulicDefinition: PlanetDefinition,
		renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		super(hydraulicDefinition, renderRadius, cameraRenderPosition);
		this.erosionSeed = hydraulicDefinition.render.terrainSeed;
		this.applyHydraulicPass(cameraRenderPosition);
	}

	override update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		super.update(cameraRenderPosition, opacity);
		this.applyHydraulicPass(cameraRenderPosition);
	}

	private applyHydraulicPass(cameraRenderPosition: THREE.Vector3): void {
		const mesh = this.group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
		if (!mesh) return;

		const material = mesh.material as THREE.MeshStandardMaterial;
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

		// Keep macro terrain recognizable; hydraulic erosion is a meso-detail pass.
		const blend = getHydraulicBlend(this.hydraulicDefinition.class);
		for (let i = 0; i < count; i++) {
			const value = THREE.MathUtils.clamp(
				THREE.MathUtils.lerp(original[i], heights[i], blend),
				0,
				1,
			);
			const offset = i * 4;
			heightData[offset] = value;
			heightData[offset + 1] = value;
			heightData[offset + 2] = value;
		}
		heightTexture.needsUpdate = true;

		this.rebuildDerivedMaps(material, heightData, resolution);
		this.lastHeightTexture = heightTexture;
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
				const dx = (right - left) * 5.4;
				const dy = (up - down) * 5.4;
				const inv = 1 / Math.max(0.000001, Math.hypot(dx, dy, 1));
				normalData[o] = toByte(-dx * inv * 0.5 + 0.5);
				normalData[o + 1] = toByte(-dy * inv * 0.5 + 0.5);
				normalData[o + 2] = toByte(inv * 0.5 + 0.5);
				normalData[o + 3] = 255;

				if (aoData instanceof Uint8Array) {
					const curvature = Math.abs(left + right + down + up - h * 4);
					const cavity = THREE.MathUtils.clamp(curvature * 6.5, 0, 0.48);
					const value = toByte(THREE.MathUtils.clamp(1 - cavity, 0.42, 1));
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

function hashDirection(direction: THREE.Vector3): number {
	const x = Math.round((direction.x + 1) * 8192);
	const y = Math.round((direction.y + 1) * 8192);
	const z = Math.round((direction.z + 1) * 8192);
	return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
}

function toByte(value: number): number {
	return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}
