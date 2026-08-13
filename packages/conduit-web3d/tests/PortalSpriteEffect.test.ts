import {
	afterAll,
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';
import * as THREE from 'three';

import { PortalSpriteEffect } from '../src/effects';
import { installTestCanvasDocument } from './TestCanvasDocument';

let restoreCanvasDocument: () => void;

beforeAll(() => {
	restoreCanvasDocument = installTestCanvasDocument();
});

afterAll(() => {
	restoreCanvasDocument();
});

describe('PortalSpriteEffect', () => {
	test('creates the halo, swirl, and core with the configured colors', () => {
		const effect = createPortal();
		const halo = getSprite(effect, 'Test Portal Halo');
		const swirl = getSprite(effect, 'Test Portal Swirl');
		const core = getSprite(effect, 'Test Portal Core');

		expect(effect.group.children).toHaveLength(3);
		expect(halo.material.color.getHex()).toBe(0x65dfff);
		expect(swirl.material.color.getHex()).toBe(0x65dfff);
		expect(core.material.color.getHex()).toBe(0xc8fbff);
		expect(halo.scale.x).toBeGreaterThan(swirl.scale.x);
		expect(swirl.scale.x).toBeGreaterThan(core.scale.x);

		effect.dispose();
	});

	test('updates selection opacity and animation state', () => {
		const effect = createPortal();
		const halo = getSprite(effect, 'Test Portal Halo');
		const swirl = getSprite(effect, 'Test Portal Swirl');
		const core = getSprite(effect, 'Test Portal Core');
		const initialHaloRotation = halo.material.rotation;
		const initialSwirlRotation = swirl.material.rotation;

		expect(halo.material.opacity).toBe(0.38);
		expect(swirl.material.opacity).toBe(0.86);
		expect(core.material.opacity).toBe(0.92);

		effect.setSelected(true);
		effect.update(0.5);

		expect(halo.material.opacity).toBe(0.62);
		expect(swirl.material.opacity).toBe(1.0);
		expect(core.material.opacity).toBe(1.0);
		expect(halo.material.rotation).toBeLessThan(initialHaloRotation);
		expect(swirl.material.rotation).toBeGreaterThan(initialSwirlRotation);

		effect.dispose();
	});

	test('disposes its owned sprite materials and textures', () => {
		const effect = createPortal();
		const halo = getSprite(effect, 'Test Portal Halo');
		const texture = halo.material.map;
		let materialDisposeCount = 0;
		let textureDisposeCount = 0;

		halo.material.addEventListener('dispose', () => {
			materialDisposeCount++;
		});
		texture?.addEventListener('dispose', () => {
			textureDisposeCount++;
		});

		effect.dispose();

		expect(materialDisposeCount).toBe(1);
		expect(textureDisposeCount).toBe(1);
	});
});

function createPortal(): PortalSpriteEffect {
	return new PortalSpriteEffect({
		name: 'Test Portal',
		radius: 2,
		color: 0x65dfff,
		accent: 0xc8fbff,
	});
}

function getSprite(
	effect: PortalSpriteEffect,
	name: string,
): THREE.Sprite {
	const sprite = effect.group.getObjectByName(name);

	if (!(sprite instanceof THREE.Sprite)) {
		throw new Error(`Expected sprite ${name}.`);
	}

	return sprite;
}
