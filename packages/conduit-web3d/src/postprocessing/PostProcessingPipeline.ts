import * as THREE from 'three';

import type { RendererMode, Web3DRenderer } from '../renderer';

export type PostProcessingQuality =
	| 'low'
	| 'medium'
	| 'high'
	| 'ultra';

export type PostProcessingRendererMode = RendererMode;

export type PostProcessingPipelineOptions = {
	enabled?: boolean;
	rendererMode: PostProcessingRendererMode;
	quality?: PostProcessingQuality;
	enableGTAO?: boolean;
	enableSSR?: boolean;
	enableBloom?: boolean;
	toneMappingExposure?: number;
};

export type PostProcessingPipelineUpdateOptions = Partial<
	Omit<PostProcessingPipelineOptions, 'rendererMode'>
>;

type RenderPipelineLike = {
	outputNode: unknown;
	needsUpdate?: boolean;
	render: () => void;
	dispose?: () => void;
};

type PipelineRuntime = {
	renderPipeline: RenderPipelineLike;
};

export class PostProcessingPipeline {
	private readonly rendererMode: PostProcessingRendererMode;
	private enabled: boolean;
	private quality: PostProcessingQuality;
	private enableGTAO: boolean;
	private enableSSR: boolean;
	private enableBloom: boolean;
	private toneMappingExposure: number;

	private runtime: PipelineRuntime | null = null;
	private initializationPromise: Promise<void> | null = null;
	private initializationFailed = false;
	private runtimeGeneration = 0;

	constructor(
		private readonly renderer: Web3DRenderer,
		private readonly scene: THREE.Scene,
		private readonly camera: THREE.PerspectiveCamera,
		options: PostProcessingPipelineOptions,
	) {
		const params = new URLSearchParams(window.location.search);

		this.rendererMode = options.rendererMode;
		this.enabled =
			options.enabled !== false &&
			params.get('postfx') !== '0';

		this.quality = resolveQuality(
			params.get('fx'),
			options.quality,
		);

		const profile = getQualityProfile(this.quality);

		this.enableGTAO =
			options.enableGTAO ??
			(
				params.get('ao') !== '0' &&
				profile.gtao
			);

		this.enableSSR =
			options.enableSSR ??
			(
				params.get('ssr') !== '0' &&
				profile.ssr
			);

		this.enableBloom =
			options.enableBloom ??
			(
				params.get('bloom') !== '0' &&
				profile.bloom
			);

		this.toneMappingExposure =
			options.toneMappingExposure ??
			profile.exposure;

		if (
			this.enabled &&
			this.rendererMode === 'webgpu'
		) {
			this.startInitialization();
		}
	}

	render(): void {
		if (
			!this.enabled ||
			this.initializationFailed
		) {
			this.renderer.render(
				this.scene,
				this.camera,
			);
			return;
		}

		if (this.runtime) {
			try {
				this.runtime.renderPipeline.render();
				return;
			} catch (error) {
				/*
				 * TSL compiles the node graph lazily on the first real render.
				 * If a version-specific node combination still fails there,
				 * disable the pipeline once and return to normal rendering
				 * instead of throwing the same error every frame.
				 */
				this.initializationFailed = true;
				this.runtime.renderPipeline.dispose?.();
				this.runtime = null;

				console.warn(
					'Phase 4.1 WebGPU post-processing failed while compiling/rendering. ' +
					'Falling back to the normal renderer.',
					error,
				);

				this.renderer.render(
					this.scene,
					this.camera,
				);
				return;
			}
		}

		/*
		 * Keep rendering normally while the dynamic WebGPU modules initialize.
		 */
		this.renderer.render(
			this.scene,
			this.camera,
		);

		this.startInitialization();
	}

	getQuality(): PostProcessingQuality {
		return this.quality;
	}

	getOptions(): Required<PostProcessingPipelineOptions> {
		return {
			enabled: this.enabled,
			rendererMode: this.rendererMode,
			quality: this.quality,
			enableGTAO: this.enableGTAO,
			enableSSR: this.enableSSR,
			enableBloom: this.enableBloom,
			toneMappingExposure: this.toneMappingExposure,
		};
	}

	isReady(): boolean {
		return Boolean(this.runtime);
	}

	updateOptions(options: PostProcessingPipelineUpdateOptions): void {
		const nextQuality = resolveQuality(
			null,
			options.quality ?? this.quality,
		);
		const nextProfile = getQualityProfile(nextQuality);
		const nextEnabled = options.enabled ?? this.enabled;
		const nextGTAO = options.enableGTAO ?? this.enableGTAO;
		const nextSSR = options.enableSSR ?? this.enableSSR;
		const nextBloom = options.enableBloom ?? this.enableBloom;
		const nextExposure =
			options.toneMappingExposure ??
			(
				options.quality !== undefined &&
				this.toneMappingExposure === getQualityProfile(this.quality).exposure
					? nextProfile.exposure
					: this.toneMappingExposure
			);

		const requiresRebuild =
			nextEnabled !== this.enabled ||
			nextQuality !== this.quality ||
			nextGTAO !== this.enableGTAO ||
			nextSSR !== this.enableSSR ||
			nextBloom !== this.enableBloom;

		this.enabled = nextEnabled;
		this.quality = nextQuality;
		this.enableGTAO = nextGTAO;
		this.enableSSR = nextSSR;
		this.enableBloom = nextBloom;
		this.toneMappingExposure = nextExposure;

		this.renderer.toneMappingExposure = this.toneMappingExposure;

		if (!requiresRebuild) {
			return;
		}

		this.resetRuntime();

		if (
			this.enabled &&
			this.rendererMode === 'webgpu'
		) {
			this.startInitialization();
		}
	}

	dispose(): void {
		this.resetRuntime();
	}

	private startInitialization(): void {
		if (
			this.initializationPromise ||
			this.runtime ||
			this.initializationFailed
		) {
			return;
		}

		const generation = this.runtimeGeneration;

		this.initializationPromise =
			this.initializeWebGPUPipeline(generation)
				.then(() => {
					if (generation === this.runtimeGeneration) {
						this.initializationPromise = null;
					}
				})
				.catch((error) => {
					if (generation !== this.runtimeGeneration) {
						return;
					}

					this.initializationPromise = null;
					this.initializationFailed = true;

					console.warn(
						'Phase 4 WebGPU post-processing could not initialize. ' +
						'Falling back to the normal renderer.',
						error,
					);
				});
	}

	private async initializeWebGPUPipeline(generation: number): Promise<void> {
		const [
			webgpu,
			tsl,
			gtaoModule,
			ssrModule,
			bloomModule,
		] = await Promise.all([
			import('three/webgpu'),
			import('three/tsl'),
			import('three/addons/tsl/display/GTAONode.js'),
			import('three/addons/tsl/display/SSRNode.js'),
			import('three/addons/tsl/display/BloomNode.js'),
		]);

		if (generation !== this.runtimeGeneration) {
			return;
		}

		const RenderPipeline = (webgpu as any).RenderPipeline;

		if (!RenderPipeline) {
			throw new Error(
				'three/webgpu.RenderPipeline is unavailable.',
			);
		}

		const {
			pass,
			mrt,
			output,
			normalView,
			float,
			vec4,
		} = tsl as any;

		const ao = (gtaoModule as any).ao;
		const ssr = (ssrModule as any).ssr;
		const bloom = (bloomModule as any).bloom;

		if (
			!pass ||
			!mrt ||
			!output ||
			!normalView ||
			!float ||
			!vec4 ||
			!ao ||
			!ssr ||
			!bloom
		) {
			throw new Error(
				'Required Three.js WebGPU/TSL post-processing API is unavailable.',
			);
		}

		const renderPipeline =
			new RenderPipeline(
				this.renderer as any,
			) as RenderPipelineLike;

		if (generation !== this.runtimeGeneration) {
			renderPipeline.dispose?.();
			return;
		}

		/*
		 * r184-compatible MRT layout.
		 *
		 * IMPORTANT:
		 * GTAONode and SSRNode accept the normal texture directly.
		 * Do NOT pack/unpack normals through the deprecated
		 * directionToColor()/colorToDirection() helpers.
		 */
		const scenePass = pass(
			this.scene,
			this.camera,
		);

		/*
		 * Stable r184 MRT shared by GTAO and SSR.
		 *
		 * Both GTAONode and SSRNode expect `normalNode` to be a TextureNode.
		 * SSRNode explicitly uses both:
		 *
		 *   this.normalNode.rgb
		 *   this.normalNode.sample( uv )
		 *
		 * So pass the raw MRT normal texture directly to both effects.
		 */
		scenePass.setMRT(
			mrt({
				output,
				normal: normalView,
			}),
		);

		const sceneColor =
			scenePass.getTextureNode('output');
		const sceneNormal =
			scenePass.getTextureNode('normal');
		const sceneDepth =
			scenePass.getTextureNode('depth');

		if (
			!sceneColor ||
			!sceneNormal ||
			!sceneDepth
		) {
			throw new Error(
				'Could not create required WebGPU scene texture nodes.',
			);
		}

		const profile =
			getQualityProfile(this.quality);

		let workingColor: any =
			sceneColor;

		if (this.enableGTAO) {
			/*
			 * Official r184 GTAO signature:
			 * ao(depthNode, normalNode, camera)
			 */
			const aoPass: any =
				ao(
					sceneDepth,
					sceneNormal,
					this.camera,
				);

			aoPass.resolutionScale =
				profile.aoResolutionScale;

			setUniformOrProperty(
				aoPass,
				'samples',
				profile.aoSamples,
			);

			setUniformOrProperty(
				aoPass,
				'radius',
				profile.aoRadius,
			);

			setUniformOrProperty(
				aoPass,
				'thickness',
				profile.aoThickness,
			);

			/*
			 * Three.js r183+ exposes the GTAO result directly on the node.
			 * The migration guide explicitly states that AO is available
			 * in the R channel and should be blended on application level.
			 *
			 * IMPORTANT:
			 * Do not call aoPass.getTextureNode() here. GTAONode is already
			 * the composable TSL effect node and that extra indirection can
			 * resolve to null during lazy graph construction in r184.
			 */
			/*
			 * GTAONode renders AO into its own internal render target.
			 * r184's own GTAONode documentation retrieves that result through
			 * getTextureNode() and uses the R channel.
			 */
			const aoOutput =
				aoPass.getTextureNode();

			workingColor =
				vec4(
					sceneColor.rgb.mul(
						float(1.0).sub(
							float(profile.aoStrength).mul(
								float(1.0).sub(aoOutput.r),
							),
						),
					),
					sceneColor.a,
				);
		}

		if (this.enableSSR) {
			/*
			 * Three r185 SSR signature:
			 * ssr(colorNode, depthNode, normalNode, options)
			 *
			 * SSRNode currently calls float() on both material inputs during
			 * shader setup, so provide concrete nodes instead of relying on
			 * its documented null defaults.
			 */
			const ssrPass: any =
				ssr(
					sceneColor,
					sceneDepth,
					sceneNormal,
					{
						camera: this.camera,
						metalnessNode: float(0.32),
						roughnessNode: float(0.78),
					},
				);

			ssrPass.resolutionScale =
				profile.ssrResolutionScale;

			setUniformOrProperty(
				ssrPass,
				'quality',
				profile.ssrQuality,
			);

			setUniformOrProperty(
				ssrPass,
				'maxDistance',
				profile.ssrMaxDistance,
			);

			setUniformOrProperty(
				ssrPass,
				'opacity',
				profile.ssrOpacity,
			);

			setUniformOrProperty(
				ssrPass,
				'thickness',
				profile.ssrThickness,
			);

			workingColor =
				vec4(
					workingColor.rgb.add(
						ssrPass.rgb.mul(
							profile.ssrOpacity,
						),
					),
					workingColor.a,
				);
		}

		if (this.enableBloom) {
			/*
			 * Bloom uniforms are UniformNodes in r184.
			 */
			/*
			 * r184 bloom() accepts strength, radius and threshold directly.
			 * Supplying them at construction time avoids mutating internal
			 * node properties after creation.
			 */
			const bloomPass: any =
				bloom(
					workingColor,
					profile.bloomStrength,
					profile.bloomRadius,
					profile.bloomThreshold,
				);

			workingColor =
				workingColor.add(
					bloomPass,
				);
		}

		renderPipeline.outputNode =
			workingColor;

		renderPipeline.needsUpdate = true;

		if ('toneMapping' in this.renderer) {
			this.renderer.toneMapping =
				(webgpu as any).ACESFilmicToneMapping ??
				THREE.ACESFilmicToneMapping;
		}

		if ('toneMappingExposure' in this.renderer) {
			this.renderer.toneMappingExposure =
				this.toneMappingExposure;
		}

		this.runtime = {
			renderPipeline,
		};

		console.info(
			'[Phase 4.1] WebGPU visual pipeline ready',
			{
				quality: this.quality,
				gtao: this.enableGTAO,
				ssr: this.enableSSR,
				bloom: this.enableBloom,
				exposure: this.toneMappingExposure,
			},
		);
	}

	private resetRuntime(): void {
		this.runtimeGeneration++;

		if (this.runtime?.renderPipeline.dispose) {
			this.runtime.renderPipeline.dispose();
		}

		this.runtime = null;
		this.initializationPromise = null;
		this.initializationFailed = false;
	}
}

type QualityProfile = {
	gtao: boolean;
	ssr: boolean;
	bloom: boolean;

	aoResolutionScale: number;
	aoSamples: number;
	aoRadius: number;
	aoThickness: number;
	aoStrength: number;

	ssrResolutionScale: number;
	ssrQuality: number;
	ssrBlurQuality: number;
	ssrMaxDistance: number;
	ssrOpacity: number;
	ssrThickness: number;

	bloomThreshold: number;
	bloomStrength: number;
	bloomRadius: number;

	exposure: number;
};

function resolveQuality(
	urlQuality: string | null,
	optionQuality: PostProcessingQuality | undefined,
): PostProcessingQuality {
	if (
		urlQuality === 'low' ||
		urlQuality === 'medium' ||
		urlQuality === 'high' ||
		urlQuality === 'ultra'
	) {
		return urlQuality;
	}

	return optionQuality ?? 'high';
}

function getQualityProfile(
	quality: PostProcessingQuality,
): QualityProfile {
	switch (quality) {
		case 'low':
			return {
				gtao: false,
				ssr: false,
				bloom: true,

				aoResolutionScale: 0.35,
				aoSamples: 6,
				aoRadius: 0.16,
				aoThickness: 0.65,
				aoStrength: 0.18,

				ssrResolutionScale: 0.45,
				ssrQuality: 0.20,
				ssrBlurQuality: 1,
				ssrMaxDistance: 10,
				ssrOpacity: 0.05,
				ssrThickness: 0.018,

				bloomThreshold: 0.990,
				bloomStrength: 0.08,
				bloomRadius: 0.10,

				exposure: 0.98,
			};

		case 'medium':
			return {
				gtao: true,
				ssr: false,
				bloom: true,

				aoResolutionScale: 0.45,
				aoSamples: 8,
				aoRadius: 0.18,
				aoThickness: 0.72,
				aoStrength: 0.24,

				ssrResolutionScale: 0.55,
				ssrQuality: 0.26,
				ssrBlurQuality: 1,
				ssrMaxDistance: 14,
				ssrOpacity: 0.08,
				ssrThickness: 0.022,

				bloomThreshold: 0.982,
				bloomStrength: 0.12,
				bloomRadius: 0.12,

				exposure: 0.99,
			};

		case 'ultra':
			return {
				gtao: true,
				ssr: true,
				bloom: true,

				aoResolutionScale: 0.65,
				aoSamples: 16,
				aoRadius: 0.23,
				aoThickness: 0.82,
				aoStrength: 0.34,

				ssrResolutionScale: 0.80,
				ssrQuality: 0.34,
				ssrBlurQuality: 3,
				ssrMaxDistance: 18,
				ssrOpacity: 0.16,
				ssrThickness: 0.028,

				bloomThreshold: 0.965,
				bloomStrength: 0.22,
				bloomRadius: 0.17,

				exposure: 1.00,
			};

		case 'high':
		default:
			return {
				gtao: true,
				ssr: true,
				bloom: true,

				aoResolutionScale: 0.50,
				aoSamples: 12,
				aoRadius: 0.20,
				aoThickness: 0.78,
				aoStrength: 0.29,

				ssrResolutionScale: 0.70,
				ssrQuality: 0.24,
				ssrBlurQuality: 2,
				ssrMaxDistance: 14,
				ssrOpacity: 0.12,
				ssrThickness: 0.024,

				bloomThreshold: 0.975,
				bloomStrength: 0.16,
				bloomRadius: 0.14,

				exposure: 1.00,
			};
	}
}

function setUniformOrProperty(
	host: Record<string, any>,
	key: string,
	value: number,
): void {
	const current =
		host[key];

	if (
		current &&
		typeof current === 'object' &&
		'value' in current
	) {
		current.value = value;
		return;
	}

	/*
	 * Some Three.js versions expose compile-time quality settings as
	 * primitive values. Preserve compatibility without replacing a
	 * UniformNode when one already exists.
	 */
	host[key] = value;
}
