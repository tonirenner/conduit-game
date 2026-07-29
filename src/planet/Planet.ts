import * as THREE from 'three';

import {getClimateSample} from './Climate';
import {createTerrainSeedConfig, getTerrainSample, type TerrainSeedConfig} from '../utils/noise';

import {CubeSphere} from './CubeSphere';
import {CloudLayer} from './CloudLayer';
import {AtmosphereLayer} from './AtmosphereLayer';
import {WebGPUAtmosphereLayer} from './WebGPUAtmosphereLayer';
import {WebGPUCloudLayer} from './WebGPUCloudLayer';
import {createPlanetSurfaceMaterial} from './PlanetSurfaceMaterial';
import {createPlanetSurfaceNodeMaterial} from './PlanetSurfaceNodeMaterial';
import {GasGiantLayer} from './GasGiantLayer';
import {RingSystemLayer} from './RingSystemLayer';
import {MoonSystemLayer} from './MoonSystemLayer';
import {LavaPlanetLayer} from './LavaPlanetLayer';
import {
	type NearSurfaceBiome,
	NearSurfaceDetailLayer,
	type NearSurfacePlacementSample,
} from './NearSurfaceDetailLayer';

import type {TerrainTextureSet} from './TerrainTextureSet';
import type {PlanetDefinition} from './model/PlanetDefinition';
import type {PlanetRenderProfile} from './rendering/PlanetRenderProfile';
import {createSurfaceRenderProfile, type SurfaceRenderProfile,} from './rendering/SurfaceRenderProfile';

import {mergePlanetRenderFeatures, type PlanetRenderFeatures,} from './rendering/PlanetRenderFeatures';

export type PlanetRenderQuality = 'moving' | 'idle';
export type PlanetRendererMode = 'webgl' | 'webgpu';

type PlanetSurfaceRuntimeMaterial = THREE.Material & {
	uniforms?: Record<string, {
		value: unknown;
	}>;
};

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
	private readonly atmosphere?: AtmosphereLayer;
	private readonly webGPUAtmosphere?: WebGPUAtmosphereLayer;
	private readonly clouds?: CloudLayer;
	private readonly webGPUClouds?: WebGPUCloudLayer;
	private readonly depthOccluder?: THREE.Mesh;
	private readonly gasGiantLayer?: GasGiantLayer;
	private ringSystemLayer?: RingSystemLayer;
	private moonSystemLayer?: MoonSystemLayer;
	private lavaPlanetLayer?: LavaPlanetLayer;
	private nearSurfaceDetailLayer?: NearSurfaceDetailLayer;

	private readonly rendererKind: string;

	private readonly atmosphereRadius: number;

	private currentRenderQuality: PlanetRenderQuality = 'idle';
	private bakedTerrainEnabled                       = true;
	private readonly features: PlanetRenderFeatures;
	private readonly surfaceProfile: SurfaceRenderProfile | null;
	private readonly terrainSeedConfig: TerrainSeedConfig;

	constructor(
		private readonly radius: number,
		private readonly rendererMode: PlanetRendererMode            = 'webgl',
		private readonly terrainTextureSet: TerrainTextureSet | null = null,
		features: Partial<PlanetRenderFeatures>                      = {},
		private readonly definition: PlanetDefinition | null         = null,
		private readonly renderProfile: PlanetRenderProfile | null   = null,
	) {
		this.features       = mergePlanetRenderFeatures(features);
		this.surfaceProfile =
			this.definition && this.renderProfile
			? createSurfaceRenderProfile(
				this.definition,
				this.renderProfile,
			)
			: null;

		this.terrainSeedConfig = createTerrainSeedConfig(
			this.definition?.render.terrainSeed ?? 1,
		);

		this.rendererKind =
			this.renderProfile?.rendererKind ??
			'solid_surface';

		this.group      = new THREE.Group();
		this.group.name = 'PlanetGroup';

		this.atmosphereRadius = radius * 1.045;

		if (this.isSolidSurfaceRenderer()) {
			if (this.isLavaSurfaceRenderer()) {
				this.lavaPlanetLayer = new LavaPlanetLayer({
					                                           radius,
					                                           seed:
						                                           this.definition?.render.terrainSeed ??
						                                           this.definition?.seed ??
						                                           1,
				                                           });

				this.group.add(this.lavaPlanetLayer.group);

				if (this.rendererMode === 'webgl') {
					this.atmosphere = new AtmosphereLayer(radius);
					this.group.add(this.atmosphere.mesh);
				}

				if (this.rendererMode === 'webgpu') {
					this.webGPUAtmosphere = new WebGPUAtmosphereLayer(radius);
					this.group.add(this.webGPUAtmosphere.mesh);
				}

				this.createRingSystem();
				this.createMoonSystem();

				this.applyRenderProfile();
				return;
			}

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

			if (this.rendererMode === 'webgl') {
				this.clouds     = new CloudLayer(radius);
				this.atmosphere = new AtmosphereLayer(radius);

				this.group.add(this.clouds.group);
				this.group.add(this.atmosphere.mesh);
			}

			if (this.rendererMode === 'webgpu') {
				this.webGPUClouds     = new WebGPUCloudLayer(radius);
				this.webGPUAtmosphere = new WebGPUAtmosphereLayer(radius);

				this.group.add(this.webGPUClouds.mesh);
				this.group.add(this.webGPUAtmosphere.mesh);
			}

			this.createRingSystem();
			this.createMoonSystem();

			this.applyRenderProfile();
			this.createNearSurfaceDetailLayer();
			return;
		}

		this.gasGiantLayer = new GasGiantLayer({
			                                       kind:
				                                       this.rendererKind === 'ice_giant'
				                                       ? 'ice_giant'
				                                       : 'gas_giant',
			                                       radius,
			                                       seed: this.definition?.seed ?? 1,
		                                       });

		this.group.add(this.gasGiantLayer.group);

		this.webGPUAtmosphere = new WebGPUAtmosphereLayer(radius);
		this.group.add(this.webGPUAtmosphere.mesh);

		this.createRingSystem();
		this.createMoonSystem();

		this.applyRenderProfile();
	}

	private isSolidSurfaceRenderer(): boolean {
		return this.rendererKind === 'solid_surface';
	}

	private isLavaSurfaceRenderer(): boolean {
		if (this.rendererKind !== 'solid_surface') {
			return false;
		}

		if (this.definition?.class === 'lava') {
			return true;
		}

		if (this.surfaceProfile?.palette === 'lava') {
			return true;
		}

		return (
			new URLSearchParams(window.location.search)
				.get('surface') === 'lava'
		);
	}

	private applyRenderProfile(): void {
		if (!this.renderProfile) {
			return;
		}

		const cloudProfileSetter =
			      (this.webGPUClouds as any)?.setCloudProfile;

		if (typeof cloudProfileSetter === 'function') {
			cloudProfileSetter.call(
				this.webGPUClouds,
				this.renderProfile.cloudCoverage,
				this.renderProfile.atmosphereDensity,
			);
		}

		const atmosphereProfileSetter =
			      (this.webGPUAtmosphere as any)?.setAtmosphereProfile;

		if (typeof atmosphereProfileSetter === 'function') {
			atmosphereProfileSetter.call(
				this.webGPUAtmosphere,
				this.renderProfile.atmosphereDensity,
				this.definition?.atmosphere.haze ?? 0,
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

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		if (this.planet) {
			this.planet.rotation.y += 0.0008;
		}

		this.gasGiantLayer?.update(deltaSeconds);
		this.ringSystemLayer?.update(deltaSeconds);
		this.moonSystemLayer?.update(deltaSeconds);
		this.lavaPlanetLayer?.update(deltaSeconds);
		this.nearSurfaceDetailLayer?.update(cameraPosition, deltaSeconds);

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

	setRenderQuality(quality: PlanetRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.setUniform('uSurfaceDetailStrength', 0.25);
			this.setUniform('uProceduralColorStrength', 0.25);
			this.setUniform('uSurfaceTextureStrength', 0.35);
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

		this.setUniform('uSurfaceDetailStrength', 1.0);
		this.setUniform('uProceduralColorStrength', 0.65);
		this.setUniform('uSurfaceTextureStrength', 1.0);
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
		if (!this.definition?.rings?.enabled) {
			return;
		}

		const ringSeed =
			      (this.definition.render as any)?.ringSeed ??
			      this.definition.seed;

		this.ringSystemLayer = new RingSystemLayer({
			                                           radius: this.radius,
			                                           seed: ringSeed,
			                                           opacity:
				                                           this.rendererKind === 'solid_surface'
				                                           ? 0.46
				                                           : 0.74,
		                                           });

		this.group.add(this.ringSystemLayer.group);
	}

	private createMoonSystem(): void {
		const moonCount =
			      this.definition?.moons?.length ?? 0;

		if (moonCount <= 0) {
			return;
		}

		const moonSeed =
			      (this.definition.render as any)?.moonSeed ??
			      (this.definition.seed ^ 0x4411aa);

		this.moonSystemLayer = new MoonSystemLayer({
			                                           radius: this.radius,
			                                           seed: moonSeed,
			                                           moonCount,
			                                           parentKind: this.rendererKind,
		                                           });

		this.group.add(this.moonSystemLayer.group);
	}

	private createNearSurfaceDetailLayer(): void {
		if (this.nearSurfaceDetailLayer) {
			return;
		}

		if (!this.definition || !this.surfaceProfile) {
			return;
		}

		if (this.rendererKind !== 'solid_surface') {
			return;
		}

		if (this.isLavaSurfaceRenderer()) {
			return;
		}

		this.nearSurfaceDetailLayer = new NearSurfaceDetailLayer({
			                                                         radius: this.radius,
			                                                         seed:
				                                                         this.definition.render.biomeSeed ??
				                                                         this.definition.render.terrainSeed ??
				                                                         this.definition.seed,
			                                                         planetClass: this.definition.class,
			                                                         surfaceProfile: this.surfaceProfile,
			                                                         sampleSurface: (normal) => this.sampleNearSurface(
				                                                         normal),
		                                                         });

		this.group.add(this.nearSurfaceDetailLayer.group);
	}

	private sampleNearSurface(
		normal: THREE.Vector3,
	): NearSurfacePlacementSample | null {
		const terrain = getTerrainSample(normal, this.terrainSeedConfig);

		const climate = getClimateSample(
			normal,
			terrain.height,
			terrain.landMask,
		);

		const slope = this.estimateNearSurfaceSlope(normal);

		const biome = this.deriveNearSurfaceBiome(
			terrain.landMask,
			terrain.mountainMask,
			climate.temperature,
			climate.humidity,
			climate.aridity,
			climate.vegetation,
			climate.snow ?? 0,
		);

		return {
			height: terrain.height,
			surfaceRadius: this.radius + terrain.height,
			landMask: terrain.landMask,
			mountainMask: terrain.mountainMask,
			slope,

			temperature: climate.temperature,
			humidity: climate.humidity,
			aridity: climate.aridity,
			vegetation: climate.vegetation,
			snow: climate.snow ?? 0,

			biome,
		};
	}

	private deriveNearSurfaceBiome(
		landMask: number,
		mountainMask: number,
		temperature: number,
		humidity: number,
		aridity: number,
		vegetation: number,
		snow: number,
	): NearSurfaceBiome {
		if (landMask < 0.50) {
			return 'ocean';
		}

		if (landMask < 0.62) {
			return 'coast';
		}

		if (snow > 0.45 || temperature < 0.22) {
			return 'snow';
		}

		if (mountainMask > 0.58) {
			return 'rocky';
		}

		if (aridity > 0.72 && humidity < 0.35) {
			return 'desert';
		}

		if (vegetation > 0.56 && humidity > 0.55) {
			return 'forest';
		}

		if (vegetation > 0.28) {
			return 'grassland';
		}

		return 'barren';
	}

	private estimateNearSurfaceSlope(
		normal: THREE.Vector3,
	): number {
		const right   = new THREE.Vector3();
		const forward = new THREE.Vector3();

		this.createNearSurfaceTangentBasis(
			normal,
			right,
			forward,
		);

		const offset = 0.010;

		const center = getTerrainSample(normal, this.terrainSeedConfig).height;

		const sampleA = getTerrainSample(
			this.offsetNearSurfaceNormal(
				normal,
				right,
				offset,
			),
			this.terrainSeedConfig,
		).height;

		const sampleB = getTerrainSample(
			this.offsetNearSurfaceNormal(
				normal,
				forward,
				offset,
			),
			this.terrainSeedConfig,
		).height;

		return THREE.MathUtils.clamp(
			(Math.abs(center - sampleA) + Math.abs(center - sampleB)) * 18.0,
			0,
			1,
		);
	}

	private offsetNearSurfaceNormal(
		base: THREE.Vector3,
		tangent: THREE.Vector3,
		amount: number,
	): THREE.Vector3 {
		return base.clone()
			.addScaledVector(tangent, amount)
			.normalize();
	}

	private createNearSurfaceTangentBasis(
		normal: THREE.Vector3,
		outRight: THREE.Vector3,
		outForward: THREE.Vector3,
	): void {
		const up =
			      Math.abs(normal.y) < 0.92
			      ? new THREE.Vector3(0, 1, 0)
			      : new THREE.Vector3(1, 0, 0);

		outRight.copy(up)
			.cross(normal)
			.normalize();
		outForward.copy(normal)
			.cross(outRight)
			.normalize();
	}

	private createSurfaceMaterial(
		radius: number,
		atmosphereRadius: number,
	): PlanetSurfaceRuntimeMaterial {
		if (this.rendererMode === 'webgpu') {
			return createPlanetSurfaceNodeMaterial(
				radius,
				this.terrainTextureSet,
			) as PlanetSurfaceRuntimeMaterial;
		}

		return createPlanetSurfaceMaterial(
			radius,
			atmosphereRadius,
		) as PlanetSurfaceRuntimeMaterial;
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
		const uniform = this.surfaceMaterial?.uniforms?.[name];

		if (!uniform) {
			return;
		}

		uniform.value = value;
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
		);

		cubeSphere.name        = 'PlanetTerrain';
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

		mesh.name        = 'PlanetBody';
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

		mesh.name        = 'PlanetDepthOccluder';
		mesh.renderOrder = -1000;

		return mesh;
	}

	setBakedTerrainEnabled(enabled: boolean): void {
		this.bakedTerrainEnabled = enabled;

		const setter = (this.surfaceMaterial as any)?.setBakedTerrainBlend;

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

	getPlanetDefinitionStats(): {
		available: boolean;
		name: string;
		class: string;
		rendererKind: string;
		composition: {
			rock: number;
			metal: number;
			ice: number;
			water: number;
			gas: number;
			organic: number;
			volatiles: number;
		};
		atmosphere: {
			type: string;
			cloudCoverage: number;
			density: number;
		};
		rings: boolean;
		moons: number;
		terrainSeed: number;
		climate: {
			seed: number;
			biomeSeed: number;
			weatherSeed: number;
			temperature01: number;
			humidity: number;
			aridity: number;
			windStrength: number;
			stormActivity: number;
			cloudPersistence: number;
			ashLoad: number;
		};
		render: {
			enableTerrain: boolean;
			enableOcean: boolean;
			enableClouds: boolean;
			enableAtmosphere: boolean;
			enableRings: boolean;
			cloudCoverage: number;
			atmosphereDensity: number;
			terrainRoughness: number;
			mountainScale: number;
			oceanLevel: number;
		};
		surfaceProfile: {
			enabled: boolean;
			palette: string;
			hasOcean: boolean;
			hasIceCaps: boolean;
			hasVolcanism: boolean;
			hasTectonics: boolean;
			waterInfluence: number;
			iceInfluence: number;
			lavaInfluence: number;
			toxicInfluence: number;
			metalInfluence: number;
			raymarchOcclusionStrength: number;
		};
		nearSurfaceDetail: {
			enabled: boolean;
			visible: boolean;
			alpha: number;
			rocks: number;
			tufts: number;
			patches: number;
			debug: boolean;
		};
	} {
		if (!this.definition) {
			return {
				available: false,
				name: 'none',
				class: 'none',
				rendererKind: 'none',
				composition: {
					rock: 0,
					metal: 0,
					ice: 0,
					water: 0,
					gas: 0,
					organic: 0,
					volatiles: 0,
				},
				atmosphere: {
					type: 'none',
					cloudCoverage: 0,
					density: 0,
				},
				rings: false,
				moons: 0,
				terrainSeed: 0,
				climate: {
					seed: 0,
					biomeSeed: 0,
					weatherSeed: 0,
					temperature01: 0,
					humidity: 0,
					aridity: 0,
					windStrength: 0,
					stormActivity: 0,
					cloudPersistence: 0,
					ashLoad: 0,
				},
				render: {
					enableTerrain: false,
					enableOcean: false,
					enableClouds: false,
					enableAtmosphere: false,
					enableRings: false,
					cloudCoverage: 0,
					atmosphereDensity: 0,
					terrainRoughness: 0,
					mountainScale: 0,
					oceanLevel: 0,
				},
				surfaceProfile: {
					enabled: false,
					palette: 'none',
					hasOcean: false,
					hasIceCaps: false,
					hasVolcanism: false,
					hasTectonics: false,
					waterInfluence: 0,
					iceInfluence: 0,
					lavaInfluence: 0,
					toxicInfluence: 0,
					metalInfluence: 0,
					raymarchOcclusionStrength: 0,
				},
				nearSurfaceDetail: {
					enabled: false,
					visible: false,
					alpha: 0,
					rocks: 0,
					tufts: 0,
					patches: 0,
					debug: false,
				},
			};
		}

		return {
			available: true,
			name: this.definition.name,
			class: this.definition.class,
			rendererKind: this.renderProfile?.rendererKind ?? 'unknown',
			composition: this.definition.composition,
			atmosphere: {
				type: this.definition.atmosphere.type,
				cloudCoverage: this.definition.atmosphere.cloudCoverage,
				density: this.definition.atmosphere.density,
			},
			rings: this.definition.rings?.enabled ?? false,
			moons: this.definition.moons.length,
			terrainSeed: this.definition.render.terrainSeed,
			climate: {
				seed:
					this.definition.climate?.seed ??
					this.definition.render.climateSeed ??
					0,
				biomeSeed:
					this.definition.climate?.biomeSeed ??
					this.definition.render.biomeSeed ??
					0,
				weatherSeed:
					this.definition.climate?.weatherSeed ??
					this.definition.render.weatherSeed ??
					0,
				temperature01: this.definition.climate?.temperature01 ?? 0,
				humidity: this.definition.climate?.humidity ?? 0,
				aridity: this.definition.climate?.aridity ?? 0,
				windStrength: this.definition.climate?.windStrength ?? 0,
				stormActivity: this.definition.climate?.stormActivity ?? 0,
				cloudPersistence: this.definition.climate?.cloudPersistence ?? 0,
				ashLoad: this.definition.climate?.ashLoad ?? 0,
			},
			render: {
				enableTerrain: this.renderProfile?.enableTerrain ?? false,
				enableOcean: this.renderProfile?.enableOcean ?? false,
				enableClouds: this.renderProfile?.enableClouds ?? false,
				enableAtmosphere: this.renderProfile?.enableAtmosphere ?? false,
				enableRings: this.renderProfile?.enableRings ?? false,
				cloudCoverage: this.renderProfile?.cloudCoverage ?? 0,
				atmosphereDensity: this.renderProfile?.atmosphereDensity ?? 0,
				terrainRoughness: this.renderProfile?.terrainRoughness ?? 0,
				mountainScale: this.renderProfile?.mountainScale ?? 0,
				oceanLevel: this.renderProfile?.oceanLevel ?? 0,
			},
			surfaceProfile: {
				enabled: this.surfaceProfile?.enabled ?? false,
				palette: this.surfaceProfile?.palette ?? 'none',
				hasOcean: this.surfaceProfile?.hasOcean ?? false,
				hasIceCaps: this.surfaceProfile?.hasIceCaps ?? false,
				hasVolcanism: this.surfaceProfile?.hasVolcanism ?? false,
				hasTectonics: this.surfaceProfile?.hasTectonics ?? false,
				waterInfluence: this.surfaceProfile?.waterInfluence ?? 0,
				iceInfluence: this.surfaceProfile?.iceInfluence ?? 0,
				lavaInfluence: this.surfaceProfile?.lavaInfluence ?? 0,
				toxicInfluence: this.surfaceProfile?.toxicInfluence ?? 0,
				metalInfluence: this.surfaceProfile?.metalInfluence ?? 0,
				raymarchOcclusionStrength:
					this.surfaceProfile?.raymarchOcclusionStrength ?? 0,
			},
			nearSurfaceDetail:
				this.nearSurfaceDetailLayer?.getDebugStats?.() ?? {
					enabled: false,
					visible: false,
					alpha: 0,
					rocks: 0,
					tufts: 0,
					patches: 0,
					debug: false,
				},
		};
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
		this.lavaPlanetLayer?.dispose();
		this.nearSurfaceDetailLayer?.dispose();

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
