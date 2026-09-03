import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
	applyPlanetDebugLayerVisibility,
} from '../src/runtime/PlanetDebugVisibility';

describe('planet debug visibility routing', () => {
	test('routes object visibility and orbiting-layer callbacks independently', () => {
		const surface = new THREE.Group();
		const atmosphere = new THREE.Group();
		const clouds = new THREE.Group();
		const gasLayer = new THREE.Group();
		const nearSurfaceTerrain = new THREE.Group();
		const toxicHaze = new THREE.Group();
		let ringsVisible: boolean | null = null;
		let moonsVisible: boolean | null = null;

		applyPlanetDebugLayerVisibility(
			{
				surface: false,
				atmosphere: false,
				clouds: false,
				gasLayer: false,
				rings: false,
				moons: true,
				nearSurfaceTerrain: false,
				toxicHaze: false,
			},
			{
				surface: [surface],
				atmosphere: [atmosphere],
				clouds: [clouds],
				gasLayer,
				nearSurfaceTerrain,
				toxicHaze,
				setRingVisibility: (visible) => {
					ringsVisible = visible;
				},
				setMoonVisibility: (visible) => {
					moonsVisible = visible;
				},
			},
		);

		expect(surface.visible).toBe(false);
		expect(atmosphere.visible).toBe(false);
		expect(clouds.visible).toBe(false);
		expect(gasLayer.visible).toBe(false);
		expect(nearSurfaceTerrain.visible).toBe(false);
		expect(toxicHaze.visible).toBe(false);
		expect(ringsVisible).toBe(false);
		expect(moonsVisible).toBe(true);
	});

	test('leaves unspecified targets untouched', () => {
		const surface = new THREE.Group();
		const atmosphere = new THREE.Group();
		atmosphere.visible = false;

		applyPlanetDebugLayerVisibility(
			{surface: false},
			{
				surface: [surface],
				atmosphere: [atmosphere],
				clouds: [],
			},
		);

		expect(surface.visible).toBe(false);
		expect(atmosphere.visible).toBe(false);
	});
});
