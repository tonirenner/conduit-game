export type PlanetMaterialKey =
	| 'rock'
	| 'metal'
	| 'ice'
	| 'water'
	| 'gas'
	| 'organic'
	| 'volatiles';

export type PlanetMaterialComposition = Record<PlanetMaterialKey, number>;

export const EMPTY_PLANET_COMPOSITION: PlanetMaterialComposition = {
	rock: 0,
	metal: 0,
	ice: 0,
	water: 0,
	gas: 0,
	organic: 0,
	volatiles: 0,
};

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

export function dominantMaterial(
	composition: PlanetMaterialComposition,
): PlanetMaterialKey {
	let dominant: PlanetMaterialKey = 'rock';
	let dominantValue = composition.rock;

	for (const key of Object.keys(composition) as PlanetMaterialKey[]) {
		if (composition[key] > dominantValue) {
			dominant = key;
			dominantValue = composition[key];
		}
	}

	return dominant;
}

export function blendComposition(
	a: PlanetMaterialComposition,
	b: PlanetMaterialComposition,
	t: number,
): PlanetMaterialComposition {
	const clampedT = Math.max(0, Math.min(1, t));

	return normalizeComposition({
		rock: a.rock + (b.rock - a.rock) * clampedT,
		metal: a.metal + (b.metal - a.metal) * clampedT,
		ice: a.ice + (b.ice - a.ice) * clampedT,
		water: a.water + (b.water - a.water) * clampedT,
		gas: a.gas + (b.gas - a.gas) * clampedT,
		organic: a.organic + (b.organic - a.organic) * clampedT,
		volatiles: a.volatiles + (b.volatiles - a.volatiles) * clampedT,
	});
}
