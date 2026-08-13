import type { PlanetClass } from '@conduit/planet';
import { clamp01, lerp } from '../internal/ProceduralMath';

export type AtmosphereRenderProfileValues = {
	density: number;
	haze: number;
	color: string;
	palette: string;
};

export type LavaAtmosphereVisualProfile = {
	tint: string;
	sunIntensityScale: number;
	atmosphereAlphaScale: number;
	scatteringBoostScale: number;
	opacityScale: number;
	alphaAttenuation: number;
	cyanRimScale: number;
	deepRimScale: number;
	horizonLineScale: number;
	warmSunHazeScale: number;
	backScatterScale: number;
	mieDiscScale: number;
	rimStrength: number;
	tintMix: number;
};

export type AtmosphereLayerProfile = {
	tint: string;
	lavaMix: number;
	sunIntensity: number;
	atmosphereAlpha: number;
	scatteringBoost: number;
	opacity: number;
};

export const LAVA_ATMOSPHERE_VISUAL_PROFILE: LavaAtmosphereVisualProfile = {
	tint: '#ff3a16',
	sunIntensityScale: 1.04,
	atmosphereAlphaScale: 1.12,
	scatteringBoostScale: 1.18,
	opacityScale: 1.00,
	alphaAttenuation: 0.74,
	cyanRimScale: 0.56,
	deepRimScale: 0.20,
	horizonLineScale: 0.42,
	warmSunHazeScale: 0.38,
	backScatterScale: 0.18,
	mieDiscScale: 0.26,
	rimStrength: 0.54,
	tintMix: 0.90,
};

export function createAtmosphereRenderProfileValues(
	planetClass: PlanetClass | undefined,
	input: AtmosphereRenderProfileValues,
): AtmosphereRenderProfileValues {
	switch (planetClass) {
		case 'barren':
			return {
				...input,
				density: input.density * 0.28,
				haze: input.haze * 0.22,
			};

		case 'metal_rich':
			return {
				...input,
				density: input.density * 0.18,
				haze: input.haze * 0.14,
			};

		case 'rocky':
			return {
				...input,
				density: input.density * 0.42,
				haze: input.haze * 0.32,
			};

		case 'carbon':
			return {
				...input,
				density: input.density * 0.34,
				haze: input.haze * 0.26,
			};

		case 'desert':
			return {
				...input,
				density: input.density * 0.68,
				haze: input.haze * 0.58,
			};

		case 'lava':
			return {
				density: Math.max(
					0.36,
					input.density * 0.92,
				),
				haze: Math.max(
					0.44,
					input.haze * 1.08,
				),
				color: LAVA_ATMOSPHERE_VISUAL_PROFILE.tint,
				palette: 'lava',
			};

		default:
			return input;
	}
}

export function isLavaAtmosphereProfile(
	atmosphereColor: string,
	atmospherePalette: string,
): boolean {
	const normalizedColor = atmosphereColor.toLowerCase();

	return atmospherePalette === 'lava' ||
		atmospherePalette === 'ash_clouds' ||
		normalizedColor === '#d65a32' ||
		normalizedColor === '#b66f48' ||
		normalizedColor === LAVA_ATMOSPHERE_VISUAL_PROFILE.tint;
}

export function createAtmosphereLayerProfile(
	density: number,
	haze: number,
	atmosphereColor: string,
	atmospherePalette: string,
): AtmosphereLayerProfile {
	const atmosphereStrength = Math.max(
		clamp01(density / 2.5),
		clamp01(haze),
	);
	const isLava = isLavaAtmosphereProfile(
		atmosphereColor,
		atmospherePalette,
	);
	const lavaScale = isLava ? LAVA_ATMOSPHERE_VISUAL_PROFILE : null;

	return {
		tint: isLava
			? LAVA_ATMOSPHERE_VISUAL_PROFILE.tint
			: atmosphereColor,
		lavaMix: isLava ? 1.0 : 0.0,
		sunIntensity: lerp(30.0, 54.0, atmosphereStrength) *
			(lavaScale?.sunIntensityScale ?? 1.0),
		atmosphereAlpha: lerp(0.22, 0.92, atmosphereStrength) *
			(lavaScale?.atmosphereAlphaScale ?? 1.0),
		scatteringBoost: lerp(0.35, 1.18, atmosphereStrength) *
			(lavaScale?.scatteringBoostScale ?? 1.0),
		opacity: lerp(0.24, 0.64, atmosphereStrength) *
			(lavaScale?.opacityScale ?? 1.0),
	};
}
