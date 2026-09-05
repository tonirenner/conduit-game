import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlanetDefinition } from '@conduit/planet/model';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import {
	type PlanetRendererMode,
	type PlanetRenderTuning,
	type PlanetRenderQuality,
	type PlanetRenderProfile,
} from '@conduit/planet/rendering';
import { PlanetViewRuntime } from '@conduit/planet/view';
import { PlanetCameraInteractionController } from './planet/PlanetCameraInteractionController';

/**
 * Narrow game-facing adapter around the canonical Orbit → Regional → Surface
 * runtime.
 *
 * It also owns the shared Lab/Game planet-camera interaction while this planet
 * is focused. GamePrototypeScene therefore does not need to duplicate the
 * approach/free-look/WASD state machine.
 */
export class SystemPlanetViewRuntime {
	readonly runtime: PlanetViewRuntime;
	readonly group: THREE.Group;

	private readonly localCameraPosition = new THREE.Vector3();
	private cameraInteraction: PlanetCameraInteractionController | null = null;
	private focusedCamera: THREE.PerspectiveCamera | null = null;

	constructor(
		private readonly definition: PlanetDefinition,
		profile: PlanetRenderProfile,
		private readonly renderRadius: number,
		rendererMode: PlanetRendererMode,
		initialCameraRenderPosition: THREE.Vector3,
	) {
		this.runtime = new PlanetViewRuntime(
			definition,
			profile,
			renderRadius,
			rendererMode,
			initialCameraRenderPosition,
		);
		this.group = this.runtime.group;
	}

	update(cameraRenderPosition: THREE.Vector3, deltaSeconds: number): void {
		if (!this.cameraInteraction || !this.focusedCamera) {
			this.runtime.update(cameraRenderPosition, deltaSeconds);
			return;
		}

		this.cameraInteraction.updateBeforeRuntime(deltaSeconds);
		this.localCameraPosition
			.copy(this.focusedCamera.position)
			.sub(this.group.position);
		this.runtime.update(this.localCameraPosition, deltaSeconds);
		this.cameraInteraction.updateAfterRuntime(
			this.runtime.getState().phase,
			deltaSeconds,
		);
	}

	beginCameraInteraction(
		camera: THREE.PerspectiveCamera,
		controls: OrbitControls,
	): void {
		this.endCameraInteraction();
		this.focusedCamera = camera;
		this.cameraInteraction = new PlanetCameraInteractionController(
			camera,
			controls,
			this.renderRadius,
			getPlanetRadiusMeters(this.definition),
			this.group.position,
		);
	}

	endCameraInteraction(): void {
		this.cameraInteraction?.dispose();
		this.cameraInteraction = null;
		this.focusedCamera = null;
	}

	isCameraInteractionActive(): boolean {
		return this.cameraInteraction !== null;
	}

	isFreeLookActive(): boolean {
		return this.cameraInteraction?.isFreeLookActive() ?? false;
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.runtime.planet.setSunDirection(direction);
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		this.runtime.planet.setRenderQuality(quality);
	}

	setRenderTuning(tuning: Partial<PlanetRenderTuning>): void {
		this.runtime.planet.setRenderTuning(tuning);
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.runtime.planet.setHorizonCullingEnabled(enabled);
	}

	setPatchFrustumCullingEnabled(enabled: boolean): void {
		this.runtime.planet.setPatchFrustumCullingEnabled(enabled);
	}

	dispose(): void {
		this.endCameraInteraction();
		this.runtime.dispose();
	}
}
