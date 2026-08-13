import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { AssetPromiseCache, cloneObject3D } from '../src/assets';

describe('AssetPromiseCache', () => {
	test('reuses an in-flight and resolved object promise', async () => {
		const cache = new AssetPromiseCache();
		const source = new THREE.Group();
		let loadCount = 0;
		const load = async () => {
			loadCount++;
			return source;
		};

		const first = cache.loadObject('ship', load);
		const second = cache.loadObject('ship', load);

		expect(first).toBe(second);
		expect(await first).toBe(source);
		expect(await cache.loadObject('ship', load)).toBe(source);
		expect(loadCount).toBe(1);
	});

	test('evicts a rejected load so it can be retried', async () => {
		const cache = new AssetPromiseCache();
		const source = new THREE.Group();
		let loadCount = 0;
		const load = async () => {
			loadCount++;
			if (loadCount === 1) {
				throw new Error('temporary failure');
			}
			return source;
		};

		await expect(cache.loadObject('ship', load)).rejects.toThrow(
			'temporary failure',
		);
		expect(await cache.loadObject('ship', load)).toBe(source);
		expect(loadCount).toBe(2);
	});

	test('supports independent instances cloned from the cached template', async () => {
		const cache = new AssetPromiseCache();
		const source = new THREE.Group();
		source.add(new THREE.Object3D());
		const template = await cache.loadObject('ship', async () => source);
		const first = cloneObject3D(template);
		const second = cloneObject3D(template);

		expect(first).not.toBe(second);
		expect(first.children[0]).not.toBe(second.children[0]);
		expect(first.children).toHaveLength(1);
		expect(second.children).toHaveLength(1);
	});
});
