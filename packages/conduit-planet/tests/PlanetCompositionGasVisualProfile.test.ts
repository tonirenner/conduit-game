import { describe, expect, test } from 'bun:test';
import { getGasGiantVisualProfile } from '../src/rendering/GasGiantVisualProfile';

describe('composition.gas giant visual profile', () => {
	test('increases gas giant density cues without changing structure', () => {
		const low = getGasGiantVisualProfile('gas_giant', 0.2);
		const high = getGasGiantVisualProfile('gas_giant', 0.9);

		expect(high.cloudShells.count).toBe(low.cloudShells.count);
		expect(high.cloudParticles.count).toBe(low.cloudParticles.count);
		expect(high.cloudShells.opacityStart).toBeGreaterThan(low.cloudShells.opacityStart);
		expect(high.cloudParticles.opacity).toBeGreaterThan(low.cloudParticles.opacity);
		expect(high.atmosphere.opacity).toBeGreaterThan(low.atmosphere.opacity);
		expect(high.bands.stripeAlpha).toBeGreaterThan(low.bands.stripeAlpha);
		expect(high.bands.cloudThreshold).toBeLessThan(low.bands.cloudThreshold);
	});

	test('applies the same bounded density semantics to ice giants', () => {
		const low = getGasGiantVisualProfile('ice_giant', 0);
		const high = getGasGiantVisualProfile('ice_giant', 1);
		expect(high.cloudShells.opacityStart).toBeGreaterThan(low.cloudShells.opacityStart);
		expect(high.cloudParticles.opacity).toBeGreaterThan(low.cloudParticles.opacity);
	});
});
