import { describe, expect, test } from 'bun:test';

import { generatePlanetDefinition } from '../src/generation';
import { createPlanetRenderProfile } from '../src/rendering';

describe('generatePlanetDefinition', () => {
	test('is deterministic for the same seed and options', () => {
		const options = {
			id: 'test-planet',
			name: 'Test Planet',
			semiMajorAxis: 1.25,
			starIrradiance: 0.8,
		} as const;

		expect(generatePlanetDefinition(424242, options)).toEqual(
			generatePlanetDefinition(424242, options),
		);
	});

	test('keeps generated climate and resource values normalized', () => {
		const planet = generatePlanetDefinition(123456);
		const normalizedValues = [
			planet.climate.temperature01,
			planet.climate.humidity,
			planet.climate.aridity,
			planet.climate.windStrength,
			planet.climate.stormActivity,
			planet.climate.seasonality,
			planet.climate.cloudPersistence,
			planet.climate.ashLoad,
			...Object.values(planet.resources),
		];

		for (const value of normalizedValues) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	test('honors a forced class and derives its renderer profile', () => {
		const planet = generatePlanetDefinition(98765, {
			forcePlanetClass: 'gas_giant',
		});
		const profile = createPlanetRenderProfile(planet);

		expect(planet.class).toBe('gas_giant');
		expect(profile.rendererKind).toBe('gas_giant');
		expect(profile.enableTerrain).toBe(false);
	});
});
