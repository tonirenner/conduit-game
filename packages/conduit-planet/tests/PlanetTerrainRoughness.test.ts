import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';
import { getTerrainGeometryReliefRawHeight } from '../src/terrain/TerrainGeometryRelief';
import { createTerrainSeedConfig, type TerrainSample } from '../src/terrain/noise';

const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
const terrain: TerrainSample = {
	height: 0.16,
	landMask: 0.9,
	continent: 0.72,
	mountainMask: 0.64,
	erosionMask: 0.48,
	riverMask: 0.12,
};
const config = createTerrainSeedConfig(4711, 'earthlike');

describe('surface.terrainRoughness migration', () => {
	test('scales only the additional geometry relief layer', () => {
		const flat = getTerrainGeometryReliefRawHeight(direction, terrain, config, 0);
		const half = getTerrainGeometryReliefRawHeight(direction, terrain, config, 0.5);
		const full = getTerrainGeometryReliefRawHeight(direction, terrain, config, 1);

		expect(flat).toBe(0);
		expect(half).toBeCloseTo(full * 0.5, 12);
		expect(full).not.toBe(0);
	});

	test('clamps roughness to the normalized definition domain', () => {
		const below = getTerrainGeometryReliefRawHeight(direction, terrain, config, -0.5);
		const zero = getTerrainGeometryReliefRawHeight(direction, terrain, config, 0);
		const above = getTerrainGeometryReliefRawHeight(direction, terrain, config, 1.5);
		const one = getTerrainGeometryReliefRawHeight(direction, terrain, config, 1);

		expect(below).toBe(zero);
		expect(above).toBeCloseTo(one, 12);
	});

	test('keeps canonical terrain and biome inputs unchanged between roughness levels', () => {
		const base = generatePlanetDefinition(90125, {
			name: 'Terrain Roughness Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'terrestrial',
		});
		const smoothDefinition = structuredClone(base);
		const roughDefinition = structuredClone(base);
		smoothDefinition.surface.terrainRoughness = 0;
		roughDefinition.surface.terrainRoughness = 1;

		const smoothSampler = new PlanetTerrainSampler(smoothDefinition);
		const roughSampler = new PlanetTerrainSampler(roughDefinition);
		const smoothSample = smoothSampler.sample(direction, false);
		const roughSample = roughSampler.sample(direction, false);

		expect(smoothSampler.terrainRoughness).toBe(0);
		expect(roughSampler.terrainRoughness).toBe(1);
		expect(smoothSample.rawTerrain).toEqual(roughSample.rawTerrain);
		expect(smoothSample.landMask).toBe(roughSample.landMask);
		expect(smoothSample.biome).toBe(roughSample.biome);
		expect(smoothSample.climate).toEqual(roughSample.climate);
		expect(smoothSample.geometryReliefRawHeight).toBe(0);
		expect(roughSample.geometryReliefRawHeight).not.toBe(0);
	});
});
