import type { PlanetClass } from '../model/PlanetDefinition';
import type { PlanetMaterialComposition } from '../model/PlanetComposition';

/**
 * Phase 6b.6:
 *
 * More conservative PlanetClass resolution.
 *
 * Goal:
 * Do not call a planet "barren" when the composition clearly supports
 * water/ocean/ice/atmosphere-adjacent worlds.
 */
export function resolvePlanetClass(
	composition: PlanetMaterialComposition,
	temperature: number,
): PlanetClass {
	const solidMaterial =
		      composition.rock +
		      composition.metal +
		      composition.ice;

	const liquidPotential =
		      composition.water +
		      composition.volatiles * 0.35;

	const atmospherePotential =
		      composition.gas +
		      composition.volatiles * 0.70 +
		      composition.water * 0.20;

	const hot = temperature > 650;
	const warm = temperature > 310;
	const habitableBand =
		      temperature >= 235 &&
		      temperature <= 325;

	const cold = temperature < 220;
	const frozen = temperature < 180;

	if (composition.gas >= 0.62) {
		if (composition.ice + composition.volatiles >= 0.18) {
			return 'ice_giant';
		}

		return 'gas_giant';
	}

	if (hot && composition.rock + composition.metal >= 0.45) {
		return 'lava';
	}

	if (
		composition.ice >= 0.40 ||
		(frozen && composition.ice >= 0.18)
	) {
		return 'ice';
	}

	/**
	 * Water worlds must win before barren/rocky.
	 *
	 * A planet with 30%+ water is not barren, even with thin atmosphere.
	 */
	if (
		composition.water >= 0.30 &&
		solidMaterial >= 0.34
	) {
		if (cold && composition.ice >= 0.12) {
			return 'ice';
		}

		return 'ocean';
	}

	if (
		composition.water >= 0.18 &&
		habitableBand &&
		atmospherePotential >= 0.05
	) {
		return 'terrestrial';
	}

	if (
		composition.water >= 0.12 &&
		atmospherePotential >= 0.08 &&
		!warm
	) {
		return 'terrestrial';
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
		composition.water < 0.05 &&
		composition.ice < 0.08 &&
		warm
	) {
		return 'desert';
	}

	if (
		composition.water < 0.04 &&
		composition.ice < 0.05 &&
		composition.gas < 0.025 &&
		composition.volatiles < 0.035 &&
		composition.organic < 0.020
	) {
		return 'barren';
	}

	if (composition.rock + composition.metal >= 0.58) {
		return 'rocky';
	}

	if (liquidPotential >= 0.16) {
		return 'terrestrial';
	}

	return 'rocky';
}
