import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

export type LoadedExrEnvironment = {
	sourceTexture: THREE.Texture;
	environmentMap: THREE.Texture;
	renderTarget: THREE.WebGLRenderTarget;
	dispose: () => void;
};

export async function loadExrEnvironment(
	renderer: THREE.WebGLRenderer,
	url: string,
): Promise<LoadedExrEnvironment> {
	const sourceTexture = await new EXRLoader().loadAsync(url);

	sourceTexture.mapping = THREE.EquirectangularReflectionMapping;

	const pmrem = new THREE.PMREMGenerator(renderer);
	const renderTarget = pmrem.fromEquirectangular(sourceTexture);

	pmrem.dispose();

	return {
		sourceTexture,
		environmentMap: renderTarget.texture,
		renderTarget,
		dispose: () => {
			renderTarget.dispose();
			sourceTexture.dispose();
		},
	};
}

export function setSceneEnvironment(
	scene: THREE.Scene,
	environmentMap: THREE.Texture | null,
	environmentIntensity?: number,
): void {
	scene.environment = environmentMap;

	if (environmentIntensity === undefined) {
		return;
	}

	(scene as THREE.Scene & {
		environmentIntensity?: number;
	}).environmentIntensity = environmentIntensity;
}
