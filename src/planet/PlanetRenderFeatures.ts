export type PlanetRenderQuality = 'moving' | 'idle';

export type PlanetRaymarchStepProfile = {
	moving: number;
	idle: number;
};

export type PlanetRenderFeatures = {
	/**
	 * Clouds are the best place for raymarching.
	 *
	 * Default:
	 * - moving: 8 steps
	 * - idle: 16 steps
	 */
	raymarchedClouds: boolean;

	/**
	 * Atmosphere raymarching is expensive and currently experimental in the
	 * WebGPU/TSL path. Keep the feature flag so we can switch between:
	 *
	 * - safe TSL atmosphere
	 * - experimental raymarched atmosphere
	 */
	raymarchedAtmosphere: boolean;

	/**
	 * Surface raymarching is intentionally off by default.
	 *
	 * Surface should first use:
	 * - GPU vertex displacement
	 * - better normals
	 * - WebGL parity shading
	 */
	raymarchedSurface: boolean;

	cloudSteps: PlanetRaymarchStepProfile;
	atmosphereSteps: PlanetRaymarchStepProfile;
	surfaceSteps: PlanetRaymarchStepProfile;
};

export const DEFAULT_PLANET_RENDER_FEATURES: PlanetRenderFeatures = {
	raymarchedClouds: true,
	raymarchedAtmosphere: true,
	raymarchedSurface: false,

	cloudSteps: {
		moving: 8,
		idle: 16,
	},

	atmosphereSteps: {
		moving: 6,
		idle: 12,
	},

	surfaceSteps: {
		moving: 2,
		idle: 6,
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
