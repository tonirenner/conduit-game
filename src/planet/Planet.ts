import * as THREE from 'three';

import { CubeSphere } from './CubeSphere';
import { CloudLayer } from './CloudLayer';
import { AtmosphereLayer } from './AtmosphereLayer';
import { WebGPUAtmosphereLayer } from './WebGPUAtmosphereLayer';
import { WebGPUCloudLayer } from './WebGPUCloudLayer';
import { createPlanetSurfaceMaterial } from './PlanetSurfaceMaterial';
import { createPlanetSurfaceNodeMaterial } from './PlanetSurfaceNodeMaterial';

import type { TerrainTextureSet } from './TerrainTextureSet';

export type PlanetRenderQuality = 'moving' | 'idle';
export type PlanetRendererMode = 'webgl' | 'webgpu';

type PlanetSurfaceRuntimeMaterial = THREE.Material & {
	uniforms?: Record<string, {
		value: unknown;
	}>;
};

/**
 * Phase 5b.2:
 *
 * WebGL:
 * - existing GLSL ShaderMaterial
 * - full planet with existing clouds + atmosphere
 *
 * WebGPU:
 * - TSL/NodeMaterial terrain surface
 * - optional baked TerrainTextureSet for material masks
 * - lightweight WebGPU/TSL cloud shell
 * - lightweight WebGPU/TSL atmosphere shell
 */
export class Planet {
	public readonly group: THREE.Group;

	private readonly surfaceMaterial: PlanetSurfaceRuntimeMaterial;
	private readonly planetBody: THREE.Mesh;
	private readonly planet: CubeSphere;
	private readonly atmosphere?: AtmosphereLayer;
	private readonly webGPUAtmosphere?: WebGPUAtmosphereLayer;
	private readonly clouds?: CloudLayer;
	private readonly webGPUClouds?: WebGPUCloudLayer;
	private readonly depthOccluder: THREE.Mesh;

	private readonly atmosphereRadius: number;

	private currentRenderQuality: PlanetRenderQuality = 'idle';
	private bakedTerrainEnabled = true;

	constructor(
		private readonly radius: number,
		private readonly rendererMode: PlanetRendererMode = 'webgl',
		private readonly terrainTextureSet: TerrainTextureSet | null = null,
	) {
		this.group = new THREE.Group();
		this.group.name = 'PlanetGroup';

		this.atmosphereRadius = radius * 1.045;

		this.surfaceMaterial = this.createSurfaceMaterial(
			radius,
			this.atmosphereRadius,
		);

		this.planetBody = this.createPlanetBody(radius);
		this.planet = this.createPlanet(radius, this.surfaceMaterial);
		this.depthOccluder = this.createDepthOccluder(radius);

		this.group.add(this.depthOccluder);
		this.group.add(this.planetBody);
		this.group.add(this.planet);

		if (this.rendererMode === 'webgl') {
			this.clouds = new CloudLayer(radius);
			this.atmosphere = new AtmosphereLayer(radius);

			this.group.add(this.clouds.group);
			this.group.add(this.atmosphere.mesh);
		}

		if (this.rendererMode === 'webgpu') {
			this.webGPUClouds = new WebGPUCloudLayer(radius);
			this.webGPUAtmosphere = new WebGPUAtmosphereLayer(radius);

			this.group.add(this.webGPUClouds.mesh);
			this.group.add(this.webGPUAtmosphere.mesh);
		}
	}

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		this.planet.rotation.y += 0.0008;

		const heightAboveSurface = cameraPosition.length() - this.radius;

		this.updateSurfaceCameraUniform(cameraPosition);
		this.updateSurfaceAtmosphereUniforms(heightAboveSurface);

		this.clouds?.update(deltaSeconds);
		this.clouds?.updateLOD(cameraPosition.length(), this.radius);
		this.webGPUClouds?.update(deltaSeconds);

		this.atmosphere?.update();
		this.webGPUAtmosphere?.update();

		this.planet.updateLOD(cameraPosition);
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.setUniform('uSurfaceDetailStrength', 0.25);
			this.setUniform('uProceduralColorStrength', 0.25);
			this.setUniform('uSurfaceTextureStrength', 0.35);
			this.clouds?.setRenderQuality(quality);
			this.webGPUClouds?.setRenderQuality(quality);
			this.atmosphere?.setRenderQuality(quality);
			this.webGPUAtmosphere?.setRenderQuality(quality);
			return;
		}

		this.setUniform('uSurfaceDetailStrength', 1.0);
		this.setUniform('uProceduralColorStrength', 0.65);
		this.setUniform('uSurfaceTextureStrength', 1.0);
		this.clouds?.setRenderQuality(quality);
		this.webGPUClouds?.setRenderQuality(quality);
		this.atmosphere?.setRenderQuality(quality);
		this.webGPUAtmosphere?.setRenderQuality(quality);
	}

	private createSurfaceMaterial(
		radius: number,
		atmosphereRadius: number,
	): PlanetSurfaceRuntimeMaterial {
		if (this.rendererMode === 'webgpu') {
			return createPlanetSurfaceNodeMaterial(
				this.terrainTextureSet,
			) as PlanetSurfaceRuntimeMaterial;
		}

		return createPlanetSurfaceMaterial(
			radius,
			atmosphereRadius,
		) as PlanetSurfaceRuntimeMaterial;
	}

	private updateSurfaceCameraUniform(cameraPosition: THREE.Vector3): void {
		const uniform = this.surfaceMaterial.uniforms?.uCameraPosition;

		if (!uniform || !(uniform.value instanceof THREE.Vector3)) {
			return;
		}

		uniform.value.copy(cameraPosition);
	}

	private updateSurfaceAtmosphereUniforms(heightAboveSurface: number): void {
		const lowAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.10,
			1.10,
		);

		const approachAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.70,
			4.00,
		);

		const veryLowAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.05,
			0.55,
		);

		const cinematicAtmosphere = Math.max(
			lowAtmosphere,
			approachAtmosphere * 0.72,
		);

		this.setUniform(
			'uHazeStrength',
			THREE.MathUtils.lerp(0.75, 2.45, cinematicAtmosphere),
		);

		this.setUniform(
			'uMieStrength',
			THREE.MathUtils.lerp(0.44, 1.85, lowAtmosphere),
		);

		this.setUniform(
			'uHorizonGlowStrength',
			THREE.MathUtils.lerp(0.85, 3.10, cinematicAtmosphere),
		);

		this.setUniform(
			'uAtmosphereDensity',
			THREE.MathUtils.lerp(1.05, 2.75, lowAtmosphere),
		);

		this.setUniform(
			'uMaxAerialDistance',
			THREE.MathUtils.lerp(14.0, 3.2, lowAtmosphere),
		);

		this.setUniform(
			'uExposure',
			THREE.MathUtils.lerp(1.30, 1.58, veryLowAtmosphere),
		);
	}

	private setUniform(name: string, value: number): void {
		const uniform = this.surfaceMaterial.uniforms?.[name];

		if (!uniform) {
			return;
		}

		uniform.value = value;
	}

	private createPlanet(
		radius: number,
		material: THREE.Material,
	): CubeSphere {
		const cubeSphere = new CubeSphere(radius, 24, material);

		cubeSphere.name = 'PlanetTerrain';
		cubeSphere.renderOrder = 1;

		return cubeSphere;
	}

	private createPlanetBody(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.996, 128, 128);

		const material = new THREE.MeshPhongMaterial({
			                                             color: 0x0a2230,
			                                             emissive: 0x031018,
			                                             emissiveIntensity: 0.08,
			                                             shininess: 8,
			                                             specular: new THREE.Color(0x16384c),
		                                             });

		const mesh = new THREE.Mesh(geometry, material);

		mesh.name = 'PlanetBody';
		mesh.renderOrder = 0;

		return mesh;
	}

	private createDepthOccluder(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.999, 128, 128);

		const material = new THREE.MeshBasicMaterial({
			                                             colorWrite: false,
			                                             depthWrite: true,
			                                             depthTest: true,
		                                             });

		const mesh = new THREE.Mesh(geometry, material);

		mesh.name = 'PlanetDepthOccluder';
		mesh.renderOrder = -1000;

		return mesh;
	}

	setBakedTerrainEnabled(enabled: boolean): void {
		this.bakedTerrainEnabled = enabled;

		const setter = (this.surfaceMaterial as any).setBakedTerrainBlend;

		if (typeof setter !== 'function') {
			return;
		}

		setter(enabled ? 1.0 : 0.0);
	}

	toggleBakedTerrain(): boolean {
		this.setBakedTerrainEnabled(
			!this.bakedTerrainEnabled,
		);

		return this.bakedTerrainEnabled;
	}

	isBakedTerrainEnabled(): boolean {
		return this.bakedTerrainEnabled;
	}

	getTerrainTextureStats(): {
		available: boolean;
		enabled: boolean;
		resolution: number;
		atlasWidth: number;
		atlasHeight: number;
		atlasColumns: number;
		atlasRows: number;
	} {
		if (!this.terrainTextureSet) {
			return {
				available: false,
				enabled: false,
				resolution: 0,
				atlasWidth: 0,
				atlasHeight: 0,
				atlasColumns: 0,
				atlasRows: 0,
			};
		}

		const texture = this.terrainTextureSet.getDataAtlasTexture();
		const image = texture.image as {
			width?: number;
			height?: number;
		};

		return {
			available: true,
			enabled: this.bakedTerrainEnabled,
			resolution: this.terrainTextureSet.options.resolution,
			atlasWidth: image.width ?? 0,
			atlasHeight: image.height ?? 0,
			atlasColumns: this.terrainTextureSet.options.atlasColumns,
			atlasRows: this.terrainTextureSet.options.atlasRows,
		};
	}

	getTerrainStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
		horizon: {
			tested: number;
			visible: number;
			culled: number;
			forcedVisibleNearSurface: number;
			disabled: number;
		};
	} {
		return {
			...this.planet.getStats(),
			horizon: this.planet.getHorizonCullingStats(),
		};
	}
}
