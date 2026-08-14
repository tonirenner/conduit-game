import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV3,
} from './PlanetInstancedCubeSphereDebugV3';

export type {
	PlanetInstancedColorMode,
	PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV3';

type TerrainRuntime = THREE.Object3D;

type InternalGpuState = {
	root: THREE.Group;
	signature: string;
};

type InternalRenderer = {
	activeState: InternalGpuState | null;
	forceRebuild: boolean;
	sourceMeshes: number;
	retireOldStates(): void;
	collectVisibleSources(terrain: TerrainRuntime): unknown[];
	createSignature(sources: unknown[]): string;
	resetPending(): void;
	hideSources(sources: unknown[]): void;
	advancePending(signature: string, now: number): boolean;
	buildGpuState(sources: unknown[], signature: string): unknown | null;
	swapGpuState(terrain: TerrainRuntime, nextState: unknown, now: number): void;
};

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v4.
 *
 * V3 intentionally fell back to the original patch meshes while a new
 * instanced snapshot was being debounced. In motion that means the renderer
 * repeatedly alternates between two independently rendered terrain paths,
 * which is visible as flicker and occasional partial-patch frames.
 *
 * V4 changes only that lifecycle rule:
 * - the current instanced snapshot stays visible while worker LOD churns;
 * - current source patch meshes remain hidden while a snapshot exists;
 * - a replacement is built completely and atomically swapped in;
 * - the original patch path is used only before the very first snapshot exists.
 *
 * The atlas, material, stitch grouping and delayed GPU retirement remain the
 * exact V3 implementation so this stays a narrow A/B fix.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV3 {
	override update(terrain: TerrainRuntime): void {
		const state = this as unknown as InternalRenderer;
		state.retireOldStates();

		const sources = state.collectVisibleSources(terrain);
		state.sourceMeshes = sources.length;

		if (sources.length === 0) {
			state.resetPending();
			if (state.activeState) state.activeState.root.visible = true;
			return;
		}

		const now = performance.now();
		const signature = state.createSignature(sources);
		const activeMatches =
			!state.forceRebuild && state.activeState?.signature === signature;

		if (activeMatches) {
			state.activeState!.root.visible = true;
			state.resetPending();
			state.hideSources(sources);
			return;
		}

		// Keep the last known-good instanced snapshot on screen while the worker
		// quadtree settles. Do not bounce through the patch renderer between
		// snapshots; that transition was the visible flicker in V3.
		if (state.activeState) {
			state.activeState.root.visible = true;
			state.hideSources(sources);
		}

		const shouldBuild =
			!state.activeState ||
			state.forceRebuild ||
			state.advancePending(signature, now);

		if (!shouldBuild) return;

		const nextState = state.buildGpuState(sources, signature);
		if (!nextState) return;

		state.swapGpuState(terrain, nextState, now);
		state.hideSources(sources);
	}
}
