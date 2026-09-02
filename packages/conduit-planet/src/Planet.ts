import * as THREE from 'three';

import {createTerrainSeedConfig, type TerrainSeedConfig} from './terrain/noise';

import {CubeSphere} from './CubeSphere';
import {CloudLayer} from './CloudLayer';
import {AtmosphereLayer} from './AtmosphereLayer';
import {WebGPUAtmosphereLayer} from './WebGPUAtmosphereLayer';
import {WebGPUCloudLayer} from './WebGPUCloudLayer';
import {
	createPlanetSurfaceRuntimeMaterial,
	type PlanetSurfaceRenderTuning,
	type PlanetSurfaceRuntimeMaterial,
} from './materials/PlanetSurfaceMaterialFactory';
import {GasGiantLayer} from './GasGiantLayer';
import {RingSystemLayer} from './RingSystemLayer';
import {MoonSystemLayer} from './MoonSystemLayer';
import {ToxicHazeLayer} from './ToxicHazeLayer';
import {NearSurfaceTerrainLayer} from './NearSurfaceTerrainLayer';
import {getPlanetRenderHeightScale} from './near-view/PlanetElevationProfile';
import {
	createPlanetDefinitionStats,
	type PlanetDefinitionStats,
} from './runtime/PlanetDiagnostics';

import type {TerrainTextureSet} from './TerrainTextureSet';
import type {PlanetDefinition} from '@conduit/planet/model';
import type {PlanetRenderProfile} from '@conduit/planet/rendering';
import {createSurfaceRenderProfile, type SurfaceRenderProfile,} from '@conduit/planet/rendering';
import {resolveTerrainProfileKind} from '@conduit/planet/rendering';
import {
	createAtmosphereRenderProfileValues,
	type AtmosphereRenderProfileValues,
} from '@conduit/planet/rendering';

import {
	getPlanetMoonSystemSeed,
	getPlanetRingLayerRuntimeProfile,
	mergePlanetRenderFeatures,
	type PlanetRenderFeatures,
} from '@conduit/planet/rendering';

export type PlanetRenderQuality = 'moving' | 'idle';
export type PlanetRendererMode = 'webgl' | 'webgpu';

export type PlanetRenderTuning = {
	ambient: number;
	exposureScale: number;
	horizonGlowScale: number;
	surfaceDetailStrength: number;
	proceduralColorStrength: number;
	surfaceTextureStrength: number;
	bakedTerrainBlend: number;
};

export type PlanetDebugLayerVisibility = Partial<{
	surface: boolean;
	atmosphere: boolean;
	clouds: boolean;
	gasLayer: boolean;
	rings: boolean;
	moons: boolean;
	nearSurfaceTerrain: boolean;
	toxicHaze: boolean;
}>;

/**
 * Phase 7a.1:
 *
 * WebGL:
 * - existing GLSL ShaderMaterial
 * - full planet with existing clouds + atmosphere
 *
 * WebGPU:
 * - renderer routing skeleton
 * - solid_surface uses existing seeded terrain stack
 * - gas_giant / ice_giant use GasGiantLayer placeholder
 */
export class Planet {
	public readonly group: THREE.Group;

	private readonly surfaceMaterial?: PlanetSurfaceRuntimeMaterial;
	private readonly planetBody?: THREE.Mesh;
	private readonly planet?: CubeSphere;
	private atmosphere?: AtmosphereLayer;
	private webGPUAtmosphere?: WebGPUAtmosphereLayer;
	private clouds?: CloudLayer;
	private webGPUClouds?: WebGPUCloudLayer;
	private readonly depthOccluder?: THREE.Mesh;
	private readonly gasGiantLayer?: GasGiantLayer;
	private ringSystemLayer?: RingSystemLayer;
	private moonSystemLayer?: MoonSystemLayer;
	private toxicHazeLayer?: ToxicHazeLayer;
	private nearSurfaceTerrainLayer?: NearSurfaceTerrainLayer;

	private readonly rendererKind: string;

	private readonly atmosphereRadius: number;

	private currentRenderQuality: PlanetRenderQuality = 'idle';
	private autoRotationEnabled = true;
	private bakedTerrainEnabled                       = true;
	private readonly features: PlanetRenderFeatures;
	private readonly surfaceProfile: SurfaceRenderProfile | null;
	private readonly terrainSeedConfig: TerrainSeedConfig;
	private readonly renderTuning: PlanetRenderTuning;

	constructor(
		private readonly radius: number,
		private readonly rendererMode: PlanetRendererMode            = 'webgl',
		private readonly terrainTextureSet: TerrainTextureSet | null = null,
		features: Partial<PlanetRenderFeatures>                      = {},
		private readonly definition: PlanetDefinition | null         = null,
		private readonly renderProfile: PlanetRenderProfile | null   = null,
	) {
		this.features       = mergePlanetRenderFeatures(features);
		this.renderTuning  = this.createDefaultRenderTuning();
		this.surfaceProfile =
			this.definition && this.renderProfile
			? createSurfaceRenderProfile(
				this.definition,
				this.renderProfile,
			)
			: null;

		this.terrainSeedConfig = createTerrainSeedConfig(
			this.definition?.render.terrainSeed ?? 1,
			resolveTerrainProfileKind(this.definition?.class),
		);

		this.rendererKind =
			this.renderProfile?.rendererKind ??
			'solid_surface';

		this.group      = new THREE.Group();
		this.group.name = 'PlanetGroup';

		this.atmosphereRadius = radius * 1.045;

		if (this.isSolidSurfaceRenderer()) {
			this.surfaceMaterial = this.createSurfaceMaterial(
				radius,
				this.atmosphereRadius,
			);

			this.configureSurfaceRaymarching();

			this.planetBody    = this.createPlanetBody(radius);
			this.planet        = this.createPlanet(radius, this.surfaceMaterial);
			this.depthOccluder = this.createDepthOccluder(radius);

			this.group.add(this.depthOccluder);
			this.group.add(this.planetBody);
			this.group.add(this.planet);

			this.createCloudLayer();
			this.createAtmosphereLayer();
			this.createToxicHazeLayer();

			this.createRingSystem();
			this.createMoonSystem();

			this.applyRenderProfile();
			this.applyRenderTuning();
			this.createNearSurfaceTerrainLayer();
			return;
		}

		this.gasGiantLayer = new GasGiantLayer({
			                                       kind:
				                                       this.rendererKind === 'ice_giant'
				                                       ? 'ice_giant'
				                                       : 'gas_giant',
			                                       radius,
			                                       seed: this.definition?.seed ?? 1,
			                                       gasInfluence:
				                                       this.definition?.composition.gas ?? 1,
			                                       rendererMode: this.rendererMode,
			                                       enableCloudParticles:
			                                       this.features.gasCloudParticles,
		                                       });

		this.group.add(this.gasGiantLayer.group);

		this.createRingSystem();
		this.createMoonSystem();

		this.applyRenderProfile();
		this.applyRenderTuning();
	}

	private isSolidSurfaceRenderer(): boolean {
		return this.rendererKind === 'solid_surface';
	}

	private createDefaultRenderTuning(): PlanetRenderTuning {
		return {
			ambient: 0.40,
			exposureScale: 1.0,
			horizonGlowScale: 1.0,
			surfaceDetailStrength: 1.0,
			proceduralColorStrength: 0.65,
			surfaceTextureStrength: 1.0,
			bakedTerrainBlend: 1.0,
		};
	}

	setRenderTuning(
		tuning: Partial<PlanetRenderTuning>,
	): void {
		if (typeof tuning.ambient === 'number') {
			this.renderTuning.ambient = THREE.MathUtils.clamp(
				tuning.ambient,
				0.12,
				1.18,
			);
		}

		if (typeof tuning.exposureScale === 'number') {
			this.renderTuning.exposureScale = THREE.MathUtils.clamp(
				tuning.exposureScale,
				0.45,
				1.85,
			);
		}

		if (typeof tuning.horizonGlowScale === 'number') {
			this.renderTuning.horizonGlowScale = THREE.MathUtils.clamp(
				tuning.horizonGlowScale,
				0.20,
				1.80,
			);
		}

		if (typeof tuning.surfaceDetailStrength === 'number') {
			this.renderTuning.surfaceDetailStrength = THREE.MathUtils.clamp(
				tuning.surfaceDetailStrength,
				0,
				1.4,
			);
		}

		if (typeof tuning.proceduralColorStrength === 'number') {
			this.renderTuning.proceduralColorStrength = THREE.MathUtils.clamp(
				tuning.proceduralColorStrength,
				0,
				1.2,
			);
		}

		if (typeof tuning.surfaceTextureStrength === 'number') {
			this.renderTuning.surfaceTextureStrength = THREE.MathUtils.clamp(
				tuning.surfaceTextureStrength,
				0,
				1.4,
			);
		}

		if (typeof tuning.bakedTerrainBlend === 'number') {
			this.renderTuning.bakedTerrainBlend = THREE.MathUtils.clamp(
				tuning.bakedTerrainBlend,
				0,
				1,
			);
		}

		this.applyRenderTuning();
	}

	getRenderTuning(): PlanetRenderTuning {
		return {
			...this.renderTuning,
		};
	}

	private applyRenderTuning(): void {
		const materialTuning: PlanetSurfaceRenderTuning = {
			ambient: this.renderTuning.ambient,
		};

		materialTuning.exposure =
			(
				this.rendererMode === 'webgpu'
				? 1.36
				: 1.24
			) * this.renderTuning.exposureScale;

		this.surfaceMaterial?.setRenderTuning?.(materialTuning);

		this.setUniform(
			'uAmbient',
			this.renderTuning.ambient,
		);
		this.setUniform(
			'uSurfaceDetailStrength',
			this.currentRenderQuality === 'moving'
			? this.renderTuning.surfaceDetailStrength * 0.25
			: this.renderTuning.surfaceDetailStrength,
		);
		this.setUniform(
			'uProceduralColorStrength',
			this.currentRenderQuality === 'moving'
			? this.renderTuning.proceduralColorStrength * 0.38
			: this.renderTuning.proceduralColorStrength,
		);
		this.setUniform(
			'uSurfaceTextureStrength',
			this.currentRenderQuality === 'moving'
			? this.renderTuning.surfaceTextureStrength * 0.35
			: this.renderTuning.surfaceTextureStrength,
		);

		this.setBakedTerrainEnabled(this.bakedTerrainEnabled);
		const bakedTerrainSetter =
			      (this.surfaceMaterial as any)?.setBakedTerrainBlend;

		if (typeof bakedTerrainSetter === 'function') {
			bakedTerrainSetter.call(
				this.surfaceMaterial,
				this.bakedTerrainEnabled
				? this.renderTuning.bakedTerrainBlend
				: 0,
			);
		}
	}

	private createCloudLayer(): void {
		if (this.renderProfile?.enableClouds === false) {
			return;
		}

		if (this.rendererMode === 'webgpu') {
			this.webGPUClouds = new WebGPUCloudLayer(this.radius);

			/**
			 * Important:
			 * WebGPUCloudLayer owns a group that contains the mesh.
			 *
			 * The origin-fix cloud shader reads the layer world position from
			 * webGPUClouds.group. If only webGPUClouds.mesh is attached to the
			 * planet, the group stays at world origin and SystemView clouds raymarch
			 * around 0/0/0 instead of around the moved planet.
			 */
			this.group.add(this.webGPUClouds.group);
			return;
		}

		this.clouds = new CloudLayer(this.radius);
		this.group.add(this.clouds.group);
	}

	private createAtmosphereLayer(): void {
		if (this.renderProfile?.enableAtmosphere === false) {
			return;
		}

		if (this.rendererMode === 'webgpu') {
			this.webGPUAtmosphere = new WebGPUAtmosphereLayer(this.radius);
			this.group.add(this.webGPUAtmosphere.mesh);
			return;
		}

		this.atmosphere = new AtmosphereLayer(this.radius);
		this.group.add(this.atmosphere.mesh);
	}

	private createToxicHazeLayer(): void {
		if (!this.isToxicSurfaceRenderer()) {
			return;
		}

		this.toxicHazeLayer = new ToxicHazeLayer({
			                                         radius: this.radius,
		                                         });

		this.group.add(this.toxicHazeLayer.mesh);
	}

	private isToxicSurfaceRenderer(): boolean {
		if (this.rendererKind !== 'solid_surface') {
			return false;
		}

		return this.definition?.class === 'toxic' ||
		       this.surfaceProfile?.palette === 'toxic';
	}

	private applyRenderProfile(): void {
		if (!this.renderProfile) {
			return;
		}

		for (const cloudLayer of [
			this.clouds,
			this.webGPUClouds,
		]) {
			const cloudProfileSetter =
				      (cloudLayer as any)?.setCloudProfile;

			if (typeof cloudProfileSetter !== 'function') {
				continue;
			}

			cloudProfileSetter.call(
				cloudLayer,
				this.renderProfile.cloudCoverage,
				this.renderProfile.atmosphereDensity,
				{
					cloudPersistence: this.renderProfile.climateCloudPersistence,
					stormActivity: this.renderProfile.climateStormActivity,
					windStrength: this.renderProfile.climateWindStrength,
					ashLoad: this.renderProfile.climateAshLoad,
				},
			);
		}

		const atmosphereRenderProfile =
			      this.getAtmosphereRenderProfileValues();

		for (const atmosphereLayer of [
			this.atmosphere,
			this.webGPUAtmosphere,
		]) {
			const atmosphereProfileSetter =
				      (atmosphereLayer as any)?.setAtmosphereProfile;

			if (typeof atmosphereProfileSetter !== 'function') {
				continue;
			}

			atmosphereProfileSetter.call(
				atmosphereLayer,
				atmosphereRenderProfile.density,
				atmosphereRenderProfile.haze,
				atmosphereRenderProfile.color,
				atmosphereRenderProfile.palette,
			);
		}

		const terrainSeedSetter =
			      (this.surfaceMaterial as any)?.setTerrainSeed;

		if (
			this.definition &&
			typeof terrainSeedSetter === 'function'
		) {
			terrainSeedSetter.call(
				this.surfaceMaterial,
				this.definition.render.terrainSeed,
			);
		}

		const surfaceProfileSetter =
			      (this.surfaceMaterial as any)?.setSurfaceProfile;

		if (
			this.surfaceProfile &&
			typeof surfaceProfileSetter === 'function'
		) {
			surfaceProfileSetter.call(
				this.surfaceMaterial,
				this.surfaceProfile,
			);
		}

		const forcedSurface =
			      new URLSearchParams(window.location.search)
				      .get('surface');

		const forcedLavaSetter =
			      (this.surfaceMaterial as any)?.setForcedLavaSurface;

		if (typeof forcedLavaSetter === 'function') {
			forcedLavaSetter.call(
				this.surfaceMaterial,
				forcedSurface === 'lava',
			);
		}
	}

	getAtmosphereRenderProfileValues(): AtmosphereRenderProfileValues {
		const density = this.renderProfile?.atmosphereDensity ?? 0;
		const haze = this.definition?.atmosphere.haze ?? 0;
		const color = this.definition?.atmosphere.color ?? '#8ec5ff';
		const palette = this.renderProfile?.atmospherePalette ?? '';

		return createAtmosphereRenderProfileValues(
			this.definition?.class,
			{
				density,
				haze,
				color,
				palette,
			},
		);
	}

	getGasGiantDebugStats(): ReturnType<GasGiantLayer['getDebugStats']> | null {
		return this.gasGiantLayer?.getDebugStats() ?? null;
	}

	setSunDirection(direction: THREE.Vector3): void {
		const normalizedDirection = direction.clone().normalize();

		this.surfaceMaterial?.setSunDirection?.(normalizedDirection);
		this.setVectorUniform(
			'uSunDirection',
			normalizedDirection,
		);
		this.clouds?.setSunDirection(normalizedDirection);
		this.webGPUClouds?.setSunDirection(normalizedDirection);
		this.atmosphere?.setSunDirection(normalizedDirection);
		this.webGPUAtmosphere?.setSunDirection(normalizedDirection);
	}

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		if (this.planet && this.autoRotationEnabled) {
			this.planet.rotation.y += 0.0008;
		}

		this.gasGiantLayer?.update(deltaSeconds, cameraPosition.length());
		this.ringSystemLayer?.update(deltaSeconds);
		this.moonSystemLayer?.update(deltaSeconds);
		this.toxicHazeLayer?.update();
		this.nearSurfaceTerrainLayer?.update(cameraPosition, deltaSeconds);

		const heightAboveSurface = cameraPosition.length() - this.radius;

		this.updateSurfaceCameraUniform(cameraPosition);
		this.updateSurfaceAtmosphereUniforms(heightAboveSurface);

		this.clouds?.update(deltaSeconds);
		this.clouds?.updateLOD(cameraPosition.length(), this.radius);

		this.webGPUClouds?.update(deltaSeconds);
		this.webGPUClouds?.updateLOD(cameraPosition.length(), this.radius);

		this.atmosphere?.update();
		this.webGPUAtmosphere?.update();

		this.planet?.updateLOD(cameraPosition);
	}

	setAutoRotationEnabled(enabled: boolean): void {
		this.autoRotationEnabled = enabled;
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.applyRenderTuning();
			this.setSurfaceRaymarchSteps(
				this.features.surfaceSteps.moving,
			);
			this.clouds?.setRenderQuality(quality);
			this.webGPUClouds?.setRenderQuality(quality);
			this.webGPUClouds?.setRaymarchSteps(
				this.features.cloudSteps.moving,
			);
			this.atmosphere?.setRenderQuality(quality);
			this.webGPUAtmosphere?.setRenderQuality(quality);
			this.webGPUAtmosphere?.setRaymarchSteps(
				this.features.atmosphereSteps.moving,
			);
			return;
		}

		this.applyRenderTuning();
		this.setSurfaceRaymarchSteps(
			this.features.surfaceSteps.idle,
		);
		this.clouds?.setRenderQuality(quality);
		this.webGPUClouds?.setRenderQuality(quality);
		this.webGPUClouds?.setRaymarchSteps(
			this.features.cloudSteps.idle,
		);
		this.atmosphere?.setRenderQuality(quality);
		this.webGPUAtmosphere?.setRenderQuality(quality);
		this.webGPUAtmosphere?.setRaymarchSteps(
			this.features.atmosphereSteps.idle,
		);
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.planet?.setHorizonCullingEnabled(enabled);
	}

	setPatchFrustumCullingEnabled(enabled: boolean): void {
		this.planet?.setPatchFrustumCullingEnabled(enabled);
	}

	private configureSurfaceRaymarching(): void {
		if (!this.surfaceMaterial) {
			return;
		}

		const setter = (this.surfaceMaterial as any).setRaymarchedSurfaceEnabled;

		if (typeof setter === 'function') {
			setter(
				this.rendererMode === 'webgpu' &&
				this.features.raymarchedSurface,
			);
		}

		this.setSurfaceRaymarchSteps(
			this.currentRenderQuality === 'moving'
			? this.features.surfaceSteps.moving
			: this.features.surfaceSteps.idle,
		);
	}

	private setSurfaceRaymarchSteps(steps: number): void {
		if (!this.surfaceMaterial) {
			return;
		}

		const setter = (this.surfaceMaterial as any).setSurfaceRaymarchSteps;

		if (typeof setter !== 'function') {
			return;
		}

		setter(
			this.features.raymarchedSurface
			? steps
			: 0,
		);
	}

	private createRingSystem(): void {
		if (!this.definition) {
			return;
		}

		const ringProfile = getPlanetRingLayerRuntimeProfile(
			this.definition,
			this.renderProfile,
		);

		if (!ringProfile.enabled) {
			return;
		}

		this.ringSystemLayer = new RingSystemLayer({
			                                           radius: this.radius,
			                                           seed: ringProfile.seed,
			                                           opacity:
				                                           this.rendererKind === 'solid_surface'
				                                           ? 0.46
				                                           : 0.74,
		                                           });

		this.group.add(this.ringSystemLayer.group);
	}

	private createMoonSystem(): void {
		if (!this.features.moonSystem || !this.definition) {
			return;
		}

		const moonCount = this.definition.moons.length;

		if (moonCount <= 0) {
			return;
		}

		this.moonSystemLayer = new MoonSystemLayer({
			                                           radius: this.radius,
			                                           seed: getPlanetMoonSystemSeed(this.definition),
			                                           moonCount,
			                                           parentKind: this.rendererKind,
		                                           });

		this.group.add(this.moonSystemLayer.group);
	}

	private createNearSurfaceTerrainLayer(): void {
		if (!this.features.nearSurfaceTerrain) {
			return;
		}

		if (this.nearSurfaceTerrainLayer) {
			return;
		}

		if (!this.definition || !this.surfaceProfile) {
			return;
		}

		if (this.rendererKind !== 'solid_surface') {
			return;
		}

		this.nearSurfaceTerrainLayer = new NearSurfaceTerrainLayer({
			                                                           radius: this.radius,
			                                                           terrainSeedConfig: this.terrainSeedConfig,
			                                                           surfaceProfile: this.surfaceProfile,
		                                                           });

		this.group.add(this.nearSurfaceTerrainLayer.group);
	}

	private createSurfaceMaterial(
		radius: number,
		atmosphereRadius: number,
	): PlanetSurfaceRuntimeMaterial {
		return createPlanetSurfaceRuntimeMaterial({
			                                          rendererMode: this.rendererMode,
			                                          radius,
			                                          atmosphereRadius,
			                                          terrainTextureSet: this.terrainTextureSet,
		                                          });
	}

	private updateSurfaceCameraUniform(cameraPosition: THREE.Vector3): void {
		const uniform = this.surfaceMaterial?.uniforms?.uCameraPosition;

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
			THREE.MathUtils.lerp(
				0.72,
				2.25,
				cinematicAtmosphere,
			) * this.renderTuning.horizonGlowScale,
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
			THREE.MathUtils.lerp(
				1.14,
				1.30,
				veryLowAtmosphere,
			) * this.renderTuning.exposureScale,
		);

		if (this.rendererMode === 'webgpu') {
			const surfaceExposure = THREE.MathUtils.lerp(
				1.52,
				1.72,
				veryLowAtmosphere,
			);

			const surfaceAmbient = THREE.MathUtils.lerp(
				this.renderTuning.ambient,
				Math.max(this.renderTuning.ambient, 0.74),
				veryLowAtmosphere,
			);

			this.surfaceMaterial?.setRenderTuning?.({
				                                        ambient: surfaceAmbient,
				                                        exposure: surfaceExposure * this.renderTuning.exposureScale,
			                                        });
		}
	}

	private setUniform(name: string, value: number): void {
		const uniform = this.surfaceMaterial?.uniforms?.[name];

		if (!uniform) {
			return;
		}

		uniform.value = value;
	}

	private setVectorUniform(name: string, value: THREE.Vector3): void {
		const uniform = this.surfaceMaterial?.uniforms?.[name];

		if (!uniform || !(uniform.value instanceof THREE.Vector3)) {
			return;
		}

		uniform.value.copy(value);
	}

	private createPlanet(
		radius: number,
		material: THREE.Material,
	): CubeSphere {
		const cubeSphere = new CubeSphere(
			radius,
			24,
			material,
			this.rendererMode === 'webgpu',
			this.terrainSeedConfig,
			this.definition
				? getPlanetRenderHeightScale(this.definition, radius)
				: 1,
		);

		cubeSphere.name        = 'PlanetTerrain';
		cubeSphere.renderOrder = 0;

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

		mesh.name        = 'PlanetBody';
		mesh.renderOrder = -10;

		return mesh;
	}

	private createDepthOccluder(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.999, 128, 128);

		const material = new THREE.MeshBasicMaterial({
			                                             colorWrite: false,
			                                             depthWrite: true,
			                                             depthTest: true,
			                                             side: THREE.FrontSide,
		                                             });

		const mesh = new THREE.Mesh(geometry, material);

		mesh.name        = 'PlanetDepthOccluder';
		mesh.renderOrder = -50;

		return mesh;
	}

	setBakedTerrainEnabled(enabled: boolean): void {
		this.bakedTerrainEnabled = enabled;

		const setter = (this.surfaceMaterial as any)?.setBakedTerrainBlend;

		if (typeof setter !== 'function') {
			return;
		}

		setter(
			enabled
			? this.renderTuning.bakedTerrainBlend
			: 0.0,
		);
	}

	toggleBakedTerrain(): boolean {
		this.setBakedTerrainEnabled(
			!this.bakedTerrainEnabled,
		);

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
		const image   = texture.image as {
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

	getPlanetDefinitionStats(): PlanetDefinitionStats {
		return createPlanetDefinitionStats(
			this.definition,
			this.renderProfile,
			this.surfaceProfile,
			this.nearSurfaceTerrainLayer?.getDebugStats?.() ?? null,
		);
	}

	setDebugLayerVisibility(
		visibility: PlanetDebugLayerVisibility,
	): void {
		if (visibility.surface !== undefined) {
			for (const object of [
				this.depthOccluder,
				this.planetBody,
				this.planet,
			]) {
				if (object) {
					object.visible = visibility.surface;
				}
			}
		}

		if (visibility.atmosphere !== undefined) {
			for (const object of [
				this.atmosphere?.mesh,
				this.webGPUAtmosphere?.mesh,
			]) {
				if (object) {
					object.visible = visibility.atmosphere;
				}
			}
		}

		if (visibility.clouds !== undefined) {
			for (const object of [
				this.clouds?.group,
				this.webGPUClouds?.group,
			]) {
				if (object) {
					object.visible = visibility.clouds;
				}
			}
		}

		if (visibility.gasLayer !== undefined && this.gasGiantLayer) {
			this.gasGiantLayer.group.visible = visibility.gasLayer;
		}

		if (visibility.rings !== undefined && this.ringSystemLayer) {
			this.ringSystemLayer.group.visible = visibility.rings;
		}

		if (visibility.moons !== undefined && this.moonSystemLayer) {
			this.moonSystemLayer.group.visible = visibility.moons;
		}

		if (
			visibility.nearSurfaceTerrain !== undefined &&
			this.nearSurfaceTerrainLayer
		) {
			this.nearSurfaceTerrainLayer.group.visible =
				visibility.nearSurfaceTerrain;
		}

		if (visibility.toxicHaze !== undefined && this.toxicHazeLayer) {
			this.toxicHazeLayer.mesh.visible = visibility.toxicHaze;
		}
	}

	getRenderFeatureStats(): {
		clouds: {
			raymarched: boolean;
			steps: number;
		};
		atmosphere: {
			raymarched: boolean;
			steps: number;
		};
		surface: {
			raymarched: boolean;
			steps: number;
		};
	} {
		const qualitySteps =
			      this.currentRenderQuality === 'moving'
			      ? 'moving'
			      : 'idle';

		return {
			clouds: {
				raymarched: this.features.raymarchedClouds,
				steps:
					this.webGPUClouds?.getRaymarchSteps() ??
					this.features.cloudSteps[qualitySteps],
			},
			atmosphere: {
				raymarched: this.features.raymarchedAtmosphere,
				steps:
					this.webGPUAtmosphere?.getRaymarchSteps() ??
					this.features.atmosphereSteps[qualitySteps],
			},
			surface: {
				raymarched: this.features.raymarchedSurface,
				steps:
					(this.surfaceMaterial as any)?.getSurfaceRaymarchSteps?.() ??
					this.features.surfaceSteps[qualitySteps],
			},
		};
	}

	dispose(): void {
		this.moonSystemLayer?.dispose();
		this.toxicHazeLayer?.dispose();
		this.nearSurfaceTerrainLayer?.dispose();

		this.group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) {
				return;
			}

			object.geometry?.dispose();

			const material = object.material;

			if (Array.isArray(material)) {
				for (const item of material) {
					item.dispose();
				}

				return;
			}

			material?.dispose();
		});
	}

	getTerrainStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
		profile: import('./CubeSphere').TerrainLodProfile;
		approximateVertexSpacing: number;
		morphingPatches: number;
		balance: {
			splits: number;
			passes: number;
			violations: number;
		};
		horizon: {
			tested: number;
			visible: number;
			culled: number;
			forcedVisibleNearSurface: number;
			disabled: number;
		};
	} {
		if (!this.planet) {
			return {
				totalPatches: 0,
				visibleMeshes: 0,
				maxLevel: 0,
				profile: 'far',
				approximateVertexSpacing: 0,
				morphingPatches: 0,
				balance: {
					splits: 0,
					passes: 0,
					violations: 0,
				},
				horizon: {
					tested: 0,
					visible: 0,
					culled: 0,
					forcedVisibleNearSurface: 0,
					disabled: 1,
				},
			};
		}

		return {
			...this.planet.getStats(),
			horizon: this.planet.getHorizonCullingStats(),
		};
	}
}
