import type {PlanetRenderTuning} from '../planet/Planet';
import type {PlanetClass} from '../planet/model/PlanetDefinition';

export type RenderTuningPanelOptions = {
	initialTuning: PlanetRenderTuning;
	getSeed: () => number;
	getClass: () => string;
	getRendererMode: () => string;
	onTuningChange: (tuning: Partial<PlanetRenderTuning>) => void;
	onClassChange: (planetClass: PlanetClass | 'auto') => void;
	onSeedChange: (seed: number) => void;
};

type SliderDefinition = {
	key: keyof PlanetRenderTuning;
	label: string;
	min: number;
	max: number;
	step: number;
};

const SLIDERS: SliderDefinition[] = [
	{
		key: 'ambient',
		label: 'Ambient',
		min: 0.12,
		max: 0.90,
		step: 0.01,
	},
	{
		key: 'exposureScale',
		label: 'Exposure',
		min: 0.45,
		max: 1.85,
		step: 0.01,
	},
	{
		key: 'horizonGlowScale',
		label: 'Horizon',
		min: 0.20,
		max: 1.80,
		step: 0.01,
	},
	{
		key: 'surfaceDetailStrength',
		label: 'Detail',
		min: 0.00,
		max: 1.40,
		step: 0.01,
	},
	{
		key: 'proceduralColorStrength',
		label: 'Color Mix',
		min: 0.00,
		max: 1.20,
		step: 0.01,
	},
	{
		key: 'surfaceTextureStrength',
		label: 'Texture',
		min: 0.00,
		max: 1.40,
		step: 0.01,
	},
	{
		key: 'bakedTerrainBlend',
		label: 'Bake Blend',
		min: 0.00,
		max: 1.00,
		step: 0.01,
	},
];

const PLANET_CLASSES: Array<PlanetClass | 'auto'> = [
	'auto',
	'ocean',
	'terrestrial',
	'desert',
	'ice',
	'lava',
	'toxic',
	'carbon',
	'metal_rich',
	'barren',
	'rocky',
];

export class RenderTuningPanel {
	private readonly root: HTMLDivElement;
	private readonly values = new Map<keyof PlanetRenderTuning, HTMLSpanElement>();
	private readonly inputs = new Map<keyof PlanetRenderTuning, HTMLInputElement>();
	private tuning: PlanetRenderTuning;

	constructor(
		private readonly options: RenderTuningPanelOptions,
	) {
		this.tuning = {
			...options.initialTuning,
		};

		this.root = document.createElement('div');
		this.root.style.position = 'fixed';
		this.root.style.right = '12px';
		this.root.style.top = '12px';
		this.root.style.zIndex = '10000';
		this.root.style.width = '280px';
		this.root.style.padding = '10px';
		this.root.style.boxSizing = 'border-box';
		this.root.style.fontFamily = 'system-ui, sans-serif';
		this.root.style.fontSize = '12px';
		this.root.style.lineHeight = '1.25';
		this.root.style.color = '#e6f2ff';
		this.root.style.background = 'rgba(4, 8, 14, 0.78)';
		this.root.style.border = '1px solid rgba(130, 180, 230, 0.34)';
		this.root.style.borderRadius = '6px';
		this.root.style.backdropFilter = 'blur(6px)';

		this.render();
		document.body.appendChild(this.root);
	}

	updateTuning(tuning: PlanetRenderTuning): void {
		this.tuning = {
			...tuning,
		};

		for (const slider of SLIDERS) {
			const input = this.inputs.get(slider.key);
			const value = this.values.get(slider.key);

			if (!input || !value) {
				continue;
			}

			input.value = String(this.tuning[slider.key]);
			value.textContent = this.tuning[slider.key].toFixed(2);
		}
	}

	updateMeta(): void {
		const meta = this.root.querySelector<HTMLDivElement>('[data-meta]');

		if (!meta) {
			return;
		}

		meta.textContent =
			`${this.options.getRendererMode().toUpperCase()} | ` +
			`${this.options.getClass()} | seed ${this.options.getSeed()}`;
	}

	dispose(): void {
		this.root.remove();
	}

	private render(): void {
		this.root.textContent = '';

		const title = document.createElement('div');
		title.textContent = 'Render Tuning';
		title.style.fontWeight = '700';
		title.style.marginBottom = '4px';
		this.root.appendChild(title);

		const meta = document.createElement('div');
		meta.dataset.meta = '1';
		meta.style.color = '#9fc3e8';
		meta.style.marginBottom = '10px';
		this.root.appendChild(meta);

		for (const slider of SLIDERS) {
			this.root.appendChild(this.createSlider(slider));
		}

		const actions = document.createElement('div');
		actions.style.display = 'grid';
		actions.style.gridTemplateColumns = '1fr 1fr';
		actions.style.gap = '6px';
		actions.style.marginTop = '10px';

		actions.appendChild(this.createButton('Reset', () => {
			this.updateTuning(this.options.initialTuning);
			this.options.onTuningChange(this.tuning);
		}));

		actions.appendChild(this.createButton('Random Seed', () => {
			this.options.onSeedChange(Math.floor(Math.random() * 2_000_000_000) + 1);
		}));

		this.root.appendChild(actions);

		const classGrid = document.createElement('div');
		classGrid.style.display = 'grid';
		classGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
		classGrid.style.gap = '5px';
		classGrid.style.marginTop = '10px';

		for (const planetClass of PLANET_CLASSES) {
			classGrid.appendChild(this.createButton(planetClass, () => {
				this.options.onClassChange(planetClass);
			}));
		}

		this.root.appendChild(classGrid);
		this.updateMeta();
	}

	private createSlider(
		slider: SliderDefinition,
	): HTMLLabelElement {
		const row = document.createElement('label');
		row.style.display = 'grid';
		row.style.gridTemplateColumns = '72px 1fr 38px';
		row.style.alignItems = 'center';
		row.style.gap = '8px';
		row.style.margin = '6px 0';

		const label = document.createElement('span');
		label.textContent = slider.label;

		const input = document.createElement('input');
		input.type = 'range';
		input.min = String(slider.min);
		input.max = String(slider.max);
		input.step = String(slider.step);
		input.value = String(this.tuning[slider.key]);

		const value = document.createElement('span');
		value.textContent = this.tuning[slider.key].toFixed(2);
		value.style.textAlign = 'right';
		value.style.fontVariantNumeric = 'tabular-nums';

		input.addEventListener('input', () => {
			this.tuning[slider.key] = Number(input.value);
			value.textContent = this.tuning[slider.key].toFixed(2);
			this.options.onTuningChange({
				[slider.key]: this.tuning[slider.key],
			} as Partial<PlanetRenderTuning>);
		});

		this.values.set(slider.key, value);
		this.inputs.set(slider.key, input);

		row.appendChild(label);
		row.appendChild(input);
		row.appendChild(value);

		return row;
	}

	private createButton(
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = label;
		button.style.minHeight = '28px';
		button.style.border = '1px solid rgba(130, 180, 230, 0.34)';
		button.style.borderRadius = '5px';
		button.style.color = '#e6f2ff';
		button.style.background = 'rgba(255, 255, 255, 0.08)';
		button.style.cursor = 'pointer';

		button.addEventListener('click', onClick);

		return button;
	}
}
