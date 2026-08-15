import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV12,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats as PlanetInstancedCubeSphereStatsV12,
} from './PlanetInstancedCubeSphereDebugV12';

export type { PlanetInstancedColorMode };

export type PlanetInstancedCubeSphereStats = PlanetInstancedCubeSphereStatsV12 & {
	gpuStateFrozen: boolean;
};

type GpuStateRuntime = {
	root: THREE.Group;
};

type V7Runtime = {
	activeState: GpuStateRuntime | null;
};

/**
 * Feature-Lab v13: complete instanced GPU-state freeze isolation.
 *
 * When the existing "Freeze LOD updates" checkbox is enabled and a valid
 * instanced GPU state already exists, the renderer deliberately skips the
 * complete v7-v12 update chain. That means no topology traversal/snapshot,
 * no leaf sorting, no signature generation, no atlas decision and no rebuild.
 *
 * The already-created InstancedBufferGeometry, material and atlas are rendered
 * unchanged. Source patch meshes also remain hidden while frozen so we do not
 * need to rediscover them every frame merely to hide them again.
 *
 * Unchecking Freeze LOD restores the normal lifecycle on the next frame.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV12 {
	override beforePlanetUpdate(): void {
		if (this.isGpuStateFreezeActive()) return;
		super.beforePlanetUpdate();
	}

	override update(terrain: THREE.Object3D): void {
		const runtime = this as unknown as V7Runtime;
		if (this.isGpuStateFreezeRequested() && runtime.activeState) {
			runtime.activeState.root.visible = true;
			return;
		}

		super.update(terrain);
	}

	override getStats(): PlanetInstancedCubeSphereStats {
		return {
			...super.getStats(),
			gpuStateFrozen: this.isGpuStateFreezeActive(),
		};
	}

	private isGpuStateFreezeActive(): boolean {
		return this.isGpuStateFreezeRequested()
			&& Boolean((this as unknown as V7Runtime).activeState);
	}

	private isGpuStateFreezeRequested(): boolean {
		return document.querySelector<HTMLInputElement>('[data-freeze-lod]')?.checked ?? false;
	}
}
