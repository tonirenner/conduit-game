import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';

function createTerrestrialDefinition() {
	return generatePlanetDefinition(90125, {
		name: 'Ocean Level Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
}

function findDirectionWithLandMaskBetween(
	sampler: PlanetTerrainSampler,
	minimum: number,
	maximum: number,
): THREE.Vector3 {
	for (let latitude = -8; latitude <= 8; latitude++) {
		for (let longitude = 0; longitude < 32; longitude++) {
			const phi = (latitude / 8) * Math.PI * 0.48;
			const theta = (longitude / 32) * Math.PI * 2;
			const direction = new THREE.Vector3(
				Math.cos(phi) * Math.cos(theta),
				Math.sin(phi),
				Math.cos(phi) * Math.sin(theta),
			).normalize();
			const sample = sampler.sample(direction, false);
			if (sample.landMask > minimum && sample.landMask < maximum) {
				return direction;
			}
		}
	}

	throw new Error(`No terrain sample found with landMask in (${minimum}, ${maximum}).`);
}

describe('planet ocean level', () => {
	test('uses surface.oceanLevel as the canonical land-mask water threshold', () => {
		const lowDefinition = createTerrestrialDefinition();
		lowDefinition.surface.oceanLevel = 0.30;
		const lowSampler = new PlanetTerrainSampler(lowDefinition);
		const direction = findDirectionWithLandMaskBetween(lowSampler, 0.35, 0.75);
		const lowSample = lowSampler.sample(direction, false);

		const highDefinition = createTerrestrialDefinition();
		highDefinition.surface.oceanLevel = 0.80;
		const highSampler = new PlanetTerrainSampler(highDefinition);
		const highSample = highSampler.sample(direction, false);

		expect(lowSample.landMask).toBe(highSample.landMask);
		expect(lowSample.landMask).toBeGreaterThan(0.30);
		expect(lowSample.landMask).toBeLessThan(0.80);
		expect(lowSample.isWater).toBe(false);
		expect(highSample.isWater).toBe(true);
	});

	test('keeps hasOcean as the hard gate regardless of oceanLevel', () => {
		const definition = createTerrestrialDefinition();
		definition.surface.hasOcean = false;
		definition.surface.oceanLevel = 1.0;
		const sampler = new PlanetTerrainSampler(definition);
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();

		expect(sampler.sample(direction, false).isWater).toBe(false);
	});

	test('clamps the threshold to the normalized land-mask domain', () => {
		const below = createTerrestrialDefinition();
		below.surface.oceanLevel = -0.5;
		const belowSampler = new PlanetTerrainSampler(below);
		expect(belowSampler.oceanLandMaskThreshold).toBe(0);

		const above = createTerrestrialDefinition();
		above.surface.oceanLevel = 1.5;
		const aboveSampler = new PlanetTerrainSampler(above);
		expect(aboveSampler.oceanLandMaskThreshold).toBe(1);
	});
});
