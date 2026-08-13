export type PlanetMaterialKey =
	| 'rock'
	| 'metal'
	| 'ice'
	| 'water'
	| 'gas'
	| 'organic'
	| 'volatiles';

export type PlanetMaterialComposition = Record<PlanetMaterialKey, number>;

export function normalizeComposition(
	composition: PlanetMaterialComposition,
): PlanetMaterialComposition {
	const sum =
		composition.rock +
		composition.metal +
		composition.ice +
		composition.water +
		composition.gas +
		composition.organic +
		composition.volatiles;

	if (sum <= 0) {
		return {
			rock: 1,
			metal: 0,
			ice: 0,
			water: 0,
			gas: 0,
			organic: 0,
			volatiles: 0,
		};
	}

	return {
		rock: composition.rock / sum,
		metal: composition.metal / sum,
		ice: composition.ice / sum,
		water: composition.water / sum,
		gas: composition.gas / sum,
		organic: composition.organic / sum,
		volatiles: composition.volatiles / sum,
	};
}
