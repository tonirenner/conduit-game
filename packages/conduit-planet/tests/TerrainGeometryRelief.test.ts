import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { PlanetTerrainSampler } from '../src/near-view';
import { getTerrainSample } from '../src/terrain/noise';

describe('terrain geometry relief', () => {
	test('keeps canonical terrain semantics separate from physical relief', () => {
		const definition = generatePlanetDefinition(90125, {
			name: 'Geometry Relief Test',
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: 'desert',
		});
		const sampler = new PlanetTerrainSampler(definition);
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
		const sample = sampler.sample(direction, false);
		const canonical = getTerrainSample(direction, sampler.terrainSeedConfig);

		expect(sample.rawTerrain.height).toBe(canonical.height);
		expect(sample.rawTerrain.landMask).toBe(canonical.landMask);
		expect(sample.climate.height).toBe(canonical.height);
		expect(sample.geometryRawHeight).toBeGreaterThanOrEqual(0);
		expect(sample.geometryRawHeight).toBeCloseTo(
			Math.max(0, canonical.height + sample.geometryReliefRawHeight),
			12,
		);
	});
});
