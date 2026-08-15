import * as THREE from 'three';
import { Planet } from '../Planet';
import type { PlanetDefinition } from '../model';
import type { PlanetRenderProfile } from '../rendering/PlanetRenderProfile';
import { getPlanetRadiusMeters } from '../near-view/PlanetPhysicalScale';
import { InstancedOrbitTerrain } from '../rendering/orbit/InstancedOrbitTerrain';
import { RegionalSurfaceHandoffTerrain } from '../rendering/regional/RegionalSurfaceHandoffTerrain';
import { SurfaceClipmapTerrain } from '../rendering/surface/SurfaceClipmapTerrain';
import {
	PLANET_VIEW_BANDS,
	getPlanetViewWeights,
	shouldHaveRegionalView,
	shouldHaveSurfaceView,
	type PlanetViewPhase,
} from './PlanetViewTransition';

type TerrainRuntime = THREE.Object3D & {
	updateLOD?: (cameraPosition: THREE.Vector3) => void;
};

export type PlanetViewRuntimeState = {
	altitudeMeters: number;
	phase: PlanetViewPhase;
	orbitWeight: number;
	regionalWeight: number;
	surfaceWeight: number;
	regionalActive: boolean;
	surfaceActive: boolean;
	orbitLodFrozen: boolean;
	orbitRenderer: 'instanced-fixed' | 'legacy-cubesphere';
	orbitDraws: number;
	orbitInstances: number;
	orbitPatchLevel: number;
	orbitGridSegments: number;
	orbitVolumeResolution: number;
	surfaceRenderer: 'clipmap-local' | 'none';
	surfaceDraws: number;
	surfaceRings: number;
	surfaceGridCells: number;
	surfaceOuterHalfExtentMeters: number;
};

/**
 * Owns the three purpose-built rendering representations of a landable planet.
 *
 * OrbitView:
 * - fixed InstancedBufferGeometry CubeSphere
 * - one shared grid / one draw call
 * - pre-baked 3D terrain LUT, no runtime terrain noise
 * - production CubeSphere is retained only as an internal Planet dependency and
 *   is frozen + hidden immediately on WebGPU surface planets
 *
 * RegionalView:
 * - curved regional terrain patch with hydraulic erosion/material maps
 *
 * SurfaceView:
 * - fixed reusable local-tangent clipmap rings
 * - one local unit = one physical meter before render-scale transform
 * - camera zoom never refines the global CubeSphere
 */
export class PlanetViewRuntime {
	readonly group = new THREE.Group();
	readonly planet: Planet;

	private readonly radiusMeters: number;
	private readonly surfaceViewsEnabled: boolean;
	private readonly useInstancedOrbit: boolean;
	private orbitSurface: InstancedOrbitTerrain | null = null;
	private regional: RegionalSurfaceHandoffTerrain | null = null;
	private surface: SurfaceClipmapTerrain | null = null;
	private frozenTerrain: TerrainRuntime | null = null;
	private originalTerrainUpdate: TerrainRuntime['updateLOD'] | null = null;
	private state: PlanetViewRuntimeState;

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly profile: PlanetRenderProfile,
		private readonly renderRadius: number,
		rendererMode: 'webgl' | 'webgpu',
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'PlanetViewRuntime';
		this.radiusMeters = getPlanetRadiusMeters(definition);
		this.surfaceViewsEnabled = profile.rendererKind === 'solid_surface';
		this.useInstancedOrbit = this.surfaceViewsEnabled && rendererMode === 'webgpu';
		this.planet = new Planet(
			renderRadius,
			rendererMode,
			null,
			{
				gasCloudParticles: definition.class === 'gas_giant' || definition.class === 'ice_giant',
				moonSystem: true,
				nearSurfaceTerrain: false,
			},
			definition,
			profile,
		);
		this.group.add(this.planet.group);

		if (this.surfaceViewsEnabled) this.planet.setAutoRotationEnabled(false);

		if (this.useInstancedOrbit) {
			this.orbitSurface = new InstancedOrbitTerrain(definition, renderRadius);
			this.group.add(this.orbitSurface.group);
			this.freezeOrbitTerrainLod();
			this.disableClassicOrbitVisuals();
		}

		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		const weights = getPlanetViewWeights(altitudeMeters, this.surfaceViewsEnabled);
		const orbitStats = this.orbitSurface?.getStats();
		this.state = {
			altitudeMeters,
			phase: weights.phase,
			orbitWeight: weights.orbit,
			regionalWeight: weights.regional,
			surfaceWeight: weights.surface,
			regionalActive: false,
			surfaceActive: false,
			orbitLodFrozen: Boolean(this.frozenTerrain),
			orbitRenderer: this.orbitSurface ? 'instanced-fixed' : 'legacy-cubesphere',
			orbitDraws: orbitStats?.draws ?? 0,
			orbitInstances: orbitStats?.instances ?? 0,
			orbitPatchLevel: orbitStats?.patchLevel ?? 0,
			orbitGridSegments: orbitStats?.gridSegments ?? 0,
			orbitVolumeResolution: orbitStats?.volumeResolution ?? 0,
			surfaceRenderer: 'none',
			surfaceDraws: 0,
			surfaceRings: 0,
			surfaceGridCells: 0,
			surfaceOuterHalfExtentMeters: 0,
		};
		this.updateViewLifecycle(cameraRenderPosition, altitudeMeters);
	}

	update(cameraRenderPosition: THREE.Vector3, dt: number): void {
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		const weights = getPlanetViewWeights(altitudeMeters, this.surfaceViewsEnabled);

		this.updateViewLifecycle(cameraRenderPosition, altitudeMeters);

		if (this.orbitSurface) {
			this.freezeOrbitTerrainLod();
			this.disableClassicOrbitVisuals();
		} else {
			this.updateOrbitLodState(altitudeMeters);
		}

		this.planet.update(cameraRenderPosition, dt);
		this.planet.setRenderQuality('idle');

		if (this.orbitSurface) {
			this.disableClassicOrbitVisuals();
			this.orbitSurface.update(weights.orbit);
		} else {
			this.planet.setDebugLayerVisibility({
				surface: !this.surfaceViewsEnabled || weights.orbit > 0.001,
			});
		}

		if (this.regional) {
			if (weights.regional > 0.001 || weights.surface < 0.999) {
				this.regional.update(cameraRenderPosition, weights.regional);
			} else {
				this.regional.group.visible = false;
			}
		}

		if (this.surface) this.surface.update(cameraRenderPosition, weights.surface);

		const orbitStats = this.orbitSurface?.getStats();
		const surfaceStats = this.surface?.getStats();
		this.state = {
			altitudeMeters,
			phase: weights.phase,
			orbitWeight: weights.orbit,
			regionalWeight: weights.regional,
			surfaceWeight: weights.surface,
			regionalActive: Boolean(this.regional),
			surfaceActive: Boolean(this.surface),
			orbitLodFrozen: Boolean(this.frozenTerrain),
			orbitRenderer: this.orbitSurface ? 'instanced-fixed' : 'legacy-cubesphere',
			orbitDraws: orbitStats?.draws ?? 0,
			orbitInstances: orbitStats?.instances ?? 0,
			orbitPatchLevel: orbitStats?.patchLevel ?? 0,
			orbitGridSegments: orbitStats?.gridSegments ?? 0,
			orbitVolumeResolution: orbitStats?.volumeResolution ?? 0,
			surfaceRenderer: this.surface ? 'clipmap-local' : 'none',
			surfaceDraws: surfaceStats?.draws ?? 0,
			surfaceRings: surfaceStats?.rings ?? 0,
			surfaceGridCells: surfaceStats?.gridCells ?? 0,
			surfaceOuterHalfExtentMeters: surfaceStats?.outerHalfExtentMeters ?? 0,
		};
	}

	getState(): PlanetViewRuntimeState {
		return { ...this.state };
	}

	dispose(): void {
		this.restoreOrbitTerrainLod();
		if (this.orbitSurface) {
			this.group.remove(this.orbitSurface.group);
			this.orbitSurface.dispose();
			this.orbitSurface = null;
		}
		this.disposeRegional();
		this.disposeSurface();
		this.planet.dispose();
		this.group.clear();
	}

	private updateViewLifecycle(
		cameraRenderPosition: THREE.Vector3,
		altitudeMeters: number,
	): void {
		if (!this.surfaceViewsEnabled) {
			this.disposeRegional();
			this.disposeSurface();
			return;
		}

		const wantsRegional = shouldHaveRegionalView(altitudeMeters, Boolean(this.regional));
		if (wantsRegional && !this.regional) {
			this.regional = new RegionalSurfaceHandoffTerrain(
				this.definition,
				this.renderRadius,
				cameraRenderPosition,
			);
			this.group.add(this.regional.group);
		} else if (!wantsRegional) {
			this.disposeRegional();
		}

		const wantsSurface = shouldHaveSurfaceView(altitudeMeters, Boolean(this.surface));
		if (wantsSurface && !this.surface) {
			this.surface = new SurfaceClipmapTerrain(
				this.definition,
				this.renderRadius,
				cameraRenderPosition,
			);
			this.group.add(this.surface.group);
		} else if (!wantsSurface) {
			this.disposeSurface();
		}
	}

	private updateOrbitLodState(altitudeMeters: number): void {
		if (!this.surfaceViewsEnabled) {
			this.restoreOrbitTerrainLod();
			return;
		}

		const freezeBelow = PLANET_VIEW_BANDS.orbitRegionalEndMeters;
		const resumeAbove = PLANET_VIEW_BANDS.orbitRegionalEndMeters + 350_000;
		if (!this.frozenTerrain && altitudeMeters <= freezeBelow) {
			this.freezeOrbitTerrainLod();
		} else if (this.frozenTerrain && altitudeMeters >= resumeAbove) {
			this.restoreOrbitTerrainLod();
		}
	}

	private freezeOrbitTerrainLod(): void {
		const terrain = this.getOrbitTerrain();
		if (!terrain || typeof terrain.updateLOD !== 'function') return;
		if (this.frozenTerrain === terrain) return;
		this.restoreOrbitTerrainLod();
		this.frozenTerrain = terrain;
		this.originalTerrainUpdate = terrain.updateLOD;
		terrain.updateLOD = () => {};
	}

	private restoreOrbitTerrainLod(): void {
		if (this.frozenTerrain && this.originalTerrainUpdate) {
			this.frozenTerrain.updateLOD = this.originalTerrainUpdate;
		}
		this.frozenTerrain = null;
		this.originalTerrainUpdate = null;
	}

	private disableClassicOrbitVisuals(): void {
		const terrain = this.getOrbitTerrain();
		if (terrain) terrain.visible = false;
		const body = this.planet.group.getObjectByName('PlanetBody');
		if (body) body.visible = false;
	}

	private getOrbitTerrain(): TerrainRuntime | null {
		return this.planet.group.getObjectByName('PlanetTerrain') as TerrainRuntime | null;
	}

	private disposeRegional(): void {
		if (!this.regional) return;
		this.group.remove(this.regional.group);
		this.regional.dispose();
		this.regional = null;
	}

	private disposeSurface(): void {
		if (!this.surface) return;
		this.group.remove(this.surface.group);
		this.surface.dispose();
		this.surface = null;
	}

	private getAltitudeMeters(cameraRenderPosition: THREE.Vector3): number {
		return Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.radiusMeters,
		);
	}
}
