import { describe, expect, test } from 'bun:test';
import { generatePlanetDefinition } from '../src/generation';
import {
	getPlanetMoonSystemSeed,
	getPlanetRingLayerRuntimeProfile,
} from '../src/rendering/PlanetLayerRuntimeProfile';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';

describe('planet layer runtime profile helpers', () => {
	test('routes ring enablement through PlanetRenderProfile and uses the declared ring seed', () => {
		const definition = generatePlanetDefinition(81231, {
			forcePlanetClass: 'rocky',
			forceRings: true,
		});
		const renderProfile = createPlanetRenderProfile(definition);
		const runtime = getPlanetRingLayerRuntimeProfile(definition, renderProfile);

		expect(runtime.enabled).toBe(renderProfile.enableRings);
		expect(runtime.seed).toBe(definition.render.ringSeed);
	});

	test('keeps the definition fallback when Planet has no render profile', () => {
		const definition = generatePlanetDefinition(81232, {
			forcePlanetClass: 'rocky',
			forceRings: true,
		});
		const runtime = getPlanetRingLayerRuntimeProfile(definition, null);

		expect(runtime.enabled).toBe(definition.rings?.enabled ?? false);
	});

	test('preserves the existing deterministic moon-system seed without an undeclared render field', () => {
		const definition = generatePlanetDefinition(81233, {
			forcePlanetClass: 'terrestrial',
		});

		expect(getPlanetMoonSystemSeed(definition)).toBe((definition.seed ^ 0x4411aa) >>> 0);
	});
});
