import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';

const direction = new THREE.Vector3(0.72, 0.18, -0.67).normalize();

function createDefinition(
	volatiles: number,
	planetClass: 'terrestrial' | 'toxic' = 'terrestrial',
) {
	const definition = generatePlanetDefinition(63030, {
		forcePlanetClass: planetClass,
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.surface.hasIceCaps = false;
	definition.composition.volatiles = volatiles;
	definition.composition.metal = 0.18;
	definition.composition.ice = 0;
	return definition;
}

function sampleSurface(
	definition: ReturnType<typeof createDefinition>,
	isWater = false,
) {
	return evaluateSurfaceTerrainMaterial(definition, {
		direction,
		detailOffset: new THREE.Vector3(),
		height: 0.17,
		landMask: isWater ? 0.14 : 0.82,
		mountainMask: 0.34,
		erosionMask: 0.62,
		riverMask: 0.18,
		isWater,
		slope: 0.22,
	});
}

function colorDifference(a: THREE.Color, b: THREE.Color): number {
	return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

describe('composition.volatiles toxic surface migration', () => {
	test('higher volatile abundance changes solid toxic/mineral shading continuously', () => {
		const low = sampleSurface(createDefinition(0.02));
		const high = sampleSurface(createDefinition(0.82));

		expect(colorDifference(high.color, low.color)).toBeGreaterThan(0.01);
		expect(high.roughness).toBeGreaterThan(low.roughness);
		expect(high.metalness).toBeCloseTo(low.metalness, 12);
	});

	test('keeps toxic-class influence saturated regardless of volatile abundance', () => {
		const low = sampleSurface(createDefinition(0.02, 'toxic'));
		const high = sampleSurface(createDefinition(0.82, 'toxic'));

		expect(high.color.r).toBeCloseTo(low.color.r, 12);
		expect(high.color.g).toBeCloseTo(low.color.g, 12);
		expect(high.color.b).toBeCloseTo(low.color.b, 12);
		expect(high.roughness).toBeCloseTo(low.roughness, 12);
		expect(high.metalness).toBeCloseTo(low.metalness, 12);
	});

	test('does not route volatile toxic influence into water shading', () => {
		const low = sampleSurface(createDefinition(0.02, 'toxic'), true);
		const high = sampleSurface(createDefinition(0.82, 'toxic'), true);

		expect(high).toEqual(low);
		expect(high.metalness).toBe(0);
	});
});
