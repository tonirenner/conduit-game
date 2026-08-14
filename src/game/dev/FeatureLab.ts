import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PostProcessingPipeline } from '@conduit/web3d/postprocessing';
import type { AppRenderer, RendererMode } from '@conduit/web3d/renderer';
import { PerspectiveApproachProfile } from '@conduit/web3d/camera';
import type { SettingsStore } from '../settings/GameSettings';
import {
	getFeatureTestRegistration,
	getFeatureTestRegistrations,
} from './FeatureLabRegistry';
import type {
	FeatureLabStatusEntry,
	FeatureTestContext,
	FeatureTestRegistration,
	FeatureTestScene,
} from './FeatureTestScene';
import { disposeObject3D } from '@conduit/web3d/debug';

export type FeatureLabOptions = {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	renderer: AppRenderer;
	rendererMode: RendererMode;
	postProcessing?: PostProcessingPipeline;
	settingsStore: SettingsStore;
	initialSceneId?: string | null;
};

export class FeatureLab {
	private readonly group = new THREE.Group();
	private readonly root = document.createElement('div');
	private readonly nav = document.createElement('div');
	private readonly panel = document.createElement('div');
	private readonly performanceHud = document.createElement('div');
	private readonly sceneUiRoot = document.createElement('div');
	private readonly statusRoot = document.createElement('div');
	private readonly registrations = getFeatureTestRegistrations();
	private readonly planetApproachCamera: PerspectiveApproachProfile;
	private readonly planetApproachCameraEnabled =
		new URLSearchParams(window.location.search).get('planetCamera') !== 'legacy';
	private activeScene: FeatureTestScene | null = null;
	private activeRegistration: FeatureTestRegistration | null = null;
	private paused = false;
	private timeScale = 1;
	private statusEntries: FeatureLabStatusEntry[] = [];
	private performanceSampleSeconds = 0;
	private performanceSampleFrames = 0;
	private displayedFps = 0;
	private displayedFrameMs = 0;

	constructor(
		private readonly options: FeatureLabOptions,
	) {
		this.group.name = 'FeatureLab';
		this.options.scene.add(this.group);
		this.configureCamera();
		this.planetApproachCamera = new PerspectiveApproachProfile(
			this.options.camera,
			{
				referenceRadius: 3,
				farFov: 46,
				approachFov: 34,
				surfaceFov: 48,
				approachStartHeight: 2.1,
				surfaceStartHeight: 0.35,
				surfaceEndHeight: 0.06,
				response: 7,
			},
		);
		this.configureUi();

		const initial =
			(options.initialSceneId &&
				getFeatureTestRegistration(options.initialSceneId)) ||
			this.registrations[0] ||
			null;

		if (initial) {
			void this.openScene(initial.id);
		}
	}

	update(deltaSeconds: number): void {
		this.updatePerformanceHud(deltaSeconds);

		if (!this.activeScene || this.paused) {
			return;
		}

		if (
			this.planetApproachCameraEnabled &&
			this.activeRegistration?.id === 'planet-lod'
		) {
			this.planetApproachCamera.update(deltaSeconds);
		}

		this.activeScene.update(deltaSeconds * this.timeScale);
	}

	dispose(): void {
		this.planetApproachCamera.restore();
		this.activeScene?.dispose();
		this.activeScene = null;
		this.root.remove();
		this.options.scene.remove(this.group);
		disposeObject3D(this.group);
	}

	private configureCamera(): void {
		this.options.camera.position.set(0, 4.8, 12);
		this.options.camera.near = 0.05;
		this.options.camera.far = 4000;
		this.options.camera.updateProjectionMatrix();
		this.options.controls.enabled = true;
		this.options.controls.target.set(0, 0, 0);
		this.options.controls.enablePan = true;
		this.options.controls.enableDamping = true;
		this.options.controls.update();
	}

	private configureUi(): void {
		this.root.style.position = 'fixed';
		this.root.style.inset = '0';
		this.root.style.zIndex = '70';
		this.root.style.pointerEvents = 'none';
		this.root.style.font = '12px/1.35 monospace';
		this.root.style.color = '#d9f7ff';

		this.nav.style.position = 'absolute';
		this.nav.style.left = '14px';
		this.nav.style.top = '14px';
		this.nav.style.width = '260px';
		this.nav.style.maxHeight = 'calc(100vh - 28px)';
		this.nav.style.overflow = 'auto';
		this.nav.style.padding = '12px';
		this.nav.style.border = '1px solid rgba(143,231,255,.34)';
		this.nav.style.borderRadius = '8px';
		this.nav.style.background = 'rgba(3,11,18,.92)';
		this.nav.style.backdropFilter = 'blur(10px)';
		this.nav.style.pointerEvents = 'auto';

		this.panel.style.position = 'absolute';
		this.panel.style.right = '14px';
		this.panel.style.top = '60px';
		this.panel.style.width = '310px';
		this.panel.style.maxHeight = 'calc(100vh - 74px)';
		this.panel.style.overflow = 'auto';
		this.panel.style.padding = '12px';
		this.panel.style.border = '1px solid rgba(143,231,255,.34)';
		this.panel.style.borderRadius = '8px';
		this.panel.style.background = 'rgba(3,11,18,.92)';
		this.panel.style.backdropFilter = 'blur(10px)';
		this.panel.style.pointerEvents = 'auto';

		this.performanceHud.style.position = 'absolute';
		this.performanceHud.style.left = '50%';
		this.performanceHud.style.bottom = '14px';
		this.performanceHud.style.transform = 'translateX(-50%)';
		this.performanceHud.style.padding = '6px 9px';
		this.performanceHud.style.border = '1px solid rgba(143,231,255,.28)';
		this.performanceHud.style.borderRadius = '6px';
		this.performanceHud.style.background = 'rgba(3,11,18,.78)';
		this.performanceHud.style.backdropFilter = 'blur(8px)';
		this.performanceHud.style.color = '#8fe7ff';
		this.performanceHud.style.fontWeight = 'bold';
		this.performanceHud.style.pointerEvents = 'none';
		this.performanceHud.textContent = '-- FPS · -- ms';

		this.root.append(this.nav, this.panel, this.performanceHud);
		document.body.appendChild(this.root);
		this.renderNav();
		this.renderPanel();
	}

	private updatePerformanceHud(deltaSeconds: number): void {
		const sampleSeconds = THREE.MathUtils.clamp(deltaSeconds, 0, 0.25);

		if (sampleSeconds <= 0) {
			return;
		}

		this.performanceSampleSeconds += sampleSeconds;
		this.performanceSampleFrames++;

		if (this.performanceSampleSeconds < 0.25) {
			return;
		}

		const fps = this.performanceSampleFrames / this.performanceSampleSeconds;
		const frameMs = 1000 / Math.max(0.001, fps);
		const smoothing = this.displayedFps > 0 ? 0.42 : 1;

		this.displayedFps = THREE.MathUtils.lerp(this.displayedFps, fps, smoothing);
		this.displayedFrameMs = THREE.MathUtils.lerp(
			this.displayedFrameMs,
			frameMs,
			smoothing,
		);

		this.performanceHud.textContent =
			`${this.displayedFps.toFixed(0)} FPS · ${this.displayedFrameMs.toFixed(1)} ms`;

		this.performanceSampleSeconds = 0;
		this.performanceSampleFrames = 0;
	}

	private renderNav(): void {
		const categories = new Map<string, FeatureTestRegistration[]>();

		for (const registration of this.registrations) {
			const current = categories.get(registration.category) ?? [];
			current.push(registration);
			categories.set(registration.category, current);
		}

		this.nav.innerHTML =
			`<div style="font-weight:bold;color:#8fe7ff;margin-bottom:10px;">FEATURE LAB</div>` +
			[...categories.entries()].map(([category, entries]) => (
				`<section style="margin-top:12px;">` +
				`<div style="color:#8fe7ff;margin-bottom:6px;">${category}</div>` +
				entries.map((entry) => {
					const active = entry.id === this.activeRegistration?.id;
					return (
						`<button data-scene-id="${entry.id}" style="` +
						`display:block;width:100%;margin:4px 0;padding:7px 8px;` +
						`border:1px solid ${active ? 'rgba(143,231,255,.72)' : 'rgba(143,231,255,.22)'};` +
						`border-radius:6px;text-align:left;cursor:pointer;` +
						`background:${active ? 'rgba(24,82,104,.78)' : 'rgba(8,25,38,.78)'};` +
						`color:#d9f7ff;">${entry.name}</button>`
					);
				}).join('') +
				`</section>`
			)).join('');

		for (const button of this.nav.querySelectorAll<HTMLButtonElement>('[data-scene-id]')) {
			button.addEventListener('click', () => {
				const id = button.dataset.sceneId;

				if (id) {
					void this.openScene(id);
				}
			});
		}
	}

	private renderPanel(): void {
		const name = this.activeRegistration?.name ?? 'No Scene';
		const description = this.activeRegistration?.description ?? '';

		this.panel.innerHTML =
			`<div style="font-weight:bold;color:#8fe7ff;">TEST SCENE</div>` +
			`<div style="margin-top:4px;font-size:14px;">${name}</div>` +
			(description ? `<div style="opacity:.68;margin-top:5px;">${description}</div>` : '') +
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<div style="color:#8fe7ff;margin-bottom:6px;">Time</div>` +
			`<button data-pause>${this.paused ? 'Resume' : 'Pause'}</button>` +
			`<button data-time="0.1">0.1x</button>` +
			`<button data-time="0.5">0.5x</button>` +
			`<button data-time="1">1x</button>` +
			`<button data-time="2">2x</button>` +
			`</section>` +
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<button data-reset>Reset Scene</button>` +
			`</section>` +
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<div style="color:#8fe7ff;margin-bottom:6px;">Debug</div>` +
			`<div data-scene-ui></div>` +
			`</section>` +
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<div style="color:#8fe7ff;margin-bottom:6px;">Health</div>` +
			`<div data-status-root></div>` +
			`</section>`;

		for (const button of this.panel.querySelectorAll<HTMLButtonElement>('button')) {
			button.style.margin = '3px';
			button.style.padding = '6px 8px';
			button.style.border = '1px solid rgba(143,231,255,.34)';
			button.style.borderRadius = '5px';
			button.style.background = 'rgba(8,25,38,.92)';
			button.style.color = '#d9f7ff';
			button.style.cursor = 'pointer';
		}

		this.panel.querySelector<HTMLButtonElement>('[data-pause]')
			?.addEventListener('click', () => {
				this.paused = !this.paused;
				this.renderPanel();
			});

		for (const button of this.panel.querySelectorAll<HTMLButtonElement>('[data-time]')) {
			button.addEventListener('click', () => {
				this.timeScale = Number(button.dataset.time ?? 1);
				this.renderPanel();
			});
		}

		this.panel.querySelector<HTMLButtonElement>('[data-reset]')
			?.addEventListener('click', () => {
				if (this.activeScene?.reset) {
					void this.activeScene.reset();
				} else if (this.activeRegistration) {
					void this.openScene(this.activeRegistration.id);
				}
			});

		const sceneUiMount = this.panel.querySelector<HTMLElement>('[data-scene-ui]');
		const statusMount = this.panel.querySelector<HTMLElement>('[data-status-root]');

		this.sceneUiRoot.replaceChildren();
		this.statusRoot.replaceChildren();
		sceneUiMount?.appendChild(this.sceneUiRoot);
		statusMount?.appendChild(this.statusRoot);
		this.renderStatus();
	}

	private async openScene(id: string): Promise<void> {
		const registration = getFeatureTestRegistration(id);

		if (!registration) {
			return;
		}

		if (this.activeRegistration?.id === 'planet-lod' && id !== 'planet-lod') {
			this.planetApproachCamera.restore();
		}

		this.activeScene?.dispose();
		this.activeScene = null;
		this.group.clear();
		this.sceneUiRoot.replaceChildren();
		this.statusEntries = [];
		this.activeRegistration = registration;
		this.renderNav();
		this.renderPanel();

		const scene = registration.create();
		this.activeScene = scene;
		await scene.init(this.createContext());

		if (id === 'planet-lod' && this.planetApproachCameraEnabled) {
			this.statusEntries.push({
				status: 'info',
				label: 'approach camera profile',
				detail: 'single camera / FOV 46° → 34° → 48°',
			});
			this.renderStatus();
		}
	}

	private createContext(): FeatureTestContext {
		return {
			scene: this.group as unknown as THREE.Scene,
			camera: this.options.camera,
			controls: this.options.controls,
			renderer: this.options.renderer,
			rendererMode: this.options.rendererMode,
			postProcessing: this.options.postProcessing,
			settings: this.options.settingsStore.getSnapshot(),
			updateSettings: (patch) => this.options.settingsStore.update(patch),
			uiRoot: this.sceneUiRoot,
			report: (entry) => {
				this.statusEntries.push(entry);
				this.renderStatus();
			},
			clearReport: () => {
				this.statusEntries = [];
				this.renderStatus();
			},
		};
	}

	private renderStatus(): void {
		if (this.statusEntries.length === 0) {
			this.statusRoot.innerHTML = '<div style="opacity:.62">No checks reported.</div>';
			return;
		}

		this.statusRoot.innerHTML = this.statusEntries.map((entry) => {
			const color =
				entry.status === 'pass'
					? '#77ffb0'
					: entry.status === 'warn'
						? '#ffd28f'
						: entry.status === 'fail'
							? '#ff7f8a'
							: '#8fe7ff';

			return (
				`<div style="margin:4px 0;">` +
				`<span style="color:${color};font-weight:bold;">${entry.status.toUpperCase()}</span> ` +
				`${entry.label}${entry.detail ? `<div style="opacity:.62;margin-left:42px;">${entry.detail}</div>` : ''}` +
				`</div>`
			);
		}).join('');
	}
}
