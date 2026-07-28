import type { PlanetClass } from '../model/PlanetDefinition';
import type { PlanetMaterialComposition } from '../model/PlanetComposition';

export function resolvePlanetClass(
	composition: PlanetMaterialComposition,
	temperature: number,
): PlanetClass {
	if (composition.gas >= 0.62) {
		if (composition.ice + composition.volatiles >= 0.18) {
			return 'ice_giant';
		}

		return 'gas_giant';
	}

	if (temperature > 650 && composition.rock + composition.metal >= 0.45) {
		return 'lava';
	}

	if (composition.ice >= 0.40 || temperature < 180) {
		return 'ice';
	}

	if (composition.water >= 0.42) {
		return 'ocean';
	}

	if (composition.volatiles >= 0.20) {
		return 'toxic';
	}

	if (composition.metal >= 0.34) {
		return 'metal_rich';
	}

	if (composition.organic >= 0.16) {
		return 'carbon';
	}

	if (
		composition.water >= 0.10 &&
		composition.gas >= 0.025 &&
		temperature >= 235 &&
		temperature <= 325
	) {
		return 'terrestrial';
	}

	if (
		composition.water < 0.05 &&
		composition.ice < 0.08 &&
		temperature > 310
	) {
		return 'desert';
	}

	if (composition.rock + composition.metal >= 0.58) {
		return 'rocky';
	}

	return 'barren';
}
