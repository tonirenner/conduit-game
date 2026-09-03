import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import {
	type PlanetRendererMode,
	type PlanetRenderTuning,
	type PlanetRenderQuality,
	type PlanetRenderProfile,
} from '@conduit/planet/rendering';
import { PlanetViewRuntime } from '@conduit/planet/view';

/**
 * Narrow game-facing adapter around the canonical Orbit → Regional → Surface
 * runtime.
 *
 * GamePrototypeScene historically stores concrete `Planet` instances. Keeping
 * this compatibility-shaped facade makes the production migration a small
 * ownership/factory change instead of spreading PlanetViewRuntime internals
 * throughout system selection, minimap and camera code.
 */
export class SystemPlanetViewRuntime {
	readonly runtime: PlanetViewRuntime;
	readonly group: THREE.Group;

	constructor(
		definition: PlanetDefinition,
		profile: PlanetRenderProfile,
		renderRadius: number,
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
		this.runtime.update(cameraRenderPosition, deltaSeconds);
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
		this.runtime.dispose();
	}
}
