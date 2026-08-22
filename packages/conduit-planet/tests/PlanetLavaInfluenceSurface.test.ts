import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';

const direction = new THREE.Vector3(0.72, 0.31, -0.62).normalize();

function createDefinition(hasVolcanism: boolean) {
	const definition = generatePlanetDefinition(73030, {
		forcePlanetClass: 'terrestrial',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.surface.hasVolcanism = hasVolcanism;
	definition.composition.metal = 0.36;
	definition.composition.volatiles = 0.08;
	definition.composition.ice = 0;
	definition.surface.hasIceCaps = false;
	return definition;
}

function sampleSurface(
	definition: ReturnType<typeof createDefinition>,
	volcanicMask: number,
	isWater = false,
) {
	return evaluateSurfaceTerrainMaterial(definition, {
		direction,
		detailOffset: new THREE.Vector3(),
		height: 0.19,
		landMask: isWater ? 0.16 : 0.84,
		mountainMask: 0.48,
		erosionMask: 0.24,
		riverMask: 0,
		volcanicMask,
		isWater,
		slope: 0.22,
	});
}

describe('lava influence surface migration', () => {
	test('does not create volcanic material when volcanism is disabled', () => {
		const definition = createDefinition(false);
		const quiet = sampleSurface(definition, 0);
		const masked = sampleSurface(definition, 1);

		expect(masked.color.r).toBeCloseTo(quiet.color.r, 12);
		expect(masked.color.g).toBeCloseTo(quiet.color.g, 12);
		expect(masked.color.b).toBeCloseTo(quiet.color.b, 12);
		expect(masked.roughness).toBeCloseTo(quiet.roughness, 12);
		expect(masked.metalness).toBeCloseTo(quiet.metalness, 12);
	});

	test('requires the canonical local volcanic mask on volcanic non-lava worlds', () => {
		const inactive = sampleSurface(createDefinition(true), 0);
		const active = sampleSurface(createDefinition(true), 0.92);

		expect(active.color.r).not.toBeCloseTo(inactive.color.r, 6);
		expect(active.color.g).not.toBeCloseTo(inactive.color.g, 6);
		expect(active.color.b).not.toBeCloseTo(inactive.color.b, 6);
		expect(active.roughness).toBeGreaterThan(inactive.roughness);
		expect(active.metalness).toBeLessThan(inactive.metalness);
	});

	test('keeps water outside volcanic solid-surface shading', () => {
		const definition = createDefinition(true);
		const quiet = sampleSurface(definition, 0, true);
		const volcanic = sampleSurface(definition, 1, true);

		expect(volcanic).toEqual(quiet);
		expect(volcanic.metalness).toBe(0);
	});

	test('keeps lava-class base material independent from the local mask', () => {
		const definition = generatePlanetDefinition(73031, {
			forcePlanetClass: 'lava',
			semiMajorAxis: 0.35,
			starIrradiance: 3.5,
		});
		const quiet = sampleSurface(definition, 0);
		const volcanic = sampleSurface(definition, 1);

		expect(volcanic).toEqual(quiet);
	});
});
