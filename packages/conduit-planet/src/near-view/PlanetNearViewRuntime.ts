import * as THREE from 'three';
import type { PlanetDefinition } from '../model';
import { PlanetLandingController, type PlanetLandingResult } from './PlanetLandingController';
import { PlanetNearViewTerrain, type PlanetNearViewTerrainStats } from './PlanetNearViewTerrain';
import {
	getPlanetNearViewTransition,
	type PlanetNearViewTransition,
} from './PlanetNearViewTransition';
import { PlanetReferenceFrame } from './PlanetReferenceFrame';
import { PlanetTerrainSampler } from './PlanetTerrainSampler';

export type PlanetNearViewUpdate = {
	renderPosition: THREE.Vector3;
	originShiftMeters: THREE.Vector3;
	landing: PlanetLandingResult;
	transition: PlanetNearViewTransition;
	terrain: PlanetNearViewTerrainStats;
};

export class PlanetNearViewRuntime {
	readonly group = new THREE.Group();
	readonly sampler: PlanetTerrainSampler;
	readonly referenceFrame: PlanetReferenceFrame;
	readonly terrain: PlanetNearViewTerrain;
	readonly landing: PlanetLandingController;

	constructor(
		readonly definition: PlanetDefinition,
		initialDirection: THREE.Vector3,
		initialAltitudeMeters = 2_000,
		private readonly options: { renderTerrain?: boolean } = {},
	) {
		this.group.name = 'PlanetNearViewRuntime';
		this.sampler = new PlanetTerrainSampler(definition);
		const surface = this.sampler.sample(initialDirection);
		const initialPosition = surface.direction.clone().multiplyScalar(
			surface.surfaceRadiusMeters + initialAltitudeMeters,
		);
		this.referenceFrame = new PlanetReferenceFrame(initialPosition);
		this.terrain = new PlanetNearViewTerrain(
			this.sampler,
			this.referenceFrame,
			initialDirection,
		);
		this.landing = new PlanetLandingController(this.sampler);
		if (this.options.renderTerrain !== false) {
			this.group.add(this.terrain.group);
		}
	}

	update(
		positionPlanetMeters: THREE.Vector3,
		velocityMetersPerSecond: THREE.Vector3,
		requestLanding: boolean,
	): PlanetNearViewUpdate {
		const landing = this.landing.update(
			positionPlanetMeters,
			velocityMetersPerSecond,
			requestLanding,
		);
		const referenceUpdate = this.referenceFrame.update(positionPlanetMeters);
		const transition = getPlanetNearViewTransition(
			landing.altitudeAboveTerrainMeters,
		);
		const renderTerrain = this.options.renderTerrain !== false;
		this.terrain.setEnabled(renderTerrain && transition.terrainVisible);
		const terrain = renderTerrain && transition.terrainPrepared
			? this.terrain.update(
				positionPlanetMeters,
				landing.altitudeAboveTerrainMeters,
			)
			: this.terrain.getStats();

		return {
			renderPosition: this.referenceFrame.toRenderPosition(positionPlanetMeters),
			originShiftMeters: referenceUpdate.shiftMeters,
			landing,
			transition,
			terrain,
		};
	}

	dispose(): void {
		this.terrain.dispose();
		this.group.clear();
	}
}
