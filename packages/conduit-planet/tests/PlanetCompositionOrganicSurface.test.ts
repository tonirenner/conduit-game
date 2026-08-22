import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';

function createDefinition(planetClass: 'carbon' | 'terrestrial', organic: number) {
	const definition = generatePlanetDefinition(73030, {
		forcePlanetClass: planetClass,
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.composition.organic = organic;
	definition.composition.metal = 0;
	definition.composition.ice = 0;
	definition.composition.volatiles = 0;
	definition.surface.hasIceCaps = false;
	definition.surface.hasVolcanism = false;
	return definition;
}

function sample(definition: ReturnType<typeof createDefinition>) {
	return evaluateSurfaceTerrainMaterial(definition, {
		direction: new THREE.Vector3(0.72, 0.18, 0.66).normalize(),
		detailOffset: new THREE.Vector3(),
		height: 0.16,
		landMask: 0.84,
		mountainMask: 0.28,
		erosionMask: 0.46,
		riverMask: 0.18,
		volcanicMask: 0,
		isWater: false,
		slope: 0.22,
	});
}

describe('composition.organic surface migration', () => {
	test('modulates carbon surfaces continuously', () => {
		const low = sample(createDefinition('carbon', 0.02));
		const high = sample(createDefinition('carbon', 0.82));
		expect(high.color.r).toBeLessThan(low.color.r);
		expect(high.color.g).toBeLessThan(low.color.g);
		expect(high.color.b).toBeLessThan(low.color.b);
		expect(high.roughness).toBeLessThan(low.roughness);
	});

	test('does not apply organic shading to generic terrestrial surfaces', () => {
		const low = sample(createDefinition('terrestrial', 0.02));
		const high = sample(createDefinition('terrestrial', 0.82));
		expect(high).toEqual(low);
	});
});
