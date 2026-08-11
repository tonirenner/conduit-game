import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { PostProcessingQuality } from '@conduit/web3d/postprocessing';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';

type PostFxState = {
	enabled: boolean;
	quality: PostProcessingQuality;
	gtao: boolean;
	ssr: boolean;
	bloom: boolean;
	exposure: number;
	emissiveStrength: number;
};

export class PostFxTestScene implements FeatureTestScene {
	readonly id = 'rendering-postfx';
	readonly name = 'PostProcessing';
	readonly category = 'Rendering' as const;
	readonly description = 'Standardized scene for GTAO, SSR, Bloom and exposure inspection.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private emissive: THREE.Mesh | null = null;
	private state: PostFxState = {
		enabled: true,
		quality: 'high',
		gtao: true,
		ssr: true,
		bloom: true,
		exposure: 1,
		emissiveStrength: 0.70,
	};

	init(context: FeatureTestContext): void {
		this.context = context;
		this.state = createInitialPostFxState(context);
		this.root.name = 'PostFxTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 4.2, 9);
		context.controls.target.set(0, 0.8, 0);
		context.controls.update();
		this.createScene();
		this.createUi(context.uiRoot);
		context.report({
			status: context.rendererMode === 'webgpu' ? 'pass' : 'warn',
			label: 'postfx renderer',
			detail: context.rendererMode,
		});
		context.report({
			status: 'info',
			label: 'runtime controls',
			detail: context.postProcessing
				? 'Live PostFX updates are applied to the active pipeline.'
				: 'No active PostProcessingPipeline was provided.',
		});
		this.applyPostFxState();
	}

	update(deltaSeconds: number): void {
		if (this.emissive) {
			this.emissive.rotation.y += deltaSeconds * 0.6;
			const material = this.emissive.material as THREE.MeshStandardMaterial;
			material.emissiveIntensity =
				this.state.emissiveStrength +
				Math.sin(performance.now() * 0.002) * 0.05;
		}
	}

	dispose(): void {
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		disposeObject3D(this.root);
		this.root.clear();
		this.createScene();
	}

	private createScene(): void {
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(12, 12),
			new THREE.MeshStandardMaterial({
				color: 0x1f2529,
				roughness: 0.92,
				metalness: 0.0,
			}),
		);
		floor.rotation.x = -Math.PI * 0.5;
		floor.position.y = -0.75;
		this.root.add(floor);

		this.root.add(this.createSphere(-3.2, 0x9ca7af, 0.18, 0.88, 'metal'));
		this.root.add(this.createSphere(-1.1, 0x4f6f83, 0.82, 0.08, 'rough'));
		this.root.add(this.createSphere(1.1, 0x15191e, 0.64, 0.02, 'dark'));
		this.emissive = this.createSphere(3.2, 0x8acfe8, 0.44, 0.04, 'emissive');
		(this.emissive.material as THREE.MeshStandardMaterial).emissive =
			new THREE.Color(0x35c5ff);
		(this.emissive.material as THREE.MeshStandardMaterial).emissiveIntensity =
			this.state.emissiveStrength;
		this.root.add(this.emissive);

		const key = new THREE.DirectionalLight(0xffffff, 2.8);
		key.position.set(4, 7, 5);
		this.root.add(key);
		this.root.add(new THREE.AmbientLight(0x8fb6d8, 0.14));
	}

	private createSphere(
		x: number,
		color: THREE.ColorRepresentation,
		roughness: number,
		metalness: number,
		name: string,
	): THREE.Mesh {
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(0.78, 48, 24),
			new THREE.MeshStandardMaterial({
				color,
				roughness,
				metalness,
				envMapIntensity: 1.0,
			}),
		);

		mesh.name = name;
		mesh.position.set(x, 0.15, 0);
		return mesh;
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			this.checkbox('enabled', 'PostFX Enabled') +
			this.selectQuality() +
			this.checkbox('gtao', 'GTAO') +
			this.checkbox('ssr', 'SSR') +
			this.checkbox('bloom', 'Bloom') +
			this.range('exposure', 'Exposure', 0.2, 2.2, 0.02) +
			this.range('emissiveStrength', 'Emissive Strength', 0, 2, 0.05) +
			`<div style="opacity:.62;margin-top:8px;">Effect toggles rebuild the WebGPU pipeline. Exposure updates immediately.</div>`;

		for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-postfx]')) {
			input.addEventListener('input', () => {
				this.readStateFromUi(root);
				this.applyPostFxState();
			});
		}
	}

	private checkbox(key: keyof PostFxState, label: string): string {
		return (
			`<label style="display:block;margin:6px 0;">` +
			`<input data-postfx="${key}" type="checkbox" ${this.state[key] ? 'checked' : ''}> ${label}` +
			`</label>`
		);
	}

	private range(
		key: keyof PostFxState,
		label: string,
		min: number,
		max: number,
		step: number,
	): string {
		const value = this.state[key];

		return (
			`<label style="display:block;margin:7px 0;">${label}<br>` +
			`<input data-postfx="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="width:170px;"> ` +
			`<span data-value="${key}" style="opacity:.72">${value}</span>` +
			`</label>`
		);
	}

	private selectQuality(): string {
		const options: PostProcessingQuality[] = ['low', 'medium', 'high', 'ultra'];

		return (
			`<label style="display:block;margin:7px 0;">Quality<br>` +
			`<select data-postfx="quality" style="min-width:120px;">` +
			options.map((quality) => (
				`<option value="${quality}" ${quality === this.state.quality ? 'selected' : ''}>${quality}</option>`
			)).join('') +
			`</select></label>`
		);
	}

	private readStateFromUi(root: HTMLElement): void {
		for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-postfx]')) {
			const key = input.dataset.postfx as keyof PostFxState;

			if (input instanceof HTMLInputElement && input.type === 'checkbox') {
				this.setBooleanState(key, input.checked);
			} else if (input instanceof HTMLInputElement && input.type === 'range') {
				const value = Number(input.value);

				this.setNumberState(key, value);

				const valueLabel = root.querySelector<HTMLElement>(`[data-value="${key}"]`);

				if (valueLabel) {
					valueLabel.textContent = value.toFixed(2);
				}
			} else if (key === 'quality') {
				this.state.quality = input.value as PostProcessingQuality;
			}
		}
	}

	private setBooleanState(key: keyof PostFxState, value: boolean): void {
		switch (key) {
			case 'enabled':
				this.state.enabled = value;
				break;
			case 'gtao':
				this.state.gtao = value;
				break;
			case 'ssr':
				this.state.ssr = value;
				break;
			case 'bloom':
				this.state.bloom = value;
				break;
		}
	}

	private setNumberState(key: keyof PostFxState, value: number): void {
		switch (key) {
			case 'exposure':
				this.state.exposure = value;
				break;
			case 'emissiveStrength':
				this.state.emissiveStrength = value;
				break;
		}
	}

	private applyPostFxState(): void {
		this.context?.postProcessing?.updateOptions({
			enabled: this.state.enabled,
			quality: this.state.quality,
			enableGTAO: this.state.gtao,
			enableSSR: this.state.ssr,
			enableBloom: this.state.bloom,
			toneMappingExposure: this.state.exposure,
		});

		this.context?.updateSettings({
			graphicsQuality: this.state.quality,
			gtao: this.state.gtao,
			ssr: this.state.ssr,
			bloom: this.state.bloom,
		});
	}
}

function createInitialPostFxState(context: FeatureTestContext): PostFxState {
	const pipelineOptions = context.postProcessing?.getOptions();

	return {
		enabled: pipelineOptions?.enabled ?? true,
		quality: pipelineOptions?.quality ?? context.settings.graphicsQuality,
		gtao: pipelineOptions?.enableGTAO ?? context.settings.gtao,
		ssr: pipelineOptions?.enableSSR ?? context.settings.ssr,
		bloom: pipelineOptions?.enableBloom ?? context.settings.bloom,
		exposure: pipelineOptions?.toneMappingExposure ?? 1,
		emissiveStrength: 0.70,
	};
}
