export type PlanetRenderQuality = 'moving' | 'idle';

export type PlanetRaymarchStepProfile = {
	moving: number;
	idle: number;
};

export type PlanetRenderFeatures = {
	raymarchedClouds: boolean;
	raymarchedAtmosphere: boolean;
	raymarchedSurface: boolean;
	moonSystem: boolean;
	nearSurfaceTerrain: boolean;
	gasCloudParticles: boolean;

	cloudSteps: PlanetRaymarchStepProfile;
	atmosphereSteps: PlanetRaymarchStepProfile;
	surfaceSteps: PlanetRaymarchStepProfile;
};

export const DEFAULT_PLANET_RENDER_FEATURES: PlanetRenderFeatures = {
	raymarchedClouds: true,
	raymarchedAtmosphere: true,
	raymarchedSurface: true,
	moonSystem: true,
	nearSurfaceTerrain: true,
	gasCloudParticles: false,

	/**
	 * Phase 8b:
	 * More raymarching budget in idle mode.
	 *
	 * Moving stays conservative, because camera motion hides detail anyway.
	 */
	cloudSteps: {
		moving: 10,
		idle: 24,
	},

	atmosphereSteps: {
		moving: 8,
		idle: 16,
	},

	surfaceSteps: {
		moving: 3,
		idle: 10,
	},
};

export function mergePlanetRenderFeatures(
	features?: Partial<PlanetRenderFeatures>,
): PlanetRenderFeatures {
	return {
		...DEFAULT_PLANET_RENDER_FEATURES,
		...features,
		cloudSteps: {
			...DEFAULT_PLANET_RENDER_FEATURES.cloudSteps,
			...features?.cloudSteps,
		},
		atmosphereSteps: {
			...DEFAULT_PLANET_RENDER_FEATURES.atmosphereSteps,
			...features?.atmosphereSteps,
		},
		surfaceSteps: {
			...DEFAULT_PLANET_RENDER_FEATURES.surfaceSteps,
			...features?.surfaceSteps,
		},
	};
}
