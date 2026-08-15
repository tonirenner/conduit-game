import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV10,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats as PlanetInstancedCubeSphereStatsV10,
} from './PlanetInstancedCubeSphereDebugV10';

export type { PlanetInstancedColorMode };

export type PlanetInstancedCubeSphereStats = PlanetInstancedCubeSphereStatsV10 & {
	visibleStitchGroups: number;
	totalStitchGroups: number;
	stitchGroupLimit: number | null;
};

type GpuStateRuntime = {
	root: THREE.Group;
};

type V7Runtime = {
	activeState: GpuStateRuntime | null;
};

/**
 * Feature-Lab v11: stitch-group raster/overdraw isolation.
 *
 * The topology and GPU state are built exactly as in v10. This version only
 * toggles visibility of the already-created stitch-group draw meshes, so the
 * test does not trigger atlas rebuilds or topology work when the limit changes.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV10 {
	private stitchGroupLimit: number | null = null;

	setStitchGroupLimit(limit: number | null): void {
		const next = limit == null || !Number.isFinite(limit)
			? null
			: Math.max(1, Math.floor(limit));
		if (this.stitchGroupLimit === next) return;
		this.stitchGroupLimit = next;
		this.applyStitchGroupVisibility();
	}

	override update(terrain: THREE.Object3D): void {
		super.update(terrain);
		this.applyStitchGroupVisibility();
	}

	override getStats(): PlanetInstancedCubeSphereStats {
		const base = super.getStats();
		const runtime = this as unknown as V7Runtime;
		const children = runtime.activeState?.root.children ?? [];
		const visible = children.reduce(
			(count, child) => count + (child.visible ? 1 : 0),
			0,
		);

		return {
			...base,
			drawMeshes: visible,
			visibleStitchGroups: visible,
			totalStitchGroups: children.length || base.stitchGroups,
			stitchGroupLimit: this.stitchGroupLimit,
		};
	}

	private applyStitchGroupVisibility(): void {
		const runtime = this as unknown as V7Runtime;
		const root = runtime.activeState?.root;
		if (!root) return;

		const limit = this.stitchGroupLimit ?? root.children.length;
		for (let i = 0; i < root.children.length; i++) {
			root.children[i].visible = i < limit;
		}
	}
}
