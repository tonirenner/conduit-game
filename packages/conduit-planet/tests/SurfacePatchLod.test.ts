import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_SURFACE_PATCH_LOD_CONFIG,
	planSurfacePatches,
} from '../src/rendering/surface/SurfacePatchLod';

describe('SurfacePatchLod', () => {
	test('keeps finest detail local instead of tessellating the full surface root', () => {
		const patches = planSurfacePatches(0, 0);
		const finest = patches.filter(
			(patch) => patch.depth === DEFAULT_SURFACE_PATCH_LOD_CONFIG.maxDepth,
		);

		expect(patches.length).toBeGreaterThan(0);
		expect(finest.length).toBeGreaterThan(0);
		expect(finest.length).toBeLessThan(patches.length);
		expect(patches.length).toBeLessThan(500);
	});

	test('produces deterministic stable cache keys', () => {
		const first = planSurfacePatches(12_345, -54_321).map((patch) => patch.key);
		const second = planSurfacePatches(12_345, -54_321).map((patch) => patch.key);

		expect(second).toEqual(first);
		expect(new Set(first).size).toBe(first.length);
	});

	test('moves fine detail with the camera without changing the global coverage', () => {
		const centered = planSurfacePatches(0, 0);
		const shifted = planSurfacePatches(600_000, 250_000);
		const rootHalfExtent = DEFAULT_SURFACE_PATCH_LOD_CONFIG.rootHalfExtentMeters;

		for (const patches of [centered, shifted]) {
			const minX = Math.min(...patches.map((patch) => patch.minX));
			const minZ = Math.min(...patches.map((patch) => patch.minZ));
			const maxX = Math.max(...patches.map((patch) => patch.maxX));
			const maxZ = Math.max(...patches.map((patch) => patch.maxZ));

			expect(minX).toBe(-rootHalfExtent);
			expect(minZ).toBe(-rootHalfExtent);
			expect(maxX).toBe(rootHalfExtent);
			expect(maxZ).toBe(rootHalfExtent);
		}
	});
});
