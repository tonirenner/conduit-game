import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlanetViewPhase } from '@conduit/planet/view';
import { PlanetApproachCameraController } from './PlanetApproachCameraController';
import { PlanetFreeLookCameraController } from './PlanetFreeLookCameraController';

/**
 * Shared Lab/Game camera owner for planet approach and surface flight.
 *
 * Update order intentionally mirrors the accepted Planet LOD lab behavior:
 * 1. approach camera updates framing/FOV,
 * 2. planet runtime evaluates the resulting camera position,
 * 3. free-look ownership follows the resolved view phase.
 */
export class PlanetCameraInteractionController {
	readonly approach: PlanetApproachCameraController;
	readonly freeLook: PlanetFreeLookCameraController;

	constructor(
		camera: THREE.PerspectiveCamera,
		controls: OrbitControls,
		renderRadius: number,
		radiusMeters: number,
		center: THREE.Vector3 = new THREE.Vector3(),
	) {
		this.approach = new PlanetApproachCameraController(
			camera,
			controls,
			renderRadius,
			radiusMeters,
			center,
		);
		this.freeLook = new PlanetFreeLookCameraController(
			camera,
			controls,
			this.approach,
			renderRadius,
			radiusMeters,
			center,
		);
	}

	updateBeforeRuntime(deltaSeconds: number): void {
		this.approach.update(deltaSeconds);
	}

	updateAfterRuntime(phase: PlanetViewPhase, deltaSeconds: number): void {
		const cameraState = this.approach.getState();
		const shouldOwnCamera = this.freeLook.isActive()
			? cameraState.mode !== 'orbit'
			: phase !== 'orbit';

		this.freeLook.setNonOrbitActive(shouldOwnCamera);
		this.freeLook.update(deltaSeconds);
	}

	isFreeLookActive(): boolean {
		return this.freeLook.isActive();
	}

	dispose(): void {
		this.freeLook.dispose();
		this.approach.dispose();
	}
}
