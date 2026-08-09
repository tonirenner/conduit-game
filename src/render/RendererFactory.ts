import * as THREE from 'three';

export type RendererMode = 'webgl' | 'webgpu';

export type AppRenderer = THREE.WebGLRenderer & {
	init?: () => Promise<void>;
	renderAsync?: (
		scene: THREE.Scene,
		camera: THREE.Camera,
	) => Promise<void>;
};

export function getPreferredRendererMode(
	fallback: RendererMode = 'webgl',
): RendererMode {
	const params   = new URLSearchParams(window.location.search);
	const renderer = params.get('renderer')
		?.toLowerCase();

	if (renderer === 'webgpu' || renderer === 'gpu') {
		return 'webgpu';
	}

	if (renderer === 'webgl') {
		return 'webgl';
	}

	return fallback;
}

export async function createAppRenderer(
	preferredMode: RendererMode,
	parameters: THREE.WebGLRendererParameters,
): Promise<{
	renderer: AppRenderer;
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

	const webglRenderer = new THREE.WebGLRenderer(parameters) as AppRenderer;

	configureRenderer(webglRenderer);

	return {
		renderer: webglRenderer,
		mode: 'webgl',
	};
}

export async function renderFrame(
	renderer: AppRenderer,
	scene: THREE.Scene,
	camera: THREE.Camera,
): Promise<void> {
	renderer.render(scene, camera);
}

function configureRenderer(renderer: AppRenderer): void {
	renderer.setClearColor(0x000000, 0);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

	renderer.outputColorSpace    = THREE.SRGBColorSpace;
	renderer.toneMapping         = THREE.NoToneMapping;
	renderer.toneMappingExposure = 1.0;

	renderer.domElement.style.position   = 'fixed';
	renderer.domElement.style.inset      = '0';
	renderer.domElement.style.zIndex     = '2';
	renderer.domElement.style.background = 'transparent';
	renderer.domElement.style.display    = 'block';
}

async function tryCreateWebGPURenderer(
	parameters: THREE.WebGLRendererParameters,
): Promise<AppRenderer | null> {
	if (!('gpu' in navigator)) {
		return null;
	}

	try {
		const threeWebGPU = await import('three/webgpu');

		const renderer = new threeWebGPU.WebGPURenderer({
			                                                antialias: parameters.antialias,
			                                                alpha: parameters.alpha,
		                                                }) as unknown as AppRenderer;

		if (typeof renderer.init === 'function') {
			await renderer.init();
		}

		return renderer;
	} catch (error) {
		console.warn('Could not create WebGPU renderer.', error);
		return null;
	}
}
