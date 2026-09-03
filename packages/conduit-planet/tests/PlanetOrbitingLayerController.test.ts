import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { generatePlanetDefinition } from '../src/generation';
import { createPlanetRenderProfile } from '../src/rendering/PlanetRenderProfile';
import { PlanetOrbitingLayerController } from '../src/runtime/PlanetOrbitingLayerController';

describe('planet orbiting layer controller', () => {
	test('creates no orbiting layers without a planet definition', () => {
		const parent = new THREE.Group();
		const controller = new PlanetOrbitingLayerController({
			parent,
			radius: 1,
			rendererKind: 'solid_surface',
			definition: null,
			renderProfile: null,
			moonSystemEnabled: true,
		});

		expect(parent.children).toHaveLength(0);
		controller.update(1);
		controller.setRingVisibility(false);
		controller.setMoonVisibility(false);
		controller.dispose();
	});

	test('owns ring construction and debug visibility through the canonical runtime profile', () => {
		const definition = generatePlanetDefinition(75110, {
			forcePlanetClass: 'terrestrial',
			forceRings: true,
			semiMajorAxis: 1,
			starIrradiance: 1,
		});
		definition.moons = [];
		const renderProfile = createPlanetRenderProfile(definition);
		const parent = new THREE.Group();
		const controller = new PlanetOrbitingLayerController({
			parent,
			radius: 1,
			rendererKind: renderProfile.rendererKind,
			definition,
			renderProfile,
			moonSystemEnabled: false,
		});

		const ringGroup = parent.getObjectByName('RingSystemLayer');

		expect(ringGroup).toBeDefined();
		expect(parent.getObjectByName('MoonSystemLayer')).toBeUndefined();

		controller.setRingVisibility(false);
		expect(ringGroup?.visible).toBe(false);

		controller.setRingVisibility(true);
		expect(ringGroup?.visible).toBe(true);

		controller.update(1);
		controller.dispose();
	});
});
