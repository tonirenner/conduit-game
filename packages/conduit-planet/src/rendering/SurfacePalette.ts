import type { PlanetClass } from '@conduit/planet/model';

export type SurfacePaletteKind =
	| 'barren'
	| 'rocky'
	| 'earthlike'
	| 'oceanic'
	| 'ice'
	| 'desert'
	| 'lava'
	| 'toxic'
	| 'metallic'
	| 'carbon'
	| 'gas_bands';

/**
 * Canonical class -> broad surface palette mapping used by render profiles.
 * Concrete renderers may add representation-specific detail, but should not
 * reinterpret the planet class into a second independent palette identity.
 */
export function resolveSurfacePalette(
	planetClass: PlanetClass,
): SurfacePaletteKind {
	switch (planetClass) {
		case 'terrestrial': return 'earthlike';
		case 'ocean': return 'oceanic';
		case 'ice':
		case 'ice_giant': return 'ice';
		case 'desert': return 'desert';
		case 'lava': return 'lava';
		case 'toxic': return 'toxic';
		case 'metal_rich': return 'metallic';
		case 'carbon': return 'carbon';
		case 'gas_giant': return 'gas_bands';
		case 'barren': return 'barren';
		case 'rocky':
		default: return 'rocky';
	}
}
