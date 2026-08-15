import * as THREE from 'three';

import { SUN_DIRECTION } from './Sun';
import { createAtmosphereLayerProfile } from './rendering/AtmosphereVisualProfile';

export type WebGPUAtmosphereQuality = 'moving' | 'idle';

export type ConduitAtmosphereSource = {
	enabled: boolean;
	planetRadius: number;
	atmosphereRadius: number;
	density: number;
	mieDensity: number;
	absorption: number;
	ambient: number;
	mieG: number;
	scatteringBoost: number;
	color: THREE.Vector3;
	sunDirection: THREE.Vector3;
	primarySteps: number;
};

/**
 * WebGPU atmosphere source for the screen-space atmosphere pass.
 *
 * This object intentionally does not render an atmosphere shell. The old
 * BackSide/additive sphere caused full-screen overdraw, incorrect terrain
 * compositing and catastrophic cost once the camera entered the atmosphere.
 *
 * Planet keeps attaching `mesh` as before, so no view/camera code has to know
 * about the change. The mesh is invisible and only carries atmosphere metadata
 * in userData for the global WebGPU post-process pipeline.
 */
export class WebGPUAtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly source: ConduitAtmosphereSource;
	private currentRenderQuality: WebGPUAtmosphereQuality = 'idle';
	private idleSteps = 6;
	private movingSteps = 4;

	constructor(radius: number) {
		const mesh = new THREE.Mesh();
		mesh.name = 'WebGPUAtmospherePostProcessSource';
		mesh.visible = false;
		mesh.frustumCulled = false;

		this.source = {
			enabled: true,
			planetRadius: radius,
			atmosphereRadius: radius * 1.045,
			density: 1.0,
			mieDensity: 0.42,
			absorption: 0.22,
			ambient: 0.035,
			mieG: 0.80,
			scatteringBoost: 1.0,
			color: new THREE.Vector3(0.56, 0.77, 1.0),
			sunDirection: SUN_DIRECTION.clone().normalize(),
			primarySteps: this.idleSteps,
		};

		mesh.userData.conduitAtmosphere = this.source;
		this.mesh = mesh;
	}

	update(): void {
		// World position is resolved by the global post-process directly from
		// this Object3D. Nothing expensive belongs in the per-planet update.
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.source.sunDirection.copy(direction).normalize();
	}

	setAtmosphereProfile(
		density: number,
		haze: number,
		atmosphereColor = '#8ec5ff',
		atmospherePalette = '',
	): void {
		const profile = createAtmosphereLayerProfile(
			density,
			haze,
			atmosphereColor,
			atmospherePalette,
		);

		const density01 = THREE.MathUtils.clamp(density / 2.5, 0, 1);
		const haze01 = THREE.MathUtils.clamp(haze, 0, 1);
		const aerosol01 = Math.max(haze01, density01 * 0.32);
		const color = new THREE.Color(profile.tint);

		this.source.density = THREE.MathUtils.lerp(0.58, 1.42, density01);
		this.source.mieDensity = THREE.MathUtils.lerp(0.10, 0.92, aerosol01);
		this.source.absorption = THREE.MathUtils.lerp(0.08, 0.34, density01);
		this.source.ambient = THREE.MathUtils.lerp(0.020, 0.055, density01);
		this.source.mieG = THREE.MathUtils.lerp(0.76, 0.87, haze01);
		this.source.scatteringBoost = THREE.MathUtils.clamp(
			profile.scatteringBoost,
			0.65,
			1.55,
		);
		this.source.color.set(color.r, color.g, color.b);
	}

	setRenderQuality(quality: WebGPUAtmosphereQuality): void {
		this.currentRenderQuality = quality;
		this.source.primarySteps =
			quality === 'moving'
			? this.movingSteps
			: this.idleSteps;
	}

	setRaymarchSteps(steps: number): void {
		const clamped = THREE.MathUtils.clamp(Math.round(steps), 2, 8);

		if (this.currentRenderQuality === 'moving') {
			this.movingSteps = Math.min(clamped, 5);
			this.source.primarySteps = this.movingSteps;
			return;
		}

		this.idleSteps = Math.min(clamped, 8);
		this.source.primarySteps = this.idleSteps;
	}

	getRaymarchSteps(): number {
		return this.source.primarySteps;
	}
}
