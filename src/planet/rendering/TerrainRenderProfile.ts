import type {TerrainProfileKind} from '../../utils/noise';
import type {PlanetClass} from '../model/PlanetDefinition';

export function resolveTerrainProfileKind(
	planetClass: PlanetClass | string | undefined,
): TerrainProfileKind {
	switch (planetClass) {
		case 'ocean':
			return 'oceanic';

		case 'ice':
			return 'ice';

		case 'desert':
			return 'desert';

		case 'lava':
			return 'lava';

		case 'barren':
			return 'barren';

		case 'rocky':
			return 'rocky';

		case 'toxic':
			return 'toxic';

		case 'carbon':
			return 'carbon';

		case 'metal_rich':
			return 'metallic';

		case 'terrestrial':
		default:
			return 'earthlike';
	}
}
