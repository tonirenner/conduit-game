import * as THREE from 'three';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { disposeObject3D } from '../../DebugPrimitives';

export class PostFxTestScene implements FeatureTestScene {
	readonly id = 'rendering-postfx';
	readonly name = 'PostProcessing';
	readonly category = 'Rendering' as const;
	readonly description = 'Standardized scene for GTAO, SSR, Bloom and exposure inspection.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private emissive: THREE.Mesh | null = null;
	private bloomStrength = 0.70;

	init(context: FeatureTestContext): void {
		this.context = context;
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
			label: 'startup settings',
			detail: `GTAO ${context.settings.gtao ? 'on' : 'off'}, SSR ${context.settings.ssr ? 'on' : 'off'}, Bloom ${context.settings.bloom ? 'on' : 'off'}`,
		});
	}

	update(deltaSeconds: number): void {
		if (this.emissive) {
			this.emissive.rotation.y += deltaSeconds * 0.6;
			const material = this.emissive.material as THREE.MeshStandardMaterial;
			material.emissiveIntensity =
				this.bloomStrength +
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
			this.bloomStrength;
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
			`<label style="display:block;margin:6px 0;">Emissive Strength ` +
			`<input data-bloom-proxy type="range" min="0" max="2" step="0.05" value="${this.bloomStrength}" style="width:150px;"></label>` +
			`<div style="opacity:.62;margin-top:8px;">PostFX toggles are currently applied at startup through Settings.</div>`;

		root.querySelector<HTMLInputElement>('[data-bloom-proxy]')
			?.addEventListener('input', (event) => {
				this.bloomStrength = Number((event.currentTarget as HTMLInputElement).value);
			});
	}
}
