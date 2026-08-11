import type {
	EffectsQuality,
	GameSettings,
	SettingsStore,
} from '../settings/GameSettings';
import type { RendererMode } from '@conduit/web3d/renderer';

export type SettingsMenuOptions = {
	store: SettingsStore;
	activeRendererMode: RendererMode;
	onSettingsChanged?: (settings: GameSettings) => void;
};

const QUALITY_OPTIONS: EffectsQuality[] = [
	'low',
	'medium',
	'high',
	'ultra',
];

export class SettingsMenu {
	private readonly root = document.createElement('div');
	private readonly button = document.createElement('button');
	private readonly panel = document.createElement('div');
	private open = false;
	private settings: GameSettings;
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly options: SettingsMenuOptions,
	) {
		this.settings = options.store.getSnapshot();
		this.configureButton();
		this.configurePanel();
		this.configureRoot();

		document.body.appendChild(this.root);

		this.unsubscribe = options.store.subscribe((settings) => {
			this.settings = settings;
			this.render();
			this.options.onSettingsChanged?.(settings);
		});
	}

	dispose(): void {
		this.unsubscribe?.();
		this.root.remove();
	}

	private configureRoot(): void {
		this.root.style.position = 'fixed';
		this.root.style.top = '14px';
		this.root.style.right = '14px';
		this.root.style.zIndex = '80';
		this.root.style.font = '12px/1.35 monospace';
		this.root.style.color = '#d9f7ff';
		this.root.append(this.button, this.panel);
	}

	private configureButton(): void {
		this.button.type = 'button';
		this.button.innerHTML =
			`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
			`<path fill="currentColor" d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a7.9 7.9 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.9 7.9 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5A9.9 9.9 0 0 0 4.5 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.9 7.9 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.9 7.9 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/>` +
			`</svg>`;
		this.button.title = 'Settings';
		this.button.style.width = '34px';
		this.button.style.height = '34px';
		this.button.style.border = '1px solid rgba(143,231,255,0.42)';
		this.button.style.borderRadius = '6px';
		this.button.style.background = 'rgba(3, 13, 22, 0.82)';
		this.button.style.color = '#aef0ff';
		this.button.style.font = '18px/1 monospace';
		this.button.style.cursor = 'pointer';
		this.button.style.backdropFilter = 'blur(8px)';
		this.button.addEventListener('click', () => {
			this.open = !this.open;
			this.render();
		});
	}

	private configurePanel(): void {
		this.panel.style.position = 'absolute';
		this.panel.style.top = '42px';
		this.panel.style.right = '0';
		this.panel.style.width = '310px';
		this.panel.style.maxWidth = 'calc(100vw - 28px)';
		this.panel.style.maxHeight = 'calc(100vh - 70px)';
		this.panel.style.overflow = 'auto';
		this.panel.style.padding = '12px';
		this.panel.style.border = '1px solid rgba(143,231,255,0.34)';
		this.panel.style.borderRadius = '8px';
		this.panel.style.background = 'rgba(3, 11, 18, 0.94)';
		this.panel.style.boxShadow = '0 12px 36px rgba(0,0,0,0.42)';
		this.panel.style.backdropFilter = 'blur(10px)';
		this.panel.style.display = 'none';
	}

	private render(): void {
		this.panel.style.display = this.open ? 'block' : 'none';

		if (!this.open) {
			return;
		}

		const rendererChanged =
			this.settings.renderer !== this.options.activeRendererMode;

		this.panel.innerHTML =
			this.renderHeader(rendererChanged) +
			this.renderSection(
				'GRAPHICS',
				this.renderSelect('renderer', 'Renderer', [
					['webgpu', 'WebGPU'],
					['webgl', 'WebGL Fallback'],
				]) +
				this.renderSelect('graphicsQuality', 'Quality', qualityPairs()) +
				this.renderRange('renderScale', 'Render Scale', 0.5, 2, 0.05) +
				this.renderSelect('shadowQuality', 'Shadow Quality', qualityPairs()) +
				this.renderSelect('planetQuality', 'Planet Quality', qualityPairs()) +
				this.renderSelect('effectsQuality', 'Effects Quality', qualityPairs()) +
				this.renderToggle('gtao', 'GTAO') +
				this.renderToggle('ssr', 'SSR') +
				this.renderToggle('bloom', 'Bloom'),
			) +
			this.renderSection(
				'UI',
				this.renderToggle('hud', 'HUD') +
				this.renderToggle('minimap', 'Minimap') +
				this.renderRange('uiScale', 'UI Scale', 0.8, 1.4, 0.05),
			) +
			this.renderSection(
				'GAME',
				`<div style="opacity:.62">Gameplay options will live here.</div>`,
			) +
			this.renderSection(
				'DEVELOPER',
				`<a href="?view=test" style="color:#8fe7ff">Open Feature Lab</a><br>` +
				`<a href="?view=planet" style="color:#8fe7ff">Open Planet Viewer</a>`,
			) +
			`<button data-reset-settings style="${buttonStyle()}width:100%;margin-top:10px;">Reset Settings</button>`;

		this.bindPanelInputs();
	}

	private renderHeader(rendererChanged: boolean): string {
		const reloadNote = rendererChanged
			? `<div style="margin-top:6px;color:#ffd28f">Reload required for renderer changes.</div>`
			: '';

		return (
			`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">` +
			`<b style="color:#8fe7ff">SETTINGS</b>` +
			`<button data-close-settings style="border:0;background:transparent;color:#d9f7ff;cursor:pointer;font:16px monospace">x</button>` +
			`</div>` +
			reloadNote
		);
	}

	private renderSection(title: string, body: string): string {
		return (
			`<section style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(143,231,255,.16);">` +
			`<div style="margin-bottom:8px;color:#8fe7ff;font-weight:bold">${title}</div>` +
			body +
			`</section>`
		);
	}

	private renderSelect(
		key: keyof GameSettings,
		label: string,
		options: Array<[string, string]>,
	): string {
		const current = String(this.settings[key]);

		return (
			`<label style="${rowStyle()}">` +
			`<span>${label}</span>` +
			`<select data-setting="${key}" style="${controlStyle()}">` +
			options.map(([value, text]) => (
				`<option value="${value}"${value === current ? ' selected' : ''}>${text}</option>`
			)).join('') +
			`</select>` +
			`</label>`
		);
	}

	private renderToggle(
		key: keyof GameSettings,
		label: string,
	): string {
		const checked = this.settings[key] ? ' checked' : '';

		return (
			`<label style="${rowStyle()}">` +
			`<span>${label}</span>` +
			`<input data-setting="${key}" type="checkbox"${checked}>` +
			`</label>`
		);
	}

	private renderRange(
		key: keyof GameSettings,
		label: string,
		min: number,
		max: number,
		step: number,
	): string {
		const value = Number(this.settings[key]);

		return (
			`<label style="${rowStyle()}">` +
			`<span>${label} ${value.toFixed(2)}</span>` +
			`<input data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="width:132px;">` +
			`</label>`
		);
	}

	private bindPanelInputs(): void {
		this.panel.querySelector<HTMLButtonElement>('[data-close-settings]')
			?.addEventListener('click', () => {
				this.open = false;
				this.render();
			});

		this.panel.querySelector<HTMLButtonElement>('[data-reset-settings]')
			?.addEventListener('click', () => {
				this.options.store.reset();
			});

		for (const input of this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
			input.addEventListener('change', () => {
				const key = input.dataset.setting as keyof GameSettings | undefined;

				if (!key) {
					return;
				}

				this.options.store.update({
					[key]: readInputValue(input),
				} as Partial<GameSettings>);
			});
		}
	}
}

function qualityPairs(): Array<[string, string]> {
	return QUALITY_OPTIONS.map((quality) => [
		quality,
		quality[0].toUpperCase() + quality.slice(1),
	]);
}

function readInputValue(input: HTMLInputElement | HTMLSelectElement): string | number | boolean {
	if (input instanceof HTMLInputElement && input.type === 'checkbox') {
		return input.checked;
	}

	if (input instanceof HTMLInputElement && input.type === 'range') {
		return Number(input.value);
	}

	return input.value;
}

function rowStyle(): string {
	return 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:7px 0;';
}

function controlStyle(): string {
	return 'min-width:132px;background:rgba(8,25,38,.92);color:#d9f7ff;border:1px solid rgba(143,231,255,.28);border-radius:4px;padding:4px;';
}

function buttonStyle(): string {
	return 'border:1px solid rgba(143,231,255,.34);border-radius:6px;background:rgba(8,25,38,.92);color:#d9f7ff;padding:8px;cursor:pointer;';
}
