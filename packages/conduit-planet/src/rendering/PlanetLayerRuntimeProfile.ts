import type { PlanetDefinition } from '../model';
import type { PlanetRenderProfile } from './PlanetRenderProfile';

export type PlanetRingLayerRuntimeProfile = {
	enabled: boolean;
	seed: number;
};

/**
 * Resolve runtime ring ownership from the derived render profile while keeping
 * a definition fallback for legacy Planet construction without a profile.
 */
export function getPlanetRingLayerRuntimeProfile(
	definition: PlanetDefinition,
	renderProfile: PlanetRenderProfile | null,
): PlanetRingLayerRuntimeProfile {
	return {
		enabled:
			renderProfile?.enableRings ??
			(definition.rings?.enabled ?? false),
		seed: definition.render.ringSeed,
	};
}

/**
 * MoonSystemLayer currently owns a lightweight procedural representation rather
 * than rendering PlanetMoonDefinition entries directly. Preserve its existing
 * deterministic system seed explicitly instead of probing an undeclared
 * render.moonSeed field.
 */
export function getPlanetMoonSystemSeed(definition: PlanetDefinition): number {
	return (definition.seed ^ 0x4411aa) >>> 0;
}
