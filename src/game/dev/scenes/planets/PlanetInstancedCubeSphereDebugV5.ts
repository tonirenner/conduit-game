import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV4,
} from './PlanetInstancedCubeSphereDebugV4';

export type {
	PlanetInstancedColorMode,
	PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV4';

type TerrainRuntime = THREE.Object3D;

type PatchSource = {
	mesh: THREE.Mesh;
	atlasIndex: number;
	stitchKey: string;
	key: string;
};

type InternalGpuState = {
	root: THREE.Group;
	signature: string;
};

type InternalRenderer = {
	activeState: InternalGpuState | null;
	forceRebuild: boolean;
	sourceMeshes: number;
	retireOldStates(): void;
	createIndexSignature(geometry: THREE.BufferGeometry): string;
	createSignature(sources: PatchSource[]): string;
	hideSources(sources: PatchSource[]): void;
	buildGpuState(sources: PatchSource[], signature: string): unknown | null;
	swapGpuState(terrain: TerrainRuntime, nextState: unknown, now: number): void;
};

type TopologySnapshot = {
	sources: PatchSource[];
	pendingSplits: number;
};

const TOPOLOGY_SETTLE_MS = 140;
const TOPOLOGY_STABLE_FRAMES = 3;

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v5.
 *
 * V4 removed the visible flicker by keeping the previous instanced snapshot
 * alive while the worker quadtree changed. It still built snapshots from only
 * the currently visible patch meshes, though. Horizon culling can change that
 * set as the camera moves, so a stale snapshot may contain literal wedges of
 * the sphere and look like an incomplete generation.
 *
 * V5 snapshots the logical quadtree leaves instead:
 * - horizon/frustum visibility no longer changes snapshot membership;
 * - an AsyncTerrainPatch stays a leaf while its split is pending;
 * - installChildren() installs all four children synchronously before hiding
 *   the parent, so every collected topology snapshot covers the whole sphere;
 * - replacements are only accepted after no async split is pending and the
 *   topology signature has stayed unchanged for a short settle window;
 * - there is deliberately no max-wait forced swap.
 *
 * The active V4 snapshot remains visible until the settled replacement has
 * been built completely and atomically swapped in.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV4 {
	private topologySignature = '';
	private topologyStableFrames = 0;
	private topologyReadySinceMs = 0;

	override update(terrain: TerrainRuntime): void {
		const state = this as unknown as InternalRenderer;
		state.retireOldStates();

		const topology = this.collectTopologySnapshot(terrain, state);
		const sources = topology.sources;
		state.sourceMeshes = sources.length;

		if (sources.length === 0) {
			this.resetTopologyCandidate();
			if (state.activeState) state.activeState.root.visible = true;
			return;
		}

		const now = performance.now();
		const signature = state.createSignature(sources);
		const activeMatches =
			!state.forceRebuild && state.activeState?.signature === signature;

		if (activeMatches) {
			state.activeState!.root.visible = true;
			this.resetTopologyCandidate();
			state.hideSources(sources);
			return;
		}

		// The previous snapshot is always a complete sphere in V5, so it is safe
		// to keep rendering it while workers prepare a more detailed topology.
		if (state.activeState) {
			state.activeState.root.visible = true;
			state.hideSources(sources);
		}

		const shouldBuild =
			!state.activeState ||
			state.forceRebuild ||
			this.isTopologySettled(
				signature,
				now,
				topology.pendingSplits,
			);

		if (!shouldBuild) return;

		const nextState = state.buildGpuState(sources, signature);
		if (!nextState) return;

		state.swapGpuState(terrain, nextState, now);
		this.resetTopologyCandidate();
		state.hideSources(sources);
	}

	override detach(): void {
		this.resetTopologyCandidate();
		super.detach();
	}

	private collectTopologySnapshot(
		terrain: TerrainRuntime,
		state: InternalRenderer,
	): TopologySnapshot {
		const leaves: Array<{
			mesh: THREE.Mesh;
			stitchKey: string;
			key: string;
		}> = [];
		let pendingSplits = 0;

		terrain.traverse((object) => {
			if (!this.isTerrainPatchGroup(object)) return;

			const patch = object as THREE.Group & {
				isSplitPending?: () => boolean;
			};

			if (patch.isSplitPending?.()) pendingSplits++;

			const hasPatchChildren = patch.children.some((child) =>
				this.isTerrainPatchGroup(child),
			);
			if (hasPatchChildren) return;

			const mesh = patch.children.find(
				(child): child is THREE.Mesh => child instanceof THREE.Mesh,
			);
			if (!mesh?.geometry.index) return;

			const sphereNormal = mesh.geometry.getAttribute('sphereNormal');
			const displacement = mesh.geometry.getAttribute('terrainDisplacement');
			const sourceColor = mesh.geometry.getAttribute('color');
			if (!sphereNormal || !displacement || !sourceColor) return;

			const stitchKey = state.createIndexSignature(mesh.geometry);
			const key = [
				mesh.uuid,
				mesh.geometry.id,
				sphereNormal.version,
				displacement.version,
				sourceColor.version,
				stitchKey,
			].join(':');

			leaves.push({ mesh, stitchKey, key });
		});

		leaves.sort((a, b) => a.key.localeCompare(b.key));

		return {
			sources: leaves.map((source, atlasIndex) => ({
				...source,
				atlasIndex,
			})),
			pendingSplits,
		};
	}

	private isTopologySettled(
		signature: string,
		now: number,
		pendingSplits: number,
	): boolean {
		if (signature !== this.topologySignature) {
			this.topologySignature = signature;
			this.topologyStableFrames = 1;
			this.topologyReadySinceMs = 0;
		} else {
			this.topologyStableFrames++;
		}

		if (pendingSplits > 0) {
			this.topologyReadySinceMs = 0;
			return false;
		}

		if (this.topologyReadySinceMs === 0) {
			this.topologyReadySinceMs = now;
			return false;
		}

		return (
			this.topologyStableFrames >= TOPOLOGY_STABLE_FRAMES &&
			now - this.topologyReadySinceMs >= TOPOLOGY_SETTLE_MS
		);
	}

	private resetTopologyCandidate(): void {
		this.topologySignature = '';
		this.topologyStableFrames = 0;
		this.topologyReadySinceMs = 0;
	}

	private isTerrainPatchGroup(object: THREE.Object3D): boolean {
		return object instanceof THREE.Group && object.name.startsWith('TerrainPatch L');
	}
}
