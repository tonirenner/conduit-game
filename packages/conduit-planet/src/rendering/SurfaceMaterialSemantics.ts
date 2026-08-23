import type { PlanetDefinition } from '../model';

export type SurfaceMaterialSemantics = {
	waterInfluence: number;
	iceInfluence: number;
	lavaInfluence: number;
	toxicInfluence: number;
	metalInfluence: number;
	rockInfluence: number;
	organicInfluence: number;
};

/**
 * Canonical derived material semantics for solid planetary surfaces.
 *
 * PlanetDefinition remains domain truth. Render profiles and concrete renderers
 * consume this derived layer instead of independently reinterpreting
 * composition/class/surface flags.
 */
export function createSurfaceMaterialSemantics(
	planet: PlanetDefinition,
): SurfaceMaterialSemantics {
	const planetClass = planet.class;

	return {
		waterInfluence: clamp01(
			planetClass === 'toxic'
				? 0
				: planet.composition.water * (planet.surface.hasOcean ? 1 : 0.35),
		),
		iceInfluence: clamp01(
			planetClass === 'ice'
				? 1
				: planet.composition.ice + (planet.surface.hasIceCaps ? 0.25 : 0),
		),
		lavaInfluence:
			planetClass === 'lava' || planet.surface.hasVolcanism ? 1 : 0,
		toxicInfluence: clamp01(
			planetClass === 'toxic' ? 1 : planet.composition.volatiles,
		),
		metalInfluence: clamp01(
			planetClass === 'metal_rich' ? 1 : planet.composition.metal,
		),
		rockInfluence: clamp01(planet.composition.rock),
		organicInfluence:
			planetClass === 'carbon'
				? clamp01(planet.composition.organic)
				: 0,
	};
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
