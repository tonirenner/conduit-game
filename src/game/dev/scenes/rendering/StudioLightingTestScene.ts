import * as THREE from 'three';
import { ensureUv2FromUv, loadGltfObject } from '@conduit/web3d/assets';
import { frameObject, normalizeObjectToSize } from '@conduit/web3d/camera';
import { disposeObject3D } from '@conduit/web3d/debug';
import {
	SceneEnvironmentManager,
} from '@conduit/web3d/environment';
import { StudioLightingRig } from '@conduit/web3d/lighting';
import {
	captureMaterialSnapshot,
	restoreMaterialSnapshot,
	type MaterialSnapshot,
} from '@conduit/web3d/materials';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import {
	FRIGATE_MATERIAL_LIGHTING_PROFILE,
	GAME_ENVIRONMENT_PROBE_PROFILE,
} from '../../../rendering/ShipMaterialLightingProfile';

const FRIGATE_URL = '/models/frigate.glb';
const STUDIO_EXR_URL = '/models/warm_studio_hangar_4k.exr';

type StudioState = {
	environmentIntensity: number;
	environmentRotation: number;
	environmentVisible: boolean;
	backgroundColor: string;
	keyIntensity: number;
	keyColor: string;
	keyAzimuth: number;
	keyElevation: number;
	fillIntensity: number;
	fillColor: string;
	exposure: number;
	roughnessMultiplier: number;
	metalnessMultiplier: number;
	envMapIntensity: number;
	normalScale: number;
	aoMapIntensity: number;
	emissiveIntensityMultiplier: number;
	floorVisible: boolean;
	modelYOffset: number;
	gtaoEnabled: boolean;
	ssrEnabled: boolean;
	bloomEnabled: boolean;
};

type StudioStateValue = StudioState[keyof StudioState];

export class StudioLightingTestScene implements FeatureTestScene {
	readonly id = 'rendering-studio-lighting';
	readonly name = 'Studio Lighting';
	readonly category = 'Rendering' as const;
	readonly description = 'Frigate GLB material and studio lighting scene for Blender-look matching.';

	private context: FeatureTestContext | null = null;
	private hostScene: THREE.Scene | null = null;
	private environmentManager: SceneEnvironmentManager | null = null;
	private lightingRig: StudioLightingRig | null = null;
	private readonly root = new THREE.Group();
	private model: THREE.Object3D | null = null;
	private floor: THREE.Mesh | null = null;
	private readonly modelBasePosition = new THREE.Vector3();
	private readonly materialSnapshots: MaterialSnapshot[] = [];
	private loadGeneration = 0;
	private state: StudioState = createBlenderMatchState();

	async init(context: FeatureTestContext): Promise<void> {
		this.context = context;
		this.hostScene = getHostScene(context.scene);
		this.environmentManager = new SceneEnvironmentManager(
			this.hostScene,
			context.renderer,
		);
		this.root.name = 'StudioLightingTestScene';
		context.scene.add(this.root);

		context.camera.position.set(0, 2.15, 7.2);
		context.controls.target.set(0, 0.65, 0);
		context.controls.enablePan = true;
		context.controls.update();

		this.createLighting();
		this.createFloor();
		this.createUi(context.uiRoot);
		this.applyLighting();
		this.applyHostSceneState();

		await Promise.all([
			this.loadEnvironment(),
			this.loadFrigate(),
		]);

		this.applyMaterialState();
	}

	update(deltaSeconds: number): void {
		if (this.model) {
			this.model.rotation.y += deltaSeconds * 0.08;
		}
	}

	dispose(): void {
		this.loadGeneration++;
		this.environmentManager?.dispose({ restore: true });
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.lightingRig?.dispose();
		this.environmentManager = null;
		this.lightingRig = null;
		this.materialSnapshots.length = 0;
		this.model = null;
		this.floor = null;
		this.context = null;
		this.hostScene = null;
	}

	async reset(): Promise<void> {
		this.resetToGlb();
	}

	private async loadEnvironment(): Promise<void> {
		const context = this.context;
		const environmentManager = this.environmentManager;
		const generation = this.loadGeneration;

		if (!context || !environmentManager) {
			return;
		}

		try {
			const environment = await environmentManager.loadExr(STUDIO_EXR_URL);

			if (!environment || generation !== this.loadGeneration) {
				return;
			}

			this.applyHostSceneState();

			context.report({
				status: 'pass',
				label: 'studio EXR loaded',
				detail: STUDIO_EXR_URL,
			});
		} catch (error) {
			context.report({
				status: 'warn',
				label: 'studio EXR unavailable',
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async loadFrigate(): Promise<void> {
		const context = this.context;
		const generation = this.loadGeneration;

		if (!context) {
			return;
		}

		try {
			const model = await loadGltfObject(
				FRIGATE_URL,
				{ name: 'Frigate Studio GLB' },
			);

			if (generation !== this.loadGeneration) {
				disposeObject3D(model);
				return;
			}

			this.prepareModel(model);
			this.modelBasePosition.copy(model.position);
			this.root.add(model);
			this.model = model;
			this.frameLoadedModel(model);
			this.applySceneObjectState();

			context.report({
				status: 'pass',
				label: 'frigate loaded',
				detail: `${this.materialSnapshots.length} material instances`,
			});
		} catch (error) {
			context.report({
				status: 'fail',
				label: 'frigate failed',
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private prepareModel(model: THREE.Object3D): void {
		ensureUv2FromUv(model);

		model.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) {
				return;
			}

			object.geometry = object.geometry.clone();
			object.castShadow = false;
			object.receiveShadow = false;
			object.frustumCulled = false;

			if (Array.isArray(object.material)) {
				object.material = object.material.map((material) => this.cloneMaterial(material));
			} else {
				object.material = this.cloneMaterial(object.material);
			}
		});

		normalizeObjectToSize(model, 4.6);
	}

	private frameLoadedModel(model: THREE.Object3D): void {
		const context = this.context;

		if (!context) {
			return;
		}

		const box = new THREE.Box3().setFromObject(model);
		const center = new THREE.Vector3();

		box.getCenter(center);

		const floorY = box.min.y - 0.08;

		if (this.floor) {
			this.floor.position.set(center.x, floorY, center.z);
			this.floor.visible = this.state.floorVisible;
		}

		frameObject(
			model,
			context.camera,
			context.controls,
			{
				minDistance: 5.2,
				distanceMultiplier: 1.45,
				targetHeightFactor: 0.52,
			},
		);
	}

	private cloneMaterial(material: THREE.Material): THREE.Material {
		const clone = material.clone();

		clone.depthWrite = true;
		clone.depthTest = true;
		clone.needsUpdate = true;
		this.materialSnapshots.push(captureMaterialSnapshot(clone));

		return clone;
	}

	private createLighting(): void {
		this.lightingRig = new StudioLightingRig({
			keyIntensity: this.state.keyIntensity,
			keyColor: this.state.keyColor,
			keyAzimuthDegrees: this.state.keyAzimuth,
			keyElevationDegrees: this.state.keyElevation,
			fillIntensity: this.state.fillIntensity,
			fillColor: this.state.fillColor,
		});
		this.root.add(this.lightingRig.group);
	}

	private createFloor(): void {
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 8),
			new THREE.MeshStandardMaterial({
				color: 0x101318,
				roughness: 0.92,
				metalness: 0.0,
			}),
		);
		this.floor.name = 'Studio Matte Floor';
		this.floor.rotation.x = -Math.PI * 0.5;
		this.floor.position.y = -1.55;
		this.root.add(this.floor);
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<div style="display:flex;gap:6px;margin-bottom:10px;">` +
			`<button data-action="reset-glb">Reset to GLB</button>` +
			`<button data-action="blender-match">Blender Match</button>` +
			`</div>` +
			this.section('Environment', [
				this.range('environmentIntensity', 'Environment Intensity', 0, 3, 0.05),
				this.range('environmentRotation', 'Environment Rotation', -180, 180, 1),
				this.checkbox('environmentVisible', 'Environment Visible'),
				this.color('backgroundColor', 'Background Color'),
			]) +
			this.section('Lighting', [
				this.range('keyIntensity', 'Key Intensity', 0, 8, 0.05),
				this.color('keyColor', 'Key Color'),
				this.range('keyAzimuth', 'Key Azimuth', -180, 180, 1),
				this.range('keyElevation', 'Key Elevation', -20, 85, 1),
				this.range('fillIntensity', 'Fill Intensity', 0, 2, 0.02),
				this.color('fillColor', 'Fill Color'),
				this.range('exposure', 'Exposure', 0.2, 2.2, 0.02),
			]) +
			this.section('Materials', [
				this.range('roughnessMultiplier', 'Roughness Multiplier', 0, 2, 0.02),
				this.range('metalnessMultiplier', 'Metalness Multiplier', 0, 2, 0.02),
				this.range('envMapIntensity', 'EnvMap Intensity', 0, 3, 0.05),
				this.range('normalScale', 'Normal Map Strength', 0, 2, 0.02),
				this.range('aoMapIntensity', 'AO Map Intensity', 0, 2, 0.02),
				this.range('emissiveIntensityMultiplier', 'Emissive Multiplier', 0, 4, 0.05),
				this.checkbox('floorVisible', 'Floor Visible'),
				this.range('modelYOffset', 'Model Y Offset', -1, 1, 0.01),
			]) +
			this.section('PostFX Settings', [
				this.checkbox('gtaoEnabled', 'GTAO'),
				this.checkbox('ssrEnabled', 'SSR'),
				this.checkbox('bloomEnabled', 'Bloom'),
				`<div style="opacity:.62;margin-top:6px;">Stored in Settings. Existing PostFX pipeline applies these after reload/recreate.</div>`,
			]);

		for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
			button.style.border = '1px solid rgba(143,231,255,.34)';
			button.style.borderRadius = '5px';
			button.style.background = 'rgba(8,25,38,.92)';
			button.style.color = '#d9f7ff';
			button.style.padding = '6px 8px';
			button.style.cursor = 'pointer';
		}

		root.querySelector<HTMLButtonElement>('[data-action="reset-glb"]')
			?.addEventListener('click', () => this.resetToGlb());
		root.querySelector<HTMLButtonElement>('[data-action="blender-match"]')
			?.addEventListener('click', () => this.applyBlenderMatchPreset(root));

		for (const input of root.querySelectorAll<HTMLInputElement>('[data-state]')) {
			input.addEventListener('input', () => {
				this.readStateFromUi(root);
				this.applyLighting();
				this.applyHostSceneState();
				this.applyMaterialState();
				this.applySceneObjectState();
				this.persistPostFxSettings();
			});
		}
	}

	private section(label: string, rows: string[]): string {
		return (
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<div style="color:#8fe7ff;margin-bottom:6px;">${label}</div>` +
			rows.join('') +
			`</section>`
		);
	}

	private range(
		key: keyof StudioState,
		label: string,
		min: number,
		max: number,
		step: number,
	): string {
		const value = this.state[key];

		return (
			`<label style="display:block;margin:7px 0;">${label}<br>` +
			`<input data-state="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="width:190px;"> ` +
			`<span data-value="${key}" style="opacity:.72">${value}</span>` +
			`</label>`
		);
	}

	private color(key: keyof StudioState, label: string): string {
		return (
			`<label style="display:block;margin:7px 0;">${label} ` +
			`<input data-state="${key}" type="color" value="${this.state[key]}"></label>`
		);
	}

	private checkbox(key: keyof StudioState, label: string): string {
		return (
			`<label style="display:block;margin:7px 0;">` +
			`<input data-state="${key}" type="checkbox" ${this.state[key] ? 'checked' : ''}> ${label}` +
			`</label>`
		);
	}

	private readStateFromUi(root: HTMLElement): void {
		for (const input of root.querySelectorAll<HTMLInputElement>('[data-state]')) {
			const key = input.dataset.state as keyof StudioState;
			const current = this.state[key];

			if (typeof current === 'boolean') {
				setStudioStateValue(this.state, key, input.checked);
			} else if (typeof current === 'number') {
				const value = Number(input.value);

				setStudioStateValue(this.state, key, value);

				const valueLabel = root.querySelector<HTMLElement>(`[data-value="${key}"]`);

				if (valueLabel) {
					valueLabel.textContent = value.toFixed(2);
				}
			} else {
				setStudioStateValue(this.state, key, input.value);
			}
		}
	}

	private applyBlenderMatchPreset(root: HTMLElement): void {
		this.state = createBlenderMatchState();
		this.syncUiFromState(root);
		this.applyLighting();
		this.applyHostSceneState();
		this.applyMaterialState();
		this.applySceneObjectState();
		this.persistPostFxSettings();
	}

	private resetToGlb(): void {
		this.state = {
			...this.state,
			roughnessMultiplier: 1,
			metalnessMultiplier: 1,
			normalScale: 1,
			aoMapIntensity: 1,
			emissiveIntensityMultiplier: 1,
			envMapIntensity: 1,
			modelYOffset: 0,
		};

		for (const snapshot of this.materialSnapshots) {
			restoreMaterialSnapshot(snapshot);
		}

		if (this.context) {
			this.syncUiFromState(this.context.uiRoot);
		}

		this.applySceneObjectState();
	}

	private applySceneObjectState(): void {
		if (this.floor) {
			this.floor.visible = this.state.floorVisible;
		}

		if (this.model) {
			this.model.position.copy(this.modelBasePosition);
			this.model.position.y += this.state.modelYOffset;
		}
	}

	private syncUiFromState(root: HTMLElement): void {
		for (const input of root.querySelectorAll<HTMLInputElement>('[data-state]')) {
			const key = input.dataset.state as keyof StudioState;
			const value = this.state[key];

			if (typeof value === 'boolean') {
				input.checked = value;
			} else {
				input.value = String(value);
			}

			const valueLabel = root.querySelector<HTMLElement>(`[data-value="${key}"]`);

			if (valueLabel && typeof value === 'number') {
				valueLabel.textContent = value.toFixed(2);
			}
		}
	}

	private applyLighting(): void {
		if (!this.lightingRig) {
			return;
		}

		this.lightingRig.apply({
			keyIntensity: this.state.keyIntensity,
			keyColor: this.state.keyColor,
			keyAzimuthDegrees: this.state.keyAzimuth,
			keyElevationDegrees: this.state.keyElevation,
			fillIntensity: this.state.fillIntensity,
			fillColor: this.state.fillColor,
		});
	}

	private applyHostSceneState(): void {
		if (!this.environmentManager) {
			return;
		}

		this.environmentManager.apply({
			environmentIntensity: this.state.environmentIntensity,
			environmentRotationDegrees: this.state.environmentRotation,
			environmentVisible: this.state.environmentVisible,
			backgroundColor: this.state.backgroundColor,
			toneMapping: THREE.ACESFilmicToneMapping,
			toneMappingExposure: this.state.exposure,
		});
	}

	private applyMaterialState(): void {
		for (const snapshot of this.materialSnapshots) {
			const material = snapshot.material;

			if (!isStandardMaterial(material)) {
				continue;
			}

			if (snapshot.roughness !== undefined) {
				material.roughness = THREE.MathUtils.clamp(
					snapshot.roughness * this.state.roughnessMultiplier,
					0,
					1,
				);
			}

			if (snapshot.metalness !== undefined) {
				material.metalness = THREE.MathUtils.clamp(
					snapshot.metalness * this.state.metalnessMultiplier,
					0,
					1,
				);
			}

			if (snapshot.envMapIntensity !== undefined) {
				material.envMapIntensity = this.state.envMapIntensity;
			}

			if (snapshot.normalScale && material.normalMap) {
				material.normalScale.copy(snapshot.normalScale)
					.multiplyScalar(this.state.normalScale);
			}

			if (snapshot.aoMapIntensity !== undefined && material.aoMap) {
				material.aoMapIntensity =
					snapshot.aoMapIntensity * this.state.aoMapIntensity;
			}

			if (snapshot.emissiveIntensity !== undefined) {
				material.emissiveIntensity =
					snapshot.emissiveIntensity *
					this.state.emissiveIntensityMultiplier;
			}

			material.needsUpdate = true;
		}
	}

	private persistPostFxSettings(): void {
		this.context?.updateSettings({
			gtao: this.state.gtaoEnabled,
			ssr: this.state.ssrEnabled,
			bloom: this.state.bloomEnabled,
		});
	}

}

function createBlenderMatchState(): StudioState {
	return {
		environmentIntensity: GAME_ENVIRONMENT_PROBE_PROFILE.environmentIntensity,
		environmentRotation: 0,
		environmentVisible: false,
		backgroundColor: '#080b10',
		keyIntensity: 1.6,
		keyColor: '#fff0d8',
		keyAzimuth: -36,
		keyElevation: 38,
		fillIntensity: 0.85,
		fillColor: '#9ab8ff',
		exposure: 1.03,
		roughnessMultiplier: FRIGATE_MATERIAL_LIGHTING_PROFILE.roughnessMultiplier,
		metalnessMultiplier: FRIGATE_MATERIAL_LIGHTING_PROFILE.metalnessMultiplier,
		envMapIntensity: FRIGATE_MATERIAL_LIGHTING_PROFILE.envMapIntensity,
		normalScale: FRIGATE_MATERIAL_LIGHTING_PROFILE.normalScale,
		aoMapIntensity: FRIGATE_MATERIAL_LIGHTING_PROFILE.aoMapIntensity,
		emissiveIntensityMultiplier:
			FRIGATE_MATERIAL_LIGHTING_PROFILE.emissiveIntensityMultiplier,
		floorVisible: true,
		modelYOffset: 0,
		gtaoEnabled: true,
		ssrEnabled: false,
		bloomEnabled: true,
	};
}

function setStudioStateValue(
	state: StudioState,
	key: keyof StudioState,
	value: StudioStateValue,
): void {
	(state as unknown as Record<keyof StudioState, StudioStateValue>)[key] = value;
}

function getHostScene(scene: THREE.Scene): THREE.Scene {
	return scene.parent instanceof THREE.Scene
	       ? scene.parent
	       : scene;
}

function isStandardMaterial(
	material: THREE.Material,
): material is THREE.MeshStandardMaterial {
	return material instanceof THREE.MeshStandardMaterial;
}
