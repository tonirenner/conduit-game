import * as THREE from 'three';

import type { Web3DRenderer } from '../renderer';
import {
	loadExrEnvironment,
	type LoadedExrEnvironment,
} from './ExrEnvironmentLoader';

export type SceneEnvironmentState = {
	environmentIntensity: number;
	environmentRotationDegrees: number;
	environmentVisible: boolean;
	backgroundColor: THREE.ColorRepresentation;
	toneMapping?: THREE.ToneMapping;
	toneMappingExposure?: number;
};

export type SceneEnvironmentSnapshot = {
	environment: THREE.Texture | null;
	background: THREE.Color | THREE.Texture | null;
	environmentIntensity?: number;
	environmentRotation?: THREE.Euler;
	backgroundRotation?: THREE.Euler;
	toneMapping: THREE.ToneMapping;
	toneMappingExposure: number;
};

type SceneWithEnvironmentControls = THREE.Scene & {
	environmentIntensity?: number;
	environmentRotation?: THREE.Euler;
	backgroundRotation?: THREE.Euler;
};

export class SceneEnvironmentManager {
	private readonly snapshot: SceneEnvironmentSnapshot;
	private loadedEnvironment: LoadedExrEnvironment | null = null;
	private loadGeneration = 0;

	constructor(
		private readonly scene: THREE.Scene,
		private readonly renderer: Web3DRenderer,
	) {
		this.snapshot = captureSceneEnvironment(scene, renderer);
	}

	get sourceTexture(): THREE.Texture | null {
		return this.loadedEnvironment?.sourceTexture ?? null;
	}

	get environmentMap(): THREE.Texture | null {
		return this.loadedEnvironment?.environmentMap ?? null;
	}

	async loadExr(url: string): Promise<LoadedExrEnvironment | null> {
		const generation = ++this.loadGeneration;
		const environment = await loadExrEnvironment(this.renderer, url);

		if (generation !== this.loadGeneration) {
			environment.dispose();
			return null;
		}

		this.loadedEnvironment?.dispose();
		this.loadedEnvironment = environment;
		this.scene.environment = environment.environmentMap;

		return environment;
	}

	apply(state: SceneEnvironmentState): void {
		const sceneWithEnvironment = this.scene as SceneWithEnvironmentControls;

		if (this.loadedEnvironment) {
			this.scene.environment = this.loadedEnvironment.environmentMap;
		}

		sceneWithEnvironment.environmentIntensity = state.environmentIntensity;

		const rotation = THREE.MathUtils.degToRad(
			state.environmentRotationDegrees,
		);

		if (sceneWithEnvironment.environmentRotation) {
			sceneWithEnvironment.environmentRotation.y = rotation;
		}

		if (sceneWithEnvironment.backgroundRotation) {
			sceneWithEnvironment.backgroundRotation.y = rotation;
		}

		if (state.environmentVisible && this.loadedEnvironment) {
			this.scene.background = this.loadedEnvironment.sourceTexture;
		} else {
			this.scene.background = new THREE.Color(state.backgroundColor);
		}

		if (state.toneMapping !== undefined) {
			this.renderer.toneMapping = state.toneMapping;
		}

		if (state.toneMappingExposure !== undefined) {
			this.renderer.toneMappingExposure = state.toneMappingExposure;
		}
	}

	restore(): void {
		restoreSceneEnvironment(this.scene, this.renderer, this.snapshot);
	}

	dispose(options: { restore?: boolean } = {}): void {
		this.loadGeneration++;

		if (options.restore ?? true) {
			this.restore();
		}

		this.loadedEnvironment?.dispose();
		this.loadedEnvironment = null;
	}
}

export function captureSceneEnvironment(
	scene: THREE.Scene,
	renderer: Web3DRenderer,
): SceneEnvironmentSnapshot {
	const sceneWithEnvironment = scene as SceneWithEnvironmentControls;

	return {
		environment: scene.environment,
		background: scene.background,
		environmentIntensity: sceneWithEnvironment.environmentIntensity,
		environmentRotation: sceneWithEnvironment.environmentRotation?.clone(),
		backgroundRotation: sceneWithEnvironment.backgroundRotation?.clone(),
		toneMapping: renderer.toneMapping,
		toneMappingExposure: renderer.toneMappingExposure,
	};
}

export function restoreSceneEnvironment(
	scene: THREE.Scene,
	renderer: Web3DRenderer,
	snapshot: SceneEnvironmentSnapshot,
): void {
	const sceneWithEnvironment = scene as SceneWithEnvironmentControls;

	scene.environment = snapshot.environment;
	scene.background = snapshot.background;
	sceneWithEnvironment.environmentIntensity = snapshot.environmentIntensity;

	if (sceneWithEnvironment.environmentRotation && snapshot.environmentRotation) {
		sceneWithEnvironment.environmentRotation.copy(snapshot.environmentRotation);
	}

	if (sceneWithEnvironment.backgroundRotation && snapshot.backgroundRotation) {
		sceneWithEnvironment.backgroundRotation.copy(snapshot.backgroundRotation);
	}

	renderer.toneMapping = snapshot.toneMapping;
	renderer.toneMappingExposure = snapshot.toneMappingExposure;
}
