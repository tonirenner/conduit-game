import type { PlanetMaterialComposition } from '../model/PlanetComposition';
import type {
	PlanetAtmosphereDefinition,
	PlanetClass,
	PlanetClimateDefinition,
	PlanetResourceProfile,
	PlanetSurfaceDefinition,
} from '../model/PlanetDefinition';

export function generatePlanetResourceProfile(
	input: {
		planetClass: PlanetClass;
		composition: PlanetMaterialComposition;
		atmosphere: PlanetAtmosphereDefinition;
		surface: PlanetSurfaceDefinition;
		climate: PlanetClimateDefinition;
	},
): PlanetResourceProfile {
	const {
		planetClass,
		composition,
		atmosphere,
		surface,
		climate,
	} = input;

	const giantBonus =
		planetClass === 'gas_giant' || planetClass === 'ice_giant'
			? 0.24
			: 0;

	const metal = clamp01(
		composition.metal * 1.35 +
		composition.rock * 0.20 +
		(planetClass === 'metal_rich' ? 0.34 : 0) +
		(surface.hasTectonics ? 0.05 : 0),
	);

	const rareMaterials = clamp01(
		composition.metal * 0.42 +
		composition.volatiles * 0.22 +
		composition.organic * 0.18 +
		(planetClass === 'carbon' ? 0.20 : 0) +
		(planetClass === 'lava' ? 0.14 : 0) +
		(planetClass === 'metal_rich' ? 0.18 : 0),
	);

	const fuel = clamp01(
		composition.gas * 0.95 +
		composition.volatiles * 0.58 +
		composition.organic * 0.22 +
		composition.ice * 0.10 +
		giantBonus,
	);

	const water = clamp01(
		composition.water * 1.20 +
		composition.ice * 0.62 +
		(surface.hasOcean ? 0.26 : 0) +
		(surface.hasIceCaps ? 0.10 : 0),
	);

	const volatiles = clamp01(
		composition.volatiles * 0.92 +
		composition.gas * 0.28 +
		composition.ice * 0.16 +
		(planetClass === 'toxic' ? 0.20 : 0) +
		(planetClass === 'lava' ? 0.08 : 0),
	);

	const researchValue = clamp01(
		composition.organic * 0.30 +
		climate.stormActivity * 0.18 +
		climate.ashLoad * 0.16 +
		(surface.hasVolcanism ? 0.16 : 0) +
		(surface.hasTectonics ? 0.08 : 0) +
		(planetClass === 'toxic' ? 0.16 : 0) +
		giantBonus * 0.55,
	);

	const extractionDifficulty = clamp01(
		atmosphere.density * 0.16 +
		atmosphere.pressure * 0.035 +
		surface.terrainRoughness * 0.18 +
		climate.stormActivity * 0.18 +
		climate.ashLoad * 0.12 +
		(planetClass === 'gas_giant' || planetClass === 'ice_giant' ? 0.34 : 0) +
		(planetClass === 'lava' ? 0.20 : 0) +
		(planetClass === 'toxic' ? 0.18 : 0) -
		(surface.hasOcean ? 0.04 : 0),
	);

	return {
		metal,
		rareMaterials,
		fuel,
		water,
		volatiles,
		researchValue,
		extractionDifficulty,
	};
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
