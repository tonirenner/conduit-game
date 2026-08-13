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

	private readonly baseMetersToRenderScale: number;
	private readonly cameraPlanetMeters = new THREE.Vector3();
	private lastTerrainOpacity = -1;
	private worldScale = 1;

	constructor(
		readonly definition: PlanetDefinition,
		readonly renderRadius: number,
		initialCameraWorldPosition: THREE.Vector3,
		initialWorldScale = 1,
	) {
		this.sampler = new PlanetTerrainSampler(definition);
		this.baseMetersToRenderScale = renderRadius / this.sampler.radiusMeters;
		this.worldScale = Math.max(1, initialWorldScale);
		this.cameraPlanetMeters.copy(initialCameraWorldPosition)
			.divideScalar(this.getMetersToWorldScale());
		const initialDirection = this.cameraPlanetMeters.clone().normalize();
		this.referenceFrame = new PlanetReferenceFrame(this.cameraPlanetMeters);
		this.terrain = new PlanetNearViewTerrain(
			this.sampler,
			this.referenceFrame,
			initialDirection,
		);
		this.group = this.terrain.group;
		this.group.name = 'PlanetSurfaceViewRuntime';
		this.syncWorldTransform();
		this.terrain.setEnabled(false);
	}

	update(
		cameraWorldPosition: THREE.Vector3,
		worldScale = this.worldScale,
	): PlanetSurfaceViewUpdate {
		this.worldScale = Math.max(1, worldScale);
		this.cameraPlanetMeters.copy(cameraWorldPosition)
			.divideScalar(this.getMetersToWorldScale());

		const direction = this.cameraPlanetMeters.clone().normalize();
		const surface = this.sampler.sample(direction, false);
		const altitudeMeters = Math.max(
			0,
			this.cameraPlanetMeters.length() - surface.surfaceRadiusMeters,
		);
		const transition = getPlanetSurfaceViewTransition(altitudeMeters);

		this.referenceFrame.update(this.cameraPlanetMeters);
		this.syncWorldTransform();

		let terrain = this.terrain.getStats();
		if (transition.terrainPrepared) {
			terrain = this.terrain.update(
				this.cameraPlanetMeters,
				altitudeMeters,
			);
		}

		this.terrain.setEnabled(transition.terrainVisible);
		this.setTerrainOpacity(transition.terrainWeight);

		return {
			altitudeMeters,
			transition,
			terrain,
		};
	}

	getMetersToWorldScale(): number {
		return this.baseMetersToRenderScale * this.worldScale;
	}

	dispose(): void {
		this.terrain.dispose();
	}

	private syncWorldTransform(): void {
		const metersToWorld = this.getMetersToWorldScale();
		this.group.position.copy(this.referenceFrame.originPlanetMeters)
			.multiplyScalar(metersToWorld);
		this.group.scale.setScalar(metersToWorld);
	}

	private setTerrainOpacity(opacity: number): void {
		const nextOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
		if (Math.abs(nextOpacity - this.lastTerrainOpacity) < 0.002) return;
		this.lastTerrainOpacity = nextOpacity;

		this.group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const material = object.material;
			if (!(material instanceof THREE.MeshStandardMaterial)) return;
			material.transparent = nextOpacity < 0.999;
			material.opacity = nextOpacity;
			material.depthWrite = nextOpacity >= 0.98;
			material.polygonOffset = true;
			material.polygonOffsetFactor = -1;
			material.polygonOffsetUnits = -1;
		});
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
