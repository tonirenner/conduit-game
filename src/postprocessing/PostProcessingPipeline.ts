import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
	Fn,
	float,
	length,
	pass,
	screenUV,
	smoothstep,
	vec4,
	saturation as adjustSaturation,
} from 'three/tsl';

import {
	type AppRenderer,
	type RendererMode,
	renderFrame,
} from '../render/RendererFactory';

export type PostProcessingPipelineOptions = {
	enabled: boolean;
	rendererMode: RendererMode;
};

type ComposerLike = {
	render: () => void;
	setPixelRatio: (pixelRatio: number) => void;
	setSize: (width: number, height: number) => void;
	dispose: () => void;
};

type WebGPURenderPipelineLike = {
	outputNode: unknown;
	render: () => void;
	dispose: () => void;
};

const colorGradeShader = {
	name: 'PlanetColorGradeShader',

	uniforms: {
		tDiffuse: {
			value: null,
		},
		contrast: {
			value: 1.055,
		},
		saturation: {
			value: 1.035,
		},
		vignetteStrength: {
			value: 0.16,
		},
		vignetteRadius: {
			value: 0.86,
		},
	},

	vertexShader: /* glsl */`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,

	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform float contrast;
		uniform float saturation;
		uniform float vignetteStrength;
		uniform float vignetteRadius;

		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D(tDiffuse, vUv);
			vec3 color = texel.rgb;

			color = (color - 0.5) * contrast + 0.5;

			float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
			color = mix(vec3(luminance), color, saturation);

			float vignette = smoothstep(
				0.28,
				vignetteRadius,
				length(vUv - 0.5)
			);

			color *= 1.0 - vignette * vignetteStrength;

			gl_FragColor = vec4(color, texel.a);
		}
	`,
};

const webGPUColorGradeNode = Fn(([input]) => {
	let color = input.rgb;

	color = color
		.sub(0.24)
		.mul(1.035)
		.add(0.24)
		.mul(1.025);

	color = adjustSaturation(
		color,
		float(1.026),
	);

	const vignette = smoothstep(
		0.28,
		0.86,
		length(
			screenUV.sub(0.5),
		),
	);

	color = color.mul(
		float(1.0).sub(
			vignette.mul(0.035),
		),
	);

	return vec4(
		color,
		input.a,
	);
});

export class PostProcessingPipeline {
	private readonly renderer: AppRenderer;
	private readonly scene: THREE.Scene;
	private readonly camera: THREE.Camera;
	private readonly rendererMode: RendererMode;

	private composer: ComposerLike | null = null;
	private webGPURenderPipeline: WebGPURenderPipelineLike | null = null;
	private enabled: boolean;
	private fallbackWarned = false;
	private lastWidth = 0;
	private lastHeight = 0;
	private lastPixelRatio = 0;

	constructor(
		renderer: AppRenderer,
		scene: THREE.Scene,
		camera: THREE.Camera,
		options: Partial<PostProcessingPipelineOptions> = {},
	) {
		this.renderer     = renderer;
		this.scene        = scene;
		this.camera       = camera;
		this.enabled      = options.enabled ?? true;
		this.rendererMode = options.rendererMode ?? 'webgl';

		if (this.enabled) {
			this.createPipeline();
		}
	}

	render(): void | Promise<void> {
		if (!this.enabled) {
			return renderFrame(
				this.renderer,
				this.scene,
				this.camera,
			);
		}

		if (this.composer) {
			this.syncComposerSize();

			try {
				this.composer.render();
				return;
			} catch (error) {
				this.warnFallback(
					'WebGL postprocessing failed during render. Falling back to normal rendering.',
					error,
				);

				this.disposePipeline();
				this.enabled = false;

				return renderFrame(
					this.renderer,
					this.scene,
					this.camera,
				);
			}
		}

		if (this.webGPURenderPipeline) {
			try {
				this.webGPURenderPipeline.render();
				return;
			} catch (error) {
				this.warnFallback(
					'WebGPU postprocessing failed during render. Falling back to normal rendering.',
					error,
				);

				this.disposePipeline();
				this.enabled = false;

				return renderFrame(
					this.renderer,
					this.scene,
					this.camera,
				);
			}
		}

		return renderFrame(
			this.renderer,
			this.scene,
			this.camera,
		);
	}

	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;

		if (enabled) {
			this.createPipeline();
			return;
		}

		this.disposePipeline();
	}

	dispose(): void {
		this.disposePipeline();
	}

	private createPipeline(): void {
		this.disposePipeline();

		if (this.rendererMode === 'webgpu') {
			this.createWebGPUPipeline();
			return;
		}

		if (!(this.renderer instanceof THREE.WebGLRenderer)) {
			this.warnFallback(
				'Postprocessing currently requires WebGLRenderer. Falling back to normal rendering.',
			);

			this.enabled = false;
			return;
		}

		this.createWebGLComposer();
	}

	private createWebGLComposer(): void {
		try {
			const composer = new EffectComposer(this.renderer);

			const renderPass = new RenderPass(
				this.scene,
				this.camera,
				null,
				null,
				0,
			);

			const bloomPass = new UnrealBloomPass(
				new THREE.Vector2(
					window.innerWidth,
					window.innerHeight,
				),
				0.34,
				0.42,
				0.72,
			);

			const colorGradePass = new ShaderPass(colorGradeShader);
			const outputPass     = new OutputPass();

			composer.addPass(renderPass);
			composer.addPass(bloomPass);
			composer.addPass(colorGradePass);
			composer.addPass(outputPass);

			this.composer = composer;
			this.syncComposerSize();
		} catch (error) {
			this.warnFallback(
				'Postprocessing could not be initialized. Falling back to normal rendering.',
				error,
			);

			this.disposeComposer();
			this.enabled = false;
		}
	}

	private createWebGPUPipeline(): void {
		try {
			const renderPipeline = new RenderPipeline(
				this.renderer,
			) as unknown as WebGPURenderPipelineLike;

			const scenePass  = pass(this.scene, this.camera) as any;
			const sceneColor = scenePass.getTextureNode('output');
			const bloomPass  = bloom(
				sceneColor,
				0.24,
				0.42,
				0.72,
			);

			renderPipeline.outputNode = webGPUColorGradeNode(
				sceneColor.add(bloomPass),
			);

			this.webGPURenderPipeline = renderPipeline;
		} catch (error) {
			this.warnFallback(
				'WebGPU postprocessing could not be initialized. Falling back to normal rendering.',
				error,
			);

			this.disposePipeline();
			this.enabled = false;
		}
	}

	private syncComposerSize(): void {
		if (!this.composer) {
			return;
		}

		const size       = this.renderer.getSize(new THREE.Vector2());
		const pixelRatio = this.renderer.getPixelRatio();

		if (
			size.x === this.lastWidth &&
			size.y === this.lastHeight &&
			Math.abs(pixelRatio - this.lastPixelRatio) < 0.001
		) {
			return;
		}

		this.lastWidth      = size.x;
		this.lastHeight     = size.y;
		this.lastPixelRatio = pixelRatio;

		this.composer.setPixelRatio(pixelRatio);
		this.composer.setSize(
			size.x,
			size.y,
		);
	}

	private disposeComposer(): void {
		this.composer?.dispose();
		this.composer = null;

		this.lastWidth      = 0;
		this.lastHeight     = 0;
		this.lastPixelRatio = 0;
	}

	private disposeWebGPURenderPipeline(): void {
		this.webGPURenderPipeline?.dispose();
		this.webGPURenderPipeline = null;
	}

	private disposePipeline(): void {
		this.disposeComposer();
		this.disposeWebGPURenderPipeline();
	}

	private warnFallback(
		message: string,
		error?: unknown,
	): void {
		if (this.fallbackWarned) {
			return;
		}

		this.fallbackWarned = true;
		if (error === undefined) {
			console.warn(message);
			return;
		}
		console.warn(message, error);
	}
}
