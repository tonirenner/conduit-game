import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

function createDefinition() {
	return generatePlanetDefinition(90125, {
		name: 'Ice Caps Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
}

describe('surface.hasIceCaps migration', () => {
	test('keeps the ice cap mask disabled when the domain flag is false', () => {
		const definition = createDefinition();
		definition.surface.hasIceCaps = false;
		const sampler = new PlanetTerrainSampler(definition);

		for (const direction of [
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(0, -1, 0),
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(0.3, 0.9, 0.2).normalize(),
		]) {
			expect(sampler.sample(direction, false).iceCapMask).toBe(0);
		}
	});

	test('creates symmetric polar caps while keeping the equator clear', () => {
		const definition = createDefinition();
		definition.surface.hasIceCaps = true;
		definition.climate.temperature01 = 0.35;
		definition.composition.ice = 0.45;
		const sampler = new PlanetTerrainSampler(definition);

		const north = sampler.sample(new THREE.Vector3(0, 1, 0), false).iceCapMask;
		const south = sampler.sample(new THREE.Vector3(0, -1, 0), false).iceCapMask;
		const equator = sampler.sample(new THREE.Vector3(1, 0, 0), false).iceCapMask;

		expect(north).toBe(1);
		expect(south).toBe(1);
		expect(north).toBe(south);
		expect(equator).toBe(0);
	});

	test('extends caps further on colder and ice-richer worlds', () => {
		const warm = createDefinition();
		const cold = structuredClone(warm);
		warm.surface.hasIceCaps = true;
		cold.surface.hasIceCaps = true;
		warm.climate.temperature01 = 0.78;
		warm.composition.ice = 0.05;
		cold.climate.temperature01 = 0.18;
		cold.composition.ice = 0.78;

		const latitudeDirection = new THREE.Vector3(0.6, 0.8, 0).normalize();
		const warmMask = new PlanetTerrainSampler(warm)
			.sample(latitudeDirection, false).iceCapMask;
		const coldMask = new PlanetTerrainSampler(cold)
			.sample(latitudeDirection, false).iceCapMask;

		expect(coldMask).toBeGreaterThan(warmMask);
	});

	test('changes only the ice mask while canonical terrain and geometry stay stable', () => {
		const base = createDefinition();
		const inactiveDefinition = structuredClone(base);
		const activeDefinition = structuredClone(base);
		inactiveDefinition.surface.hasIceCaps = false;
		activeDefinition.surface.hasIceCaps = true;

		const inactiveSampler = new PlanetTerrainSampler(inactiveDefinition);
		const activeSampler = new PlanetTerrainSampler(activeDefinition);
		const direction = new THREE.Vector3(0.22, 0.94, -0.26).normalize();
		const inactive = inactiveSampler.sample(direction, false);
		const active = activeSampler.sample(direction, false);

		expect(inactive.rawTerrain).toEqual(active.rawTerrain);
		expect(inactive.landMask).toBe(active.landMask);
		expect(inactive.isWater).toBe(active.isWater);
		expect(inactive.biome).toBe(active.biome);
		expect(inactive.climate).toEqual(active.climate);
		expect(inactive.geometryRawHeight).toBe(active.geometryRawHeight);
		expect(inactive.geometryReliefRawHeight).toBe(active.geometryReliefRawHeight);
		expect(inactive.volcanicMask).toBe(active.volcanicMask);
		expect(inactive.iceCapMask).toBe(0);
		expect(active.iceCapMask).toBeGreaterThan(0);
	});
});
