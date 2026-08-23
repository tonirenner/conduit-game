import { describe, expect, test } from 'bun:test';
import { generatePlanetDefinition } from '../src/generation';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';
import { createSurfaceMaterialSemantics } from '../src/rendering/SurfaceMaterialSemantics';
import { createSurfaceRenderProfile } from '../src/rendering/SurfaceRenderProfile';

function createDefinition() {
	const definition = generatePlanetDefinition(73110, {
		forcePlanetClass: 'carbon',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.composition.water = 0.42;
	definition.composition.ice = 0.31;
	definition.composition.metal = 0.27;
	definition.composition.rock = 0.63;
	definition.composition.organic = 0.54;
	definition.composition.volatiles = 0.38;
	definition.surface.hasOcean = true;
	definition.surface.hasIceCaps = true;
	definition.surface.hasVolcanism = true;
	return definition;
}

describe('canonical surface material semantics', () => {
	test('SurfaceRenderProfile consumes the same derived material influences', () => {
		const definition = createDefinition();
		const semantics = createSurfaceMaterialSemantics(definition);
		const profile = createSurfaceRenderProfile(
			definition,
			createPlanetRenderProfile(definition),
		);

		expect(profile.waterInfluence).toBe(semantics.waterInfluence);
		expect(profile.iceInfluence).toBe(semantics.iceInfluence);
		expect(profile.lavaInfluence).toBe(semantics.lavaInfluence);
		expect(profile.toxicInfluence).toBe(semantics.toxicInfluence);
		expect(profile.metalInfluence).toBe(semantics.metalInfluence);
		expect(profile.rockInfluence).toBe(semantics.rockInfluence);
		expect(profile.organicInfluence).toBe(semantics.organicInfluence);
	});

	test('keeps class gates authoritative', () => {
		const definition = createDefinition();
		definition.class = 'toxic';
		const toxic = createSurfaceMaterialSemantics(definition);
		expect(toxic.waterInfluence).toBe(0);
		expect(toxic.toxicInfluence).toBe(1);
		expect(toxic.organicInfluence).toBe(0);

		definition.class = 'metal_rich';
		const metal = createSurfaceMaterialSemantics(definition);
		expect(metal.metalInfluence).toBe(1);
	});
});
