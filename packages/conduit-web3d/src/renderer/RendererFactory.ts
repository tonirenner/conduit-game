import * as THREE from 'three';

export type RendererMode = 'webgl' | 'webgpu';

export type Web3DRenderer = THREE.WebGLRenderer & {
	init?: () => Promise<void>;
	renderAsync?: (
		scene: THREE.Scene,
		camera: THREE.Camera,
	) => Promise<void>;
};

export type AppRenderer = Web3DRenderer;

export function getPreferredRendererMode(
	fallback: RendererMode = 'webgl',
): RendererMode {
	const params = new URLSearchParams(window.location.search);
	const renderer = params.get('renderer')?.toLowerCase();

	if (renderer === 'webgpu' || renderer === 'gpu') {
		return 'webgpu';
	}

	if (renderer === 'webgl') {
		return 'webgl';
	}

	return fallback;
}

export async function createWeb3DRenderer(
	preferredMode: RendererMode,
	parameters: THREE.WebGLRendererParameters,
): Promise<{
	renderer: Web3DRenderer;
	mode: RendererMode;
}> {
	if (preferredMode === 'webgpu') {
		const webgpuRenderer = await tryCreateWebGPURenderer(parameters);

		if (webgpuRenderer) {
			configureRenderer(webgpuRenderer);

			return {
				renderer: webgpuRenderer,
				mode: 'webgpu',
			};
		}

		console.warn(
			'WebGPU renderer requested, but unavailable. Falling back to WebGL.',
		);
	}

	const webglRenderer = new THREE.WebGLRenderer(parameters) as Web3DRenderer;

	configureRenderer(webglRenderer);

	return {
		renderer: webglRenderer,
		mode: 'webgl',
	};
}

export const createAppRenderer = createWeb3DRenderer;

export async function renderFrame(
	renderer: Web3DRenderer,
	scene: THREE.Scene,
	camera: THREE.Camera,
): Promise<void> {
	renderer.render(scene, camera);
}

export function configureRenderer(renderer: Web3DRenderer): void {
	renderer.setClearColor(0x000000, 0);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.toneMappingExposure = 1.0;

	renderer.domElement.style.position = 'fixed';
	renderer.domElement.style.inset = '0';
	renderer.domElement.style.zIndex = '2';
	renderer.domElement.style.background = 'transparent';
	renderer.domElement.style.display = 'block';
}

async function tryCreateWebGPURenderer(
	parameters: THREE.WebGLRendererParameters,
): Promise<Web3DRenderer | null> {
	if (!('gpu' in navigator)) {
		return null;
	}

	try {
		const threeWebGPU = await import('three/webgpu');

		const renderer = new threeWebGPU.WebGPURenderer({
			antialias: parameters.antialias,
			alpha: parameters.alpha,
		}) as unknown as Web3DRenderer;

		if (typeof renderer.init === 'function') {
			await renderer.init();
		}

		return renderer;
	} catch (error) {
		console.warn('Could not create WebGPU renderer.', error);
		return null;
	}
}
