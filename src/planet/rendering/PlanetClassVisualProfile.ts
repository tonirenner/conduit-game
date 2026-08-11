import * as THREE from 'three';

import type { SurfacePaletteKind } from './SurfaceRenderProfile';

export type PlanetClassVisualProfile = {
	nightAlbedo: number;
	ambientBoost: number;
	directLightScale: number;
	shadowFill: number;
	visibilityFloor: number;
	visibilityFillColor: THREE.Color;
	environmentReflection: number;
	environmentPeak: number;
};

const DEFAULT_VISUAL_PROFILE: PlanetClassVisualProfile = {
	nightAlbedo: 0.28,
	ambientBoost: 0.00,
	directLightScale: 1.08,
	shadowFill: 0.08,
	visibilityFloor: 0.04,
	visibilityFillColor: new THREE.Color(0x4a463d),
	environmentReflection: 0.12,
	environmentPeak: 0.0,
};

const VISUAL_PROFILES: Partial<Record<SurfacePaletteKind, PlanetClassVisualProfile>> = {
	barren: {
		nightAlbedo: 0.58,
		ambientBoost: 0.14,
		directLightScale: 1.18,
		shadowFill: 0.20,
		visibilityFloor: 0.18,
		visibilityFillColor: new THREE.Color(0x7a694f),
		environmentReflection: 0.10,
		environmentPeak: 0.0,
	},
	rocky: {
		nightAlbedo: 0.78,
		ambientBoost: 0.22,
		directLightScale: 1.18,
		shadowFill: 0.30,
		visibilityFloor: 0.28,
		visibilityFillColor: new THREE.Color(0x827b6b),
		environmentReflection: 0.14,
		environmentPeak: 0.0,
	},
	carbon: {
		nightAlbedo: 0.98,
		ambientBoost: 0.42,
		directLightScale: 1.20,
		shadowFill: 0.56,
		visibilityFloor: 0.52,
		visibilityFillColor: new THREE.Color(0x6f6659),
		environmentReflection: 0.08,
		environmentPeak: 0.0,
	},
	metallic: {
		nightAlbedo: 1.18,
		ambientBoost: 0.56,
		directLightScale: 1.02,
		shadowFill: 0.82,
		visibilityFloor: 0.74,
		visibilityFillColor: new THREE.Color(0x89877b),
		environmentReflection: 0.12,
		environmentPeak: 0.10,
	},
	desert: {
		nightAlbedo: 0.48,
		ambientBoost: 0.08,
		directLightScale: 1.26,
		shadowFill: 0.16,
		visibilityFloor: 0.13,
		visibilityFillColor: new THREE.Color(0x80502d),
		environmentReflection: 0.06,
		environmentPeak: 0.0,
	},
	oceanic: {
		nightAlbedo: 0.20,
		ambientBoost: 0.00,
		directLightScale: 1.08,
		shadowFill: 0.08,
		visibilityFloor: 0.0,
		visibilityFillColor: new THREE.Color(0x12384a),
		environmentReflection: 0.72,
		environmentPeak: 0.86,
	},
	earthlike: {
		nightAlbedo: 0.30,
		ambientBoost: 0.02,
		directLightScale: 1.10,
		shadowFill: 0.10,
		visibilityFloor: 0.0,
		visibilityFillColor: new THREE.Color(0x243c36),
		environmentReflection: 0.18,
		environmentPeak: 0.12,
	},
	ice: {
		nightAlbedo: 0.18,
		ambientBoost: 0.0,
		directLightScale: 1.14,
		shadowFill: 0.08,
		visibilityFloor: 0.0,
		visibilityFillColor: new THREE.Color(0x143e58),
		environmentReflection: 0.26,
		environmentPeak: 0.0,
	},
	lava: {
		nightAlbedo: 0.34,
		ambientBoost: 0.0,
		directLightScale: 0.92,
		shadowFill: 0.0,
		visibilityFloor: 0.0,
		visibilityFillColor: new THREE.Color(0x35160d),
		environmentReflection: 0.0,
		environmentPeak: 0.0,
	},
	toxic: {
		nightAlbedo: 0.28,
		ambientBoost: 0.0,
		directLightScale: 1.04,
		shadowFill: 0.10,
		visibilityFloor: 0.0,
		visibilityFillColor: new THREE.Color(0x526f68),
		environmentReflection: 0.12,
		environmentPeak: 0.0,
	},
};

export function getPlanetClassVisualProfile(
	palette: SurfacePaletteKind,
): PlanetClassVisualProfile {
	return VISUAL_PROFILES[palette] ?? DEFAULT_VISUAL_PROFILE;
}
