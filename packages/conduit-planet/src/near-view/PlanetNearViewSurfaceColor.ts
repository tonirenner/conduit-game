import * as THREE from 'three';
import type { BiomeId } from '../climate';
import type { PlanetClass, PlanetDefinition } from '../model';
import {
	createPlanetRenderProfile,
} from '../rendering/PlanetRenderProfile';
import {
	createSurfaceRenderProfile,
	type SurfacePaletteKind,
} from '../rendering/SurfaceRenderProfile';
import type { PlanetSurfaceSample } from './PlanetTerrainSampler';

export type PlanetNearViewVisualProfile = {
	planetClass: PlanetClass;
	palette: SurfacePaletteKind;
	roughness: number;
	metalness: number;
	atmosphereColor: THREE.Color;
	atmosphereDensity: number;
};

const BIOME_COLORS: Record<BiomeId, number> = {
	deepOcean: 0x12374d,
	shallowOcean: 0x276778,
	coast: 0x8a8561,
	ice: 0xcbd9dd,
	tundra: 0x8b9285,
	borealForest: 0x385643,
	temperateForest: 0x416b46,
	rainforest: 0x28573a,
	grassland: 0x718153,
	savanna: 0x9b8952,
	desert: 0xa68a59,
	dryHills: 0x7c694c,
	mountain: 0x77756f,
	snow: 0xe1e5e4,
};

export function createPlanetNearViewVisualProfile(
	definition: PlanetDefinition,
): PlanetNearViewVisualProfile {
	const renderProfile = createPlanetRenderProfile(definition);
	const surfaceProfile = createSurfaceRenderProfile(
		definition,
		renderProfile,
	);

	return {
		planetClass: definition.class,
		palette: surfaceProfile.palette,
		roughness: THREE.MathUtils.clamp(
			0.76 + surfaceProfile.terrainRoughness * 0.18,
			0.72,
			0.96,
		),
		metalness: surfaceProfile.palette === 'metallic'
			? 0.22
			: 0.015,
		atmosphereColor: new THREE.Color(definition.atmosphere.color),
		atmosphereDensity: definition.atmosphere.density,
	};
}

export function getNearViewSurfaceColor(
	sample: PlanetSurfaceSample,
	profile: PlanetNearViewVisualProfile,
	target = new THREE.Color(),
): THREE.Color {
	if (sample.isWater) {
		target.setHex(sample.landMask < 0.25 ? 0x12374d : 0x276778);
	} else {
		target.setHex(BIOME_COLORS[sample.biome]);
	}

	switch (profile.palette) {
		case 'lava':
			target.lerp(
				new THREE.Color(sample.rawTerrain.mountainMask > 0.58 ? 0x6e2412 : 0x241b18),
				0.82,
			);
			break;
		case 'ice':
			target.lerp(new THREE.Color(0xb8d0d6), 0.72);
			break;
		case 'desert':
			target.lerp(new THREE.Color(0xa37f4f), 0.62);
			break;
		case 'toxic':
			target.lerp(new THREE.Color(0x526b50), 0.66);
			break;
		case 'carbon':
			target.lerp(new THREE.Color(0x292b2e), 0.82);
			break;
		case 'metallic':
			target.lerp(new THREE.Color(0x716d68), 0.68);
			break;
		case 'barren':
			target.lerp(new THREE.Color(0x6f6254), 0.58);
			break;
		case 'rocky':
			target.lerp(new THREE.Color(0x625e58), 0.48);
			break;
	}

	const terrainDetail = THREE.MathUtils.clamp(
		(sample.rawTerrain.continent - 0.5) * 0.08 +
		(sample.rawTerrain.mountainMask - 0.35) * 0.12 +
		(sample.rawTerrain.height - 0.08) * 0.18,
		-0.09,
		0.12,
	);
	const climateDetail = THREE.MathUtils.clamp(
		(sample.climate.humidity - sample.climate.aridity) * 0.035,
		-0.035,
		0.035,
	);
	target.offsetHSL(0, 0, terrainDetail + climateDetail);

	return target;
}
