import * as THREE from 'three';

export type PostProcessingQuality =
	| 'low'
	| 'medium'
	| 'high'
	| 'ultra';

export type PostProcessingRendererMode =
	| 'webgl'
	| 'webgpu';

export type PostProcessingPipelineOptions = {
	enabled?: boolean;
	rendererMode: PostProcessingRendererMode;
	quality?: PostProcessingQuality;
	enableGTAO?: boolean;
	enableSSR?: boolean;
	enableBloom?: boolean;
	toneMappingExposure?: number;
};

type RendererLike = {
	render: (
		scene: THREE.Scene,
		camera: THREE.Camera,
	) => void;
	toneMapping?: THREE.ToneMapping;
	toneMappingExposure?: number;
};

type RenderPipelineLike = {
	outputNode: unknown;
	needsUpdate?: boolean;
	render: () => void;
};

type PipelineRuntime = {
	renderPipeline: RenderPipelineLike;
};

export class PostProcessingPipeline {
	private readonly enabled: boolean;
	private readonly quality: PostProcessingQuality;
	private readonly enableGTAO: boolean;
	private readonly enableSSR: boolean;
	private readonly enableBloom: boolean;
	private readonly toneMappingExposure: number;

	private runtime: PipelineRuntime | null = null;
	private initializationPromise: Promise<void> | null = null;
	private initializationFailed = false;

	constructor(
		private readonly renderer: RendererLike,
		private readonly scene: THREE.Scene,
		private readonly camera: THREE.PerspectiveCamera,
		options: PostProcessingPipelineOptions,
	) {
		const params = new URLSearchParams(window.location.search);

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
			options.rendererMode === 'webgpu'
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

	isReady(): boolean {
		return Boolean(this.runtime);
	}

	private startInitialization(): void {
		if (
			this.initializationPromise ||
			this.runtime ||
			this.initializationFailed
		) {
			return;
		}

		this.initializationPromise =
			this.initializeWebGPUPipeline()
				.catch((error) => {
					this.initializationFailed = true;

					console.warn(
						'Phase 4 WebGPU post-processing could not initialize. ' +
						'Falling back to the normal renderer.',
						error,
					);
				});
	}

	private async initializeWebGPUPipeline(): Promise<void> {
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
						metalnessNode: float(0.72),
						roughnessNode: float(0.0),
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
				aoStrength: 0.24,

				ssrResolutionScale: 0.35,
				ssrQuality: 0.20,
				ssrBlurQuality: 1,
				ssrMaxDistance: 14,
				ssrOpacity: 0.18,
				ssrThickness: 0.030,

				bloomThreshold: 0.96,
				bloomStrength: 0.22,
				bloomRadius: 0.18,

				exposure: 1.00,
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
				aoStrength: 0.30,

				ssrResolutionScale: 0.4,
				ssrQuality: 0.26,
				ssrBlurQuality: 1,
				ssrMaxDistance: 18,
				ssrOpacity: 0.22,
				ssrThickness: 0.034,

				bloomThreshold: 0.94,
				bloomStrength: 0.28,
				bloomRadius: 0.22,

				exposure: 1.00,
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
				aoStrength: 0.42,

				ssrResolutionScale: 0.65,
				ssrQuality: 0.46,
				ssrBlurQuality: 3,
				ssrMaxDistance: 26,
				ssrOpacity: 0.34,
				ssrThickness: 0.044,

				bloomThreshold: 0.90,
				bloomStrength: 0.40,
				bloomRadius: 0.28,

				exposure: 1.02,
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
				aoStrength: 0.36,

				ssrResolutionScale: 0.5,
				ssrQuality: 0.34,
				ssrBlurQuality: 2,
				ssrMaxDistance: 22,
				ssrOpacity: 0.28,
				ssrThickness: 0.038,

				bloomThreshold: 0.92,
				bloomStrength: 0.34,
				bloomRadius: 0.25,

				exposure: 1.01,
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
