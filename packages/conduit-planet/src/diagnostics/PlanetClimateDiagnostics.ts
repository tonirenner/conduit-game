import * as THREE from 'three';

import {
	CLIMATE_DEBUG_MODES,
	type BiomeId,
	type ClimateDebugMode,
	getClimateDebugColor,
	getClimateSample,
} from '../climate/Climate';
import type { PlanetDefinition } from '../model/PlanetDefinition';
import { resolveTerrainProfileKind } from '../rendering/TerrainRenderProfile';
import {
	createTerrainSeedConfig,
	getTerrainSample,
	type TerrainSeedConfig,
} from '../terrain/noise';

export type PlanetBiomeShare = {
	biome: BiomeId;
	count: number;
	share: number;
};

export type PlanetClimateDiagnostics = {
	sampleCount: number;
	terrainProfile: TerrainSeedConfig['profile'];
	averages: {
		temperature: number;
		humidity: number;
		aridity: number;
		vegetation: number;
		snow: number;
		cloudPotential: number;
		height: number;
		landMask: number;
	};
	coverage: {
		deepOcean: number;
		shallowOcean: number;
		coast: number;
		land: number;
	};
	dominantBiomes: PlanetBiomeShare[];
	warnings: string[];
};

export const PLANET_CLIMATE_DEBUG_MODES = CLIMATE_DEBUG_MODES;

export function createPlanetClimateDiagnostics(
	definition: PlanetDefinition,
	options?: {
		width?: number;
		height?: number;
	},
): PlanetClimateDiagnostics {
	const width = options?.width ?? 96;
	const height = options?.height ?? 48;
	const terrainSeedConfig = createPlanetTerrainSeedConfig(definition);
	const normal = new THREE.Vector3();
	const biomeCounts = new Map<BiomeId, number>();
	let sampleCount = 0;
	let temperature = 0;
	let humidity = 0;
	let aridity = 0;
	let vegetation = 0;
	let snow = 0;
	let cloudPotential = 0;
	let terrainHeight = 0;
	let landMask = 0;
	let deepOcean = 0;
	let shallowOcean = 0;
	let coast = 0;
	let land = 0;

	for (let y = 0; y < height; y++) {
		const v = y / (height - 1);
		const latitude = (0.5 - v) * Math.PI;
		const cosLatitude = Math.cos(latitude);
		const sinLatitude = Math.sin(latitude);

		for (let x = 0; x < width; x++) {
			const u = x / (width - 1);
			const longitude = (u * 2 - 1) * Math.PI;

			normal.set(
				cosLatitude * Math.cos(longitude),
				sinLatitude,
				cosLatitude * Math.sin(longitude),
			);

			const terrainSample = getTerrainSample(normal, terrainSeedConfig);
			const climateSample = getClimateSample(
				normal,
				terrainSample.height,
				terrainSample.landMask,
			);

			sampleCount++;
			temperature += climateSample.temperature;
			humidity += climateSample.humidity;
			aridity += climateSample.aridity;
			vegetation += climateSample.vegetation;
			snow += climateSample.snow;
			cloudPotential += climateSample.cloudPotential;
			terrainHeight += climateSample.height;
			landMask += climateSample.landMask;

			if (climateSample.landMask < 0.34) {
				deepOcean++;
			} else if (climateSample.landMask < 0.58) {
				shallowOcean++;
			} else if (climateSample.landMask < 0.68) {
				coast++;
			} else {
				land++;
			}

			biomeCounts.set(
				climateSample.biome,
				(biomeCounts.get(climateSample.biome) ?? 0) + 1,
			);
		}
	}

	const dominantBiomes = Array.from(biomeCounts.entries())
		.map(([biome, count]) => ({
			biome,
			count,
			share: count / sampleCount,
		}))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5);

	return {
		sampleCount,
		terrainProfile: terrainSeedConfig.profile,
		averages: {
			temperature: temperature / sampleCount,
			humidity: humidity / sampleCount,
			aridity: aridity / sampleCount,
			vegetation: vegetation / sampleCount,
			snow: snow / sampleCount,
			cloudPotential: cloudPotential / sampleCount,
			height: terrainHeight / sampleCount,
			landMask: landMask / sampleCount,
		},
		coverage: {
			deepOcean: deepOcean / sampleCount,
			shallowOcean: shallowOcean / sampleCount,
			coast: coast / sampleCount,
			land: land / sampleCount,
		},
		dominantBiomes,
		warnings: createPlanetClimateWarnings(
			definition,
			dominantBiomes,
			{
				deepOcean: deepOcean / sampleCount,
				shallowOcean: shallowOcean / sampleCount,
				coast: coast / sampleCount,
				land: land / sampleCount,
			},
		),
	};
}

export function drawPlanetClimateDebugMap(
	canvas: HTMLCanvasElement,
	definition: PlanetDefinition,
	mode: ClimateDebugMode,
): void {
	const context = canvas.getContext('2d');

	if (!context) {
		return;
	}

	const width = canvas.width;
	const height = canvas.height;
	const imageData = context.createImageData(width, height);
	const data = imageData.data;
	const terrainSeedConfig = createPlanetTerrainSeedConfig(definition);
	const normal = new THREE.Vector3();

	for (let y = 0; y < height; y++) {
		const v = y / (height - 1);
		const latitude = (0.5 - v) * Math.PI;
		const cosLatitude = Math.cos(latitude);
		const sinLatitude = Math.sin(latitude);

		for (let x = 0; x < width; x++) {
			const u = x / (width - 1);
			const longitude = (u * 2 - 1) * Math.PI;

			normal.set(
				cosLatitude * Math.cos(longitude),
				sinLatitude,
				cosLatitude * Math.sin(longitude),
			);

			const terrainSample = getTerrainSample(normal, terrainSeedConfig);
			const climateSample = getClimateSample(
				normal,
				terrainSample.height,
				terrainSample.landMask,
			);
			const color = getClimateDebugColor(climateSample, mode);
			const index = (x + y * width) * 4;

			data[index + 0] = color[0];
			data[index + 1] = color[1];
			data[index + 2] = color[2];
			data[index + 3] = 255;
		}
	}

	context.putImageData(imageData, 0, 0);
	context.fillStyle = 'rgba(0, 0, 0, 0.62)';
	context.fillRect(0, 0, width, 20);
	context.font = '11px monospace';
	context.fillStyle = '#d8ecff';
	context.fillText(`${definition.class} / ${mode}`, 8, 14);
}

function createPlanetTerrainSeedConfig(
	definition: PlanetDefinition,
): TerrainSeedConfig {
	return createTerrainSeedConfig(
		definition.render.terrainSeed,
		resolveTerrainProfileKind(definition.class),
	);
}

function createPlanetClimateWarnings(
	definition: PlanetDefinition,
	dominantBiomes: PlanetBiomeShare[],
	coverage: PlanetClimateDiagnostics['coverage'],
): string[] {
	const warnings: string[] = [];
	const dominantBiome = dominantBiomes[0]?.biome;

	if (
		definition.surface.hasOcean &&
		coverage.deepOcean + coverage.shallowOcean < 0.20
	) {
		warnings.push('ocean class has low water coverage');
	}

	if (
		!definition.surface.hasOcean &&
		coverage.deepOcean + coverage.shallowOcean > 0.10
	) {
		warnings.push('dry class still samples visible ocean biomes');
	}

	if (
		(definition.class === 'gas_giant' || definition.class === 'ice_giant') &&
		definition.surface.hasSolidSurface
	) {
		warnings.push('giant class should not behave like a solid terrain planet');
	}

	if (
		definition.class === 'lava' &&
		dominantBiome !== 'mountain' &&
		dominantBiome !== 'dryHills' &&
		dominantBiome !== 'desert'
	) {
		warnings.push('lava class climate still reads like a wet/temperate planet');
	}

	return warnings;
}
