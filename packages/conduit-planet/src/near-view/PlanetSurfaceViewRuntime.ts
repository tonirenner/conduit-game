import * as THREE from 'three';
import type { PlanetDefinition } from '../model';
import { PlanetNearViewTerrain, type PlanetNearViewTerrainStats } from './PlanetNearViewTerrain';
import { PlanetReferenceFrame } from './PlanetReferenceFrame';
import { PlanetTerrainSampler } from './PlanetTerrainSampler';

export const SURFACE_VIEW_PRELOAD_METERS = 60_000;
export const SURFACE_VIEW_TERRAIN_START_METERS = 40_000;
export const SURFACE_VIEW_PLANET_END_METERS = 10_000;

export type PlanetSurfaceViewTransition = {
	planetVisible: boolean;
	terrainVisible: boolean;
	terrainPrepared: boolean;
	planetWeight: number;
	terrainWeight: number;
};

export type PlanetSurfaceViewUpdate = {
	altitudeMeters: number;
	transition: PlanetSurfaceViewTransition;
	terrain: PlanetNearViewTerrainStats;
};

export class PlanetSurfaceViewRuntime {
	readonly group: THREE.Group;
	readonly sampler: PlanetTerrainSampler;
	readonly referenceFrame: PlanetReferenceFrame;
	readonly terrain: PlanetNearViewTerrain;

	private readonly renderMetersScale: number;
	private readonly cameraPlanetMeters = new THREE.Vector3();

	constructor(
		readonly definition: PlanetDefinition,
		readonly renderRadius: number,
		initialCameraRenderPosition: THREE.Vector3,
	) {
		this.sampler = new PlanetTerrainSampler(definition);
		this.renderMetersScale = renderRadius / this.sampler.radiusMeters;
		this.cameraPlanetMeters.copy(initialCameraRenderPosition)
			.divideScalar(this.renderMetersScale);
		const initialDirection = this.cameraPlanetMeters.clone().normalize();
		this.referenceFrame = new PlanetReferenceFrame(this.cameraPlanetMeters);
		this.terrain = new PlanetNearViewTerrain(
			this.sampler,
			this.referenceFrame,
			initialDirection,
		);
		this.group = this.terrain.group;
		this.group.name = 'PlanetSurfaceViewRuntime';
		this.syncRenderTransform();
		this.terrain.setEnabled(false);
	}

	update(cameraRenderPosition: THREE.Vector3): PlanetSurfaceViewUpdate {
		this.cameraPlanetMeters.copy(cameraRenderPosition)
			.divideScalar(this.renderMetersScale);

		const direction = this.cameraPlanetMeters.clone().normalize();
		const surface = this.sampler.sample(direction, false);
		const altitudeMeters = Math.max(
			0,
			this.cameraPlanetMeters.length() - surface.surfaceRadiusMeters,
		);
		const transition = getPlanetSurfaceViewTransition(altitudeMeters);

		this.referenceFrame.update(this.cameraPlanetMeters);
		this.syncRenderTransform();

		let terrain = this.terrain.getStats();
		if (transition.terrainPrepared) {
			terrain = this.terrain.update(
				this.cameraPlanetMeters,
				altitudeMeters,
			);
		}

		this.terrain.setEnabled(transition.terrainVisible);
		this.terrain.setOpacity(transition.terrainWeight);

		return {
			altitudeMeters,
			transition,
			terrain,
		};
	}

	dispose(): void {
		this.terrain.dispose();
	}

	private syncRenderTransform(): void {
		this.group.position.copy(this.referenceFrame.originPlanetMeters)
			.multiplyScalar(this.renderMetersScale);
		this.group.scale.setScalar(this.renderMetersScale);
	}
}

export function getPlanetSurfaceViewTransition(
	altitudeMeters: number,
): PlanetSurfaceViewTransition {
	const altitude = Math.max(0, altitudeMeters);
	const range = SURFACE_VIEW_TERRAIN_START_METERS - SURFACE_VIEW_PLANET_END_METERS;
	const normalized = THREE.MathUtils.clamp(
		(altitude - SURFACE_VIEW_PLANET_END_METERS) / range,
		0,
		1,
	);
	const smooth = normalized * normalized * (3 - 2 * normalized);

	return {
		planetVisible: altitude > SURFACE_VIEW_PLANET_END_METERS,
		terrainVisible: altitude < SURFACE_VIEW_TERRAIN_START_METERS,
		terrainPrepared: altitude < SURFACE_VIEW_PRELOAD_METERS,
		planetWeight: smooth,
		terrainWeight: 1 - smooth,
	};
}
