import * as THREE from 'three';
import type { Planet } from '@conduit/planet/rendering';

type TerrainRuntime = THREE.Object3D & {
	updateLOD?: (cameraPosition: THREE.Vector3) => void;
};

type MeshMaterial = THREE.Material | THREE.Material[];

export type PlanetLodPerformanceIsolationState = {
	freezeLod: boolean;
	simpleMaterial: boolean;
	atmosphereOff: boolean;
};

/**
 * Feature-Lab-only performance isolation for the planet renderer.
 *
 * This intentionally avoids changing production Planet/CubeSphere APIs:
 * - Freeze LOD shadows only PlanetTerrain.updateLOD while all other Planet
 *   updates continue normally.
 * - Simple Material replaces only CubeSphere terrain mesh materials and
 *   restores the original shared surface material afterwards.
 * - Atmosphere Off uses Planet's existing debug layer visibility API.
 */
export class PlanetLodPerformanceIsolation {
	private planet: Planet | null = null;
	private state: PlanetLodPerformanceIsolationState = {
		freezeLod: false,
		simpleMaterial: false,
		atmosphereOff: false,
	};
	private frozenTerrain: TerrainRuntime | null = null;
	private originalUpdateLod: TerrainRuntime['updateLOD'] | null = null;
	private originalMaterials = new WeakMap<THREE.Mesh, MeshMaterial>();
	private readonly simpleMaterial = new THREE.MeshBasicMaterial({
		color: 0xc65f20,
		depthTest: true,
		depthWrite: true,
	});

	attach(planet: Planet): void {
		this.detach();
		this.planet = planet;
		this.applyAtmosphereState();
		this.applyLodFreeze();
		this.applySimpleMaterial();
	}

	detach(): void {
		this.restoreLodUpdate();
		this.restoreMaterials();
		this.planet?.setDebugLayerVisibility({ atmosphere: true });
		this.planet = null;
		this.originalMaterials = new WeakMap<THREE.Mesh, MeshMaterial>();
	}

	update(): void {
		// New async LOD children can appear after Planet.update(). Re-apply the
		// cheap material before the frame is rendered so they never fall back to
		// the production surface shader during the isolation test.
		if (this.state.simpleMaterial) {
			this.applySimpleMaterial();
		}

		if (this.state.freezeLod) {
			this.applyLodFreeze();
		}
	}

	setFreezeLod(enabled: boolean): void {
		this.state.freezeLod = enabled;
		if (enabled) this.applyLodFreeze();
		else this.restoreLodUpdate();
	}

	setSimpleMaterial(enabled: boolean): void {
		this.state.simpleMaterial = enabled;
		if (enabled) this.applySimpleMaterial();
		else this.restoreMaterials();
	}

	setAtmosphereOff(enabled: boolean): void {
		this.state.atmosphereOff = enabled;
		this.applyAtmosphereState();
	}

	getState(): PlanetLodPerformanceIsolationState {
		return { ...this.state };
	}

	dispose(): void {
		this.detach();
		this.simpleMaterial.dispose();
	}

	private getTerrain(): TerrainRuntime | null {
		return (
			this.planet?.group.getObjectByName('PlanetTerrain') as TerrainRuntime | undefined
		) ?? null;
	}

	private applyLodFreeze(): void {
		if (!this.state.freezeLod) return;
		const terrain = this.getTerrain();
		if (!terrain || typeof terrain.updateLOD !== 'function') return;
		if (this.frozenTerrain === terrain) return;

		this.restoreLodUpdate();
		this.frozenTerrain = terrain;
		this.originalUpdateLod = terrain.updateLOD;
		terrain.updateLOD = () => {};
	}

	private restoreLodUpdate(): void {
		if (this.frozenTerrain && this.originalUpdateLod) {
			this.frozenTerrain.updateLOD = this.originalUpdateLod;
		}
		this.frozenTerrain = null;
		this.originalUpdateLod = null;
	}

	private applySimpleMaterial(): void {
		if (!this.state.simpleMaterial) return;
		const terrain = this.getTerrain();
		if (!terrain) return;

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (!this.originalMaterials.has(object)) {
				this.originalMaterials.set(object, object.material);
			}
			object.material = this.simpleMaterial;
		});
	}

	private restoreMaterials(): void {
		const terrain = this.getTerrain();
		if (!terrain) return;

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const original = this.originalMaterials.get(object);
			if (original) object.material = original;
		});
	}

	private applyAtmosphereState(): void {
		this.planet?.setDebugLayerVisibility({
			atmosphere: !this.state.atmosphereOff,
		});
	}
}
