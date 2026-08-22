import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view/PlanetTerrainSampler';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';
import { getPlanetIceCapMask } from '../src/terrain/PlanetSurfaceMasks';

const pole = new THREE.Vector3(0.08, 0.995, -0.04).normalize();
const equator = new THREE.Vector3(1, 0, 0);

function createDefinition(ice: number) {
	const definition = generatePlanetDefinition(53030, {
		forcePlanetClass: 'terrestrial',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.surface.hasIceCaps = true;
	definition.climate.temperature01 = 0.24;
	definition.composition.ice = ice;
	definition.composition.metal = 0.42;
	return definition;
}

function sampleSurface(definition: ReturnType<typeof createDefinition>, direction: THREE.Vector3, isWater = false) {
	return evaluateSurfaceTerrainMaterial(definition, {
		direction,
		detailOffset: new THREE.Vector3(),
		height: 0.16,
		landMask: isWater ? 0.15 : 0.86,
		mountainMask: 0.52,
		erosionMask: 0.28,
		riverMask: 0,
		isWater,
		slope: 0.24,
	});
}

describe('composition.ice surface migration', () => {
	test('shares one canonical ice-cap mask between sampler and material domain', () => {
		const definition = createDefinition(0.48);
		const sampler = new PlanetTerrainSampler(definition);
		const sampled = sampler.sample(pole, false);

		expect(sampled.iceCapMask).toBeCloseTo(
			getPlanetIceCapMask(definition, pole),
			12,
		);
	});

	test('stronger ice composition increases polar ice shading', () => {
		const lowIce = sampleSurface(createDefinition(0.02), pole);
		const highIce = sampleSurface(createDefinition(0.62), pole);

		expect(highIce.color.r).toBeGreaterThan(lowIce.color.r);
		expect(highIce.color.g).toBeGreaterThan(lowIce.color.g);
		expect(highIce.color.b).toBeGreaterThan(lowIce.color.b);
		expect(highIce.roughness).toBeLessThan(lowIce.roughness);
	});

	test('ice cover suppresses exposed metal response underneath the cap', () => {
		const lowIce = sampleSurface(createDefinition(0.02), pole);
		const highIce = sampleSurface(createDefinition(0.62), pole);

		expect(highIce.metalness).toBeLessThan(lowIce.metalness);
	});

	test('does not paint non-cap equatorial terrain with composition ice', () => {
		const lowIce = sampleSurface(createDefinition(0.02), equator);
		const highIce = sampleSurface(createDefinition(0.62), equator);

		expect(highIce.color.r).toBeCloseTo(lowIce.color.r, 12);
		expect(highIce.color.g).toBeCloseTo(lowIce.color.g, 12);
		expect(highIce.color.b).toBeCloseTo(lowIce.color.b, 12);
		expect(highIce.roughness).toBeCloseTo(lowIce.roughness, 12);
		expect(highIce.metalness).toBeCloseTo(lowIce.metalness, 12);
	});

	test('keeps water non-metallic and outside solid ice shading', () => {
		const lowIce = sampleSurface(createDefinition(0.02), pole, true);
		const highIce = sampleSurface(createDefinition(0.62), pole, true);

		expect(highIce).toEqual(lowIce);
		expect(highIce.metalness).toBe(0);
	});
});
