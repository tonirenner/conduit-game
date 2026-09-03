import * as THREE from 'three';

import type { PlanetDefinition } from '@conduit/planet/model';
import type { PlanetRenderProfile } from '@conduit/planet/rendering';
import {
	getPlanetMoonSystemSeed,
	getPlanetRingLayerRuntimeProfile,
} from '@conduit/planet/rendering';

import { MoonSystemLayer } from '../MoonSystemLayer';
import { RingSystemLayer } from '../RingSystemLayer';

export type PlanetOrbitingLayerControllerOptions = {
	parent: THREE.Group;
	radius: number;
	rendererKind: string;
	definition: PlanetDefinition | null;
	renderProfile: PlanetRenderProfile | null;
	moonSystemEnabled: boolean;
};

/**
 * Owns the small shared orbiting visual layers around a planet.
 *
 * This controller deliberately does not own clouds, atmosphere, terrain or
 * camera/view transitions. It only extracts RingSystemLayer/MoonSystemLayer
 * construction and lifecycle from the transitional Planet god-object.
 */
export class PlanetOrbitingLayerController {
	private ringSystemLayer?: RingSystemLayer;
	private moonSystemLayer?: MoonSystemLayer;

	constructor(
		private readonly options: PlanetOrbitingLayerControllerOptions,
	) {
		this.createRingSystem();
		this.createMoonSystem();
	}

	update(deltaSeconds: number): void {
		this.ringSystemLayer?.update(deltaSeconds);
		this.moonSystemLayer?.update(deltaSeconds);
	}

	setRingVisibility(visible: boolean): void {
		if (this.ringSystemLayer) {
			this.ringSystemLayer.group.visible = visible;
		}
	}

	setMoonVisibility(visible: boolean): void {
		if (this.moonSystemLayer) {
			this.moonSystemLayer.group.visible = visible;
		}
	}

	dispose(): void {
		this.ringSystemLayer?.dispose();
		this.moonSystemLayer?.dispose();
	}

	private createRingSystem(): void {
		const definition = this.options.definition;

		if (!definition) {
			return;
		}

		const ringProfile = getPlanetRingLayerRuntimeProfile(
			definition,
			this.options.renderProfile,
		);

		if (!ringProfile.enabled) {
			return;
		}

		this.ringSystemLayer = new RingSystemLayer({
			radius: this.options.radius,
			seed: ringProfile.seed,
			opacity:
				this.options.rendererKind === 'solid_surface'
					? 0.46
					: 0.74,
		});

		this.options.parent.add(this.ringSystemLayer.group);
	}

	private createMoonSystem(): void {
		const definition = this.options.definition;

		if (!this.options.moonSystemEnabled || !definition) {
			return;
		}

		const moonCount = definition.moons.length;

		if (moonCount <= 0) {
			return;
		}

		this.moonSystemLayer = new MoonSystemLayer({
			radius: this.options.radius,
			seed: getPlanetMoonSystemSeed(definition),
			moonCount,
			parentKind: this.options.rendererKind,
		});

		this.options.parent.add(this.moonSystemLayer.group);
	}
}
