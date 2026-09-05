import type { PostProcessingQuality } from '@conduit/web3d/postprocessing';
import type { RendererMode } from '@conduit/web3d/renderer';

export type EffectsQuality =
	| 'low'
	| 'medium'
	| 'high'
	| 'ultra';

export type GameSettings = {
	renderer: RendererMode;
	graphicsQuality: PostProcessingQuality;
	renderScale: number;
	shadowQuality: EffectsQuality;
	planetQuality: EffectsQuality;
	effectsQuality: EffectsQuality;
	gtao: boolean;
	ssr: boolean;
	bloom: boolean;
	hud: boolean;
	minimap: boolean;
	fps: boolean;
	uiScale: number;
};

export type SettingsRepository = {
	load: () => GameSettings;
	save: (settings: GameSettings) => void;
	reset: () => GameSettings;
};

export type SettingsListener = (settings: GameSettings) => void;

const SETTINGS_STORAGE_KEY = 'webgl-planet-model.settings.v1';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
	renderer: 'webgl',
	graphicsQuality: 'high',
	renderScale: 1,
	shadowQuality: 'medium',
	planetQuality: 'high',
	effectsQuality: 'high',
	gtao: true,
	ssr: true,
	bloom: true,
	hud: true,
	minimap: true,
	fps: false,
	uiScale: 1,
};

export class LocalSettingsRepository implements SettingsRepository {
	load(): GameSettings {
		if (typeof window === 'undefined') {
			return { ...DEFAULT_GAME_SETTINGS };
		}

		const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

		if (!raw) {
			return { ...DEFAULT_GAME_SETTINGS };
		}

		try {
			return normalizeSettings(JSON.parse(raw) as Partial<GameSettings>);
		} catch (error) {
			console.warn('Could not parse saved settings. Using defaults.', error);
			return { ...DEFAULT_GAME_SETTINGS };
		}
	}

	save(settings: GameSettings): void {
		if (typeof window === 'undefined') {
			return;
		}

		window.localStorage.setItem(
			SETTINGS_STORAGE_KEY,
			JSON.stringify(settings),
		);
	}

	reset(): GameSettings {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
		}

		return { ...DEFAULT_GAME_SETTINGS };
	}
}

export class SettingsStore {
	private settings: GameSettings;
	private readonly listeners = new Set<SettingsListener>();

	constructor(
		private readonly repository: SettingsRepository,
	) {
		this.settings = repository.load();
	}

	getSnapshot(): GameSettings {
		return { ...this.settings };
	}

	update(patch: Partial<GameSettings>): GameSettings {
		this.settings = normalizeSettings({
			...this.settings,
			...patch,
		});
		this.repository.save(this.settings);
		this.emit();
		return this.getSnapshot();
	}

	reset(): GameSettings {
		this.settings = this.repository.reset();
		this.emit();
		return this.getSnapshot();
	}

	subscribe(listener: SettingsListener): () => void {
		this.listeners.add(listener);
		listener(this.getSnapshot());

		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		const snapshot = this.getSnapshot();

		for (const listener of this.listeners) {
			listener(snapshot);
		}
	}
}

export function createSettingsStore(): SettingsStore {
	return new SettingsStore(new LocalSettingsRepository());
}

function normalizeSettings(input: Partial<GameSettings>): GameSettings {
	return {
		renderer: input.renderer === 'webgpu' ? 'webgpu' : 'webgl',
		graphicsQuality: normalizeQuality(input.graphicsQuality, 'high'),
		renderScale: clampNumber(input.renderScale, 0.5, 2, 1),
		shadowQuality: normalizeQuality(input.shadowQuality, 'medium'),
		planetQuality: normalizeQuality(input.planetQuality, 'high'),
		effectsQuality: normalizeQuality(input.effectsQuality, 'high'),
		gtao: input.gtao ?? DEFAULT_GAME_SETTINGS.gtao,
		ssr: input.ssr ?? DEFAULT_GAME_SETTINGS.ssr,
		bloom: input.bloom ?? DEFAULT_GAME_SETTINGS.bloom,
		hud: input.hud ?? DEFAULT_GAME_SETTINGS.hud,
		minimap: input.minimap ?? DEFAULT_GAME_SETTINGS.minimap,
		fps: input.fps ?? DEFAULT_GAME_SETTINGS.fps,
		uiScale: clampNumber(input.uiScale, 0.8, 1.4, 1),
	};
}

function normalizeQuality<T extends EffectsQuality>(
	value: unknown,
	fallback: T,
): EffectsQuality {
	if (
		value === 'low' ||
		value === 'medium' ||
		value === 'high' ||
		value === 'ultra'
	) {
		return value;
	}

	return fallback;
}

function clampNumber(
	value: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, value));
}
