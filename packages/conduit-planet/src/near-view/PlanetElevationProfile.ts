import type { PlanetClass, PlanetDefinition } from '../model';
import { getPlanetRadiusMeters } from './PlanetPhysicalScale';

export type PlanetElevationProfile = {
	maxElevationMeters: number;
	oceanLevelMeters: number;
	rawHeightReference: number;
};

const CLASS_RELIEF: Record<PlanetClass, number> = {
	barren: 1.3,
	rocky: 1.2,
	terrestrial: 1,
	ocean: 0.42,
	desert: 0.72,
	ice: 0.64,
	lava: 1.45,
	toxic: 0.62,
	carbon: 0.9,
	metal_rich: 1.25,
	gas_giant: 0,
	ice_giant: 0,
};

export function createPlanetElevationProfile(
	definition: PlanetDefinition,
): PlanetElevationProfile {
	const relief = CLASS_RELIEF[definition.class];
	const radiusScaledElevation = getPlanetRadiusMeters(definition) * 0.00135;
	const terrainScale = 0.65 + definition.surface.mountainScale * 0.35;

	return {
		maxElevationMeters: Math.max(
			0,
			Math.min(24_000, radiusScaledElevation * relief * terrainScale),
		),
		oceanLevelMeters: 0,
		rawHeightReference: 0.28,
	};
}

export function getPlanetElevationMeters(
	rawTerrainHeight: number,
	profile: PlanetElevationProfile,
): number {
	return (
		rawTerrainHeight /
		Math.max(0.000001, profile.rawHeightReference)
	) * profile.maxElevationMeters;
}

export function getPlanetRenderHeightScale(
	definition: PlanetDefinition,
	renderRadius: number,
): number {
	const profile = createPlanetElevationProfile(definition);
	const physicalRadius = getPlanetRadiusMeters(definition);
	return (
		profile.maxElevationMeters /
		Math.max(0.000001, profile.rawHeightReference)
	) * (renderRadius / Math.max(1, physicalRadius));
}
