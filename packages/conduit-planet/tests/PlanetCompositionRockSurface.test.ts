import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';

function createDefinition(rock: number) {
	const definition = generatePlanetDefinition(63030, {
		forcePlanetClass: 'terrestrial',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.composition.rock = rock;
	definition.composition.metal = 0;
	definition.composition.ice = 0;
	definition.composition.volatiles = 0;
	definition.surface.hasIceCaps = false;
	definition.surface.hasVolcanism = false;
	return definition;
}

function sample(definition: ReturnType<typeof createDefinition>, isWater = false) {
	return evaluateSurfaceTerrainMaterial(definition, {
		direction: new THREE.Vector3(0.8, 0.2, 0.4).normalize(),
		detailOffset: new THREE.Vector3(),
		height: 0.18,
		landMask: isWater ? 0.12 : 0.88,
		mountainMask: 0.64,
		erosionMask: 0.34,
		riverMask: 0,
		volcanicMask: 0,
		isWater,
		slope: 0.42,
	});
}

describe('composition.rock surface migration', () => {
	test('modulates exposed solid material continuously', () => {
		const low = sample(createDefinition(0.05));
		const high = sample(createDefinition(0.85));

		expect(high.color.r).not.toBeCloseTo(low.color.r, 10);
		expect(high.color.g).not.toBeCloseTo(low.color.g, 10);
		expect(high.color.b).not.toBeCloseTo(low.color.b, 10);
		expect(high.roughness).toBeGreaterThan(low.roughness);
	});

	test('does not change water material', () => {
		const low = sample(createDefinition(0.05), true);
		const high = sample(createDefinition(0.85), true);
		expect(high).toEqual(low);
	});
});
