import * as THREE from 'three';
import { Planet } from '@conduit/planet/rendering';
import type { PlanetDefinition } from '@conduit/planet/model';
import type { PlanetRenderProfile } from '@conduit/planet/rendering';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import { RegionalSurfaceHandoffTerrain } from './RegionalSurfaceHandoffTerrain';
import { LocalSurfaceTerrain } from './LocalSurfaceTerrain';
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
};

/**
 * Owns the three rendering representations of a landable planet.
 *
 * The production Planet remains the OrbitView and keeps atmosphere/clouds
 * alive. Its solid CubeSphere surface stops refining once RegionalView owns
 * the terrain. Regional and Surface views are created with hysteresis before
 * they become visible.
 */
export class PlanetViewRuntime {
	readonly group = new THREE.Group();
	readonly planet: Planet;

	private readonly radiusMeters: number;
	private readonly surfaceViewsEnabled: boolean;
	private regional: RegionalSurfaceHandoffTerrain | null = null;
	private surface: LocalSurfaceTerrain | null = null;
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

		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		const weights = getPlanetViewWeights(altitudeMeters, this.surfaceViewsEnabled);
		this.state = {
			altitudeMeters,
			phase: weights.phase,
			orbitWeight: weights.orbit,
			regionalWeight: weights.regional,
			surfaceWeight: weights.surface,
			regionalActive: false,
			surfaceActive: false,
			orbitLodFrozen: false,
		};
		this.updateViewLifecycle(cameraRenderPosition, altitudeMeters);
	}

	update(cameraRenderPosition: THREE.Vector3, dt: number): void {
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		const weights = getPlanetViewWeights(altitudeMeters, this.surfaceViewsEnabled);

		this.updateViewLifecycle(cameraRenderPosition, altitudeMeters);
		this.updateOrbitLodState(altitudeMeters);

		// Always update Planet with the real camera position. Atmosphere/cloud
		// uniforms therefore remain correct even after the solid OrbitView terrain
		// has stopped refining.
		this.planet.update(cameraRenderPosition, dt);
		this.planet.setRenderQuality('idle');
		this.planet.setDebugLayerVisibility({
			surface: !this.surfaceViewsEnabled || weights.orbit > 0.001,
		});

		if (this.regional) {
			if (weights.regional > 0.001 || weights.surface < 0.999) {
				this.regional.update(cameraRenderPosition, weights.regional);
			} else {
				this.regional.group.visible = false;
			}
		}

		if (this.surface) {
			this.surface.update(cameraRenderPosition, weights.surface);
		}

		this.state = {
			altitudeMeters,
			phase: weights.phase,
			orbitWeight: weights.orbit,
			regionalWeight: weights.regional,
			surfaceWeight: weights.surface,
			regionalActive: Boolean(this.regional),
			surfaceActive: Boolean(this.surface),
			orbitLodFrozen: Boolean(this.frozenTerrain),
		};
	}

	getState(): PlanetViewRuntimeState {
		return { ...this.state };
	}

	dispose(): void {
		this.restoreOrbitTerrainLod();
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
			this.surface = new LocalSurfaceTerrain(
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
