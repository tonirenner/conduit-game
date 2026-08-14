import * as THREE from 'three';

import { CachedTerrainSource } from '../../CachedTerrainSource';
import {
	TerrainPatch,
	type CubeFace,
	type PatchBounds,
} from '../../TerrainPatch';
import type { TerrainSource } from '../../TerrainSource';

/**
 * Runtime view of TerrainPatch's constructor state.
 *
 * TerrainPatch predates asynchronous terrain generation and keeps these fields
 * private. Keeping the async bridge in one small class lets us prove the worker
 * handoff without destabilising the mature LOD/stitching implementation. Once
 * the path is proven, these dependencies can be promoted to protected fields.
 */
type TerrainPatchRuntime = {
	face: CubeFace;
	bounds: PatchBounds;
	radius: number;
	resolution: number;
	material: THREE.Material;
	terrainSource: TerrainSource;
	level: number;
	useGpuVertexDisplacement: boolean;
	terrainHeightScale: number;
	mesh: THREE.Mesh;
	childrenPatches: TerrainPatch[];
};

export class AsyncTerrainPatch extends TerrainPatch {
	private splitPending = false;
	private splitRequestId = 0;
	private disposedAsyncPatch = false;

	override split(): void {
		const state = this.runtimeState();

		if (
			this.disposedAsyncPatch ||
			this.splitPending ||
			state.childrenPatches.length > 0
		) {
			return;
		}

		const childBounds = this.createChildBounds(state.bounds);

		// Bootstrap levels remain synchronous so a newly created planet has a
		// complete low-detail shell immediately. Dynamic refinement starts at L2.
		if (
			state.level < 2 ||
			!(state.terrainSource instanceof CachedTerrainSource)
		) {
			this.installChildren(childBounds);
			return;
		}

		this.requestAsyncSplit(
			state.terrainSource,
			childBounds,
			state.level,
		);
	}

	override canSplit(maxLevel: number): boolean {
		const state = this.runtimeState();
		return !this.disposedAsyncPatch &&
		       !this.splitPending &&
		       state.childrenPatches.length === 0 &&
		       state.level < maxLevel;
	}

	override disposeDeep(): void {
		this.disposedAsyncPatch = true;
		this.splitRequestId++;
		this.splitPending = false;
		super.disposeDeep();
	}

	isSplitPending(): boolean {
		return this.splitPending;
	}

	private requestAsyncSplit(
		terrainSource: CachedTerrainSource,
		childBounds: PatchBounds[],
		level: number,
	): void {
		this.splitPending = true;
		const requestId = ++this.splitRequestId;

		void Promise.all(
			childBounds.map((bounds, index) =>
				terrainSource.requestPatchGrid(
					this.runtimeState().face,
					bounds,
					this.runtimeState().resolution,
					10_000 + level * 100 - index,
				),
			),
		).then(() => {
			if (
				this.disposedAsyncPatch ||
				requestId !== this.splitRequestId ||
				this.runtimeState().childrenPatches.length > 0
			) {
				return;
			}

			this.installChildren(childBounds);
		}).catch((error) => {
			if (
				requestId !== this.splitRequestId ||
				this.disposedAsyncPatch
			) {
				return;
			}

			if (
				typeof window !== 'undefined' &&
				new URLSearchParams(window.location.search).get('lodDebug') === '1'
			) {
				console.warn('[Terrain async split] worker prefetch failed', {
					patch: this.name,
					error,
				});
			}
		}).finally(() => {
			if (requestId === this.splitRequestId) {
				this.splitPending = false;
			}
		});
	}

	private installChildren(childBounds: PatchBounds[]): void {
		const state = this.runtimeState();

		if (
			this.disposedAsyncPatch ||
			state.childrenPatches.length > 0
		) {
			return;
		}

		const children: AsyncTerrainPatch[] = [];

		for (const bounds of childBounds) {
			children.push(new AsyncTerrainPatch(
				state.face,
				bounds,
				state.radius,
				state.resolution,
				state.material,
				state.terrainSource,
				state.level + 1,
				state.useGpuVertexDisplacement,
				state.terrainHeightScale,
			));
		}

		// Only swap visibility after every child geometry exists. The parent
		// therefore covers the surface for the entire worker wait and build step.
		for (const child of children) {
			state.childrenPatches.push(child);
			this.add(child);
		}

		state.mesh.visible = false;
	}

	private createChildBounds(bounds: PatchBounds): PatchBounds[] {
		const half = bounds.size / 2;

		return [
			{
				x: bounds.x,
				y: bounds.y,
				size: half,
			},
			{
				x: bounds.x + half,
				y: bounds.y,
				size: half,
			},
			{
				x: bounds.x,
				y: bounds.y + half,
				size: half,
			},
			{
				x: bounds.x + half,
				y: bounds.y + half,
				size: half,
			},
		];
	}

	private runtimeState(): TerrainPatchRuntime {
		return this as unknown as TerrainPatchRuntime;
	}
}
