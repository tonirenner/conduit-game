import * as THREE from 'three';

import type { RendererMode, Web3DRenderer } from '../renderer';
import type { PlanetAtmospherePostProcessRuntime } from './PlanetAtmospherePostProcess';

export type PostProcessingQuality = 'low' | 'medium' | 'high' | 'ultra';
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
	atmosphere: PlanetAtmospherePostProcessRuntime;
};

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
	ssrMaxDistance: number;
	ssrOpacity: number;
	ssrThickness: number;
	bloomThreshold: number;
	bloomStrength: number;
	bloomRadius: number;
	exposure: number;
};

/**
 * WebGPU visual pipeline with one shared scene/depth pass.
 *
 * Atmosphere is deliberately composed from the same scene color + depth that
 * GTAO/SSR use. This avoids the old atmosphere shell, keeps terrain visible,
 * and makes Orbit -> Regional -> Surface use one depth-aware atmosphere path.
 */
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
		this.enabled = options.enabled !== false && params.get('postfx') !== '0';
		this.quality = resolveQuality(params.get('fx'), options.quality);

		const profile = getQualityProfile(this.quality);
		this.enableGTAO = options.enableGTAO ?? (params.get('ao') !== '0' && profile.gtao);
		this.enableSSR = options.enableSSR ?? (params.get('ssr') !== '0' && profile.ssr);
		this.enableBloom = options.enableBloom ?? (params.get('bloom') !== '0' && profile.bloom);
		this.toneMappingExposure = options.toneMappingExposure ?? profile.exposure;

		if (this.enabled && this.rendererMode === 'webgpu') {
			this.startInitialization();
		}
	}

	render(): void {
		if (!this.enabled || this.initializationFailed || this.rendererMode !== 'webgpu') {
			this.renderer.render(this.scene, this.camera);
			return;
		}

		if (this.runtime) {
			try {
				this.runtime.atmosphere.update();
				this.runtime.renderPipeline.render();
				return;
			} catch (error) {
				this.initializationFailed = true;
				this.runtime.renderPipeline.dispose?.();
				this.runtime = null;
				console.warn(
					'WebGPU post-processing failed while compiling/rendering. Falling back to normal rendering.',
					error,
				);
				this.renderer.render(this.scene, this.camera);
				return;
			}
		}

		this.renderer.render(this.scene, this.camera);
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
		const nextQuality = resolveQuality(null, options.quality ?? this.quality);
		const nextProfile = getQualityProfile(nextQuality);
		const nextEnabled = options.enabled ?? this.enabled;
		const nextGTAO = options.enableGTAO ?? this.enableGTAO;
		const nextSSR = options.enableSSR ?? this.enableSSR;
		const nextBloom = options.enableBloom ?? this.enableBloom;
		const nextExposure = options.toneMappingExposure ?? (
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
		if (this.enabled && this.rendererMode === 'webgpu') {
			this.startInitialization();
		}
	}

	dispose(): void {
		this.resetRuntime();
	}

	private startInitialization(): void {
		if (
			this.rendererMode !== 'webgpu' ||
			this.initializationPromise ||
			this.runtime ||
			this.initializationFailed
		) {
			return;
		}

		const generation = this.runtimeGeneration;
		this.initializationPromise = this.initializeWebGPUPipeline(generation)
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
					'WebGPU post-processing could not initialize. Falling back to normal rendering.',
					error,
				);
			});
	}

	private async initializeWebGPUPipeline(generation: number): Promise<void> {
		const [webgpu, tsl, gtaoModule, ssrModule, bloomModule, atmosphereModule] = await Promise.all([
			import('three/webgpu'),
			import('three/tsl'),
			import('three/addons/tsl/display/GTAONode.js'),
			import('three/addons/tsl/display/SSRNode.js'),
			import('three/addons/tsl/display/BloomNode.js'),
			import('./PlanetAtmospherePostProcess'),
		]);

		if (generation !== this.runtimeGeneration) {
			return;
		}

		const RenderPipeline = (webgpu as any).RenderPipeline;
		const {
			pass,
			mrt,
			output,
			normalView,
			float,
			smoothstep,
			vec4,
		} = tsl as any;
		const ao = (gtaoModule as any).ao;
		const ssr = (ssrModule as any).ssr;
		const bloom = (bloomModule as any).bloom;

		if (!RenderPipeline || !pass || !mrt || !output || !normalView || !float || !smoothstep || !vec4) {
			throw new Error('Required Three.js WebGPU/TSL post-processing API is unavailable.');
		}

		const renderPipeline = new RenderPipeline(this.renderer as any) as RenderPipelineLike;
		const scenePass = pass(this.scene, this.camera);
		scenePass.setMRT(mrt({ output, normal: normalView }));

		const sceneColor = scenePass.getTextureNode('output');
		const sceneNormal = scenePass.getTextureNode('normal');
		const sceneDepth = scenePass.getTextureNode('depth');
		if (!sceneColor || !sceneNormal || !sceneDepth) {
			throw new Error('Could not create required WebGPU scene texture nodes.');
		}

		const profile = getQualityProfile(this.quality);
		let workingColor: any = sceneColor;

		if (this.enableGTAO && ao) {
			const aoPass: any = ao(sceneDepth, sceneNormal, this.camera);
			aoPass.resolutionScale = profile.aoResolutionScale;
			setUniformOrProperty(aoPass, 'samples', profile.aoSamples);
			setUniformOrProperty(aoPass, 'radius', profile.aoRadius);
			setUniformOrProperty(aoPass, 'thickness', profile.aoThickness);

			const aoOutput = aoPass.getTextureNode();
			const foregroundMask = float(1.0).sub(
				smoothstep(float(0.995), float(1.0), sceneDepth.r),
			);
			const maskedStrength = float(profile.aoStrength).mul(foregroundMask);
			workingColor = vec4(
				workingColor.rgb.mul(
					float(1.0).sub(maskedStrength.mul(float(1.0).sub(aoOutput.r))),
				),
				workingColor.a,
			);
		}

		if (this.enableSSR && ssr) {
			const ssrPass: any = ssr(
				sceneColor,
				sceneDepth,
				sceneNormal,
				{
					camera: this.camera,
					metalnessNode: float(0.32),
					roughnessNode: float(0.78),
				},
			);
			ssrPass.resolutionScale = profile.ssrResolutionScale;
			setUniformOrProperty(ssrPass, 'quality', profile.ssrQuality);
			setUniformOrProperty(ssrPass, 'maxDistance', profile.ssrMaxDistance);
			setUniformOrProperty(ssrPass, 'opacity', profile.ssrOpacity);
			setUniformOrProperty(ssrPass, 'thickness', profile.ssrThickness);
			workingColor = vec4(
				workingColor.rgb.add(ssrPass.rgb.mul(profile.ssrOpacity)),
				workingColor.a,
			);
		}

		const atmosphere = atmosphereModule.createPlanetAtmospherePostProcess(
			this.scene,
			this.camera,
			workingColor,
			sceneDepth,
		);
		workingColor = atmosphere.outputNode;

		if (this.enableBloom && bloom) {
			const bloomPass: any = bloom(
				workingColor,
				profile.bloomStrength,
				profile.bloomRadius,
				profile.bloomThreshold,
			);
			workingColor = workingColor.add(bloomPass);
		}

		renderPipeline.outputNode = workingColor;
		renderPipeline.needsUpdate = true;

		if ('toneMapping' in this.renderer) {
			this.renderer.toneMapping =
				(webgpu as any).ACESFilmicToneMapping ?? THREE.ACESFilmicToneMapping;
		}
		if ('toneMappingExposure' in this.renderer) {
			this.renderer.toneMappingExposure = this.toneMappingExposure;
		}

		this.runtime = { renderPipeline, atmosphere };
		console.info('[Conduit] WebGPU visual pipeline ready', {
			quality: this.quality,
			gtao: this.enableGTAO,
			ssr: this.enableSSR,
			bloom: this.enableBloom,
			atmosphere: 'depth-aware multi-planet',
		});
	}

	private resetRuntime(): void {
		this.runtimeGeneration++;
		this.runtime?.renderPipeline.dispose?.();
		this.runtime = null;
		this.initializationPromise = null;
		this.initializationFailed = false;
	}
}

function resolveQuality(
	urlQuality: string | null,
	optionQuality: PostProcessingQuality | undefined,
): PostProcessingQuality {
	if (urlQuality === 'low' || urlQuality === 'medium' || urlQuality === 'high' || urlQuality === 'ultra') {
		return urlQuality;
	}
	return optionQuality ?? 'high';
}

function getQualityProfile(quality: PostProcessingQuality): QualityProfile {
	switch (quality) {
		case 'low':
			return {
				gtao: false, ssr: false, bloom: true,
				aoResolutionScale: 0.35, aoSamples: 6, aoRadius: 0.16, aoThickness: 0.65, aoStrength: 0.18,
				ssrResolutionScale: 0.45, ssrQuality: 0.20, ssrMaxDistance: 10, ssrOpacity: 0.05, ssrThickness: 0.018,
				bloomThreshold: 0.990, bloomStrength: 0.08, bloomRadius: 0.10, exposure: 0.98,
			};
		case 'medium':
			return {
				gtao: true, ssr: false, bloom: true,
				aoResolutionScale: 0.45, aoSamples: 8, aoRadius: 0.18, aoThickness: 0.72, aoStrength: 0.24,
				ssrResolutionScale: 0.55, ssrQuality: 0.26, ssrMaxDistance: 14, ssrOpacity: 0.08, ssrThickness: 0.022,
				bloomThreshold: 0.982, bloomStrength: 0.12, bloomRadius: 0.12, exposure: 0.99,
			};
		case 'ultra':
			return {
				gtao: true, ssr: true, bloom: true,
				aoResolutionScale: 0.65, aoSamples: 16, aoRadius: 0.23, aoThickness: 0.82, aoStrength: 0.34,
				ssrResolutionScale: 0.80, ssrQuality: 0.34, ssrMaxDistance: 18, ssrOpacity: 0.16, ssrThickness: 0.028,
				bloomThreshold: 0.965, bloomStrength: 0.22, bloomRadius: 0.17, exposure: 1.00,
			};
		case 'high':
		default:
			return {
				gtao: true, ssr: true, bloom: true,
				aoResolutionScale: 0.50, aoSamples: 12, aoRadius: 0.20, aoThickness: 0.78, aoStrength: 0.29,
				ssrResolutionScale: 0.70, ssrQuality: 0.24, ssrMaxDistance: 14, ssrOpacity: 0.12, ssrThickness: 0.024,
				bloomThreshold: 0.975, bloomStrength: 0.16, bloomRadius: 0.14, exposure: 1.00,
			};
	}
}

function setUniformOrProperty(
	host: Record<string, any>,
	key: string,
	value: number,
): void {
	const current = host[key];
	if (current && typeof current === 'object' && 'value' in current) {
		current.value = value;
		return;
	}
	host[key] = value;
}
