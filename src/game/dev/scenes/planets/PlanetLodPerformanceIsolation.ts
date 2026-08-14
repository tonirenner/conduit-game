import * as THREE from 'three';
import type { Planet } from '@conduit/planet/rendering';
import { createPlanetOrbitSurfaceNodeMaterial } from '@conduit/planet/rendering';

type TerrainRuntime = THREE.Object3D & {
	updateLOD?: (cameraPosition: THREE.Vector3) => void;
};

type MeshMaterial = THREE.Material | THREE.Material[];

export type PlanetLodTerrainMaterialMode = 'production' | 'orbit' | 'simple';
export type PlanetLodTerrainRendererMode = 'patches' | 'batched';

export type PlanetLodPerformanceIsolationState = {
	freezeLod: boolean;
	terrainMaterial: PlanetLodTerrainMaterialMode;
	terrainRenderer: PlanetLodTerrainRendererMode;
	atmosphereOff: boolean;
};

export type PlanetLodTerrainBatchStats = {
	active: boolean;
	sourceMeshes: number;
	batches: number;
	rebuilds: number;
};

/**
 * Feature-Lab-only performance isolation for the planet renderer.
 *
 * This intentionally avoids changing production Planet/CubeSphere APIs:
 * - Freeze LOD shadows only PlanetTerrain.updateLOD while all other Planet
 *   updates continue normally.
 * - Terrain material can switch between production, the lightweight orbit
 *   shader and a MeshBasicMaterial baseline.
 * - Batched mode mirrors the currently visible terrain patch meshes into a
 *   THREE.BatchedMesh so we can measure draw-call overhead without replacing
 *   the production quadtree / worker architecture.
 * - Atmosphere Off uses Planet's existing debug layer visibility API.
 */
export class PlanetLodPerformanceIsolation {
	private planet: Planet | null = null;
	private state: PlanetLodPerformanceIsolationState = {
		freezeLod: false,
		terrainMaterial: 'production',
		terrainRenderer: 'patches',
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
	private readonly orbitMaterial: THREE.Material;
	private batchMesh: THREE.BatchedMesh | null = null;
	private batchSignature = '';
	private batchSourceVisibility = new Map<THREE.Mesh, boolean>();
	private batchSourceCount = 0;
	private batchRebuilds = 0;
	private readonly terrainInverseWorld = new THREE.Matrix4();
	private readonly instanceMatrix = new THREE.Matrix4();

	constructor(planetRadius = 3) {
		this.orbitMaterial = createPlanetOrbitSurfaceNodeMaterial(
			planetRadius,
		) as THREE.Material;
	}

	attach(planet: Planet): void {
		this.detach();
		this.planet = planet;
		this.applyAtmosphereState();
		this.applyLodFreeze();
		this.applyTerrainMaterial();
	}

	detach(): void {
		this.restoreBatchSourceVisibility();
		this.destroyBatchMesh();
		this.restoreLodUpdate();
		this.restoreMaterials();
		this.planet?.setDebugLayerVisibility({ atmosphere: true });
		this.planet = null;
		this.originalMaterials = new WeakMap<THREE.Mesh, MeshMaterial>();
	}

	/**
	 * Batched mode hides source meshes after Planet.update() so they do not
	 * render alongside the batch. Restore them before the next Planet.update()
	 * so the existing LOD / horizon-culling code still owns visibility state.
	 */
	beforePlanetUpdate(): void {
		this.restoreBatchSourceVisibility();
	}

	update(): void {
		// New async LOD children can appear after Planet.update(). Re-apply the
		// selected debug material before the frame is rendered.
		if (this.state.terrainMaterial !== 'production') {
			this.applyTerrainMaterial();
		}

		if (this.state.freezeLod) {
			this.applyLodFreeze();
		}

		if (this.state.terrainRenderer === 'batched') {
			this.applyTerrainBatch();
		} else {
			this.restoreBatchSourceVisibility();
			this.destroyBatchMesh();
		}
	}

	setFreezeLod(enabled: boolean): void {
		this.state.freezeLod = enabled;
		if (enabled) this.applyLodFreeze();
		else this.restoreLodUpdate();
	}

	setTerrainMaterial(mode: PlanetLodTerrainMaterialMode): void {
		if (this.state.terrainMaterial === mode) return;
		this.restoreBatchSourceVisibility();
		this.destroyBatchMesh();
		this.restoreMaterials();
		this.state.terrainMaterial = mode;
		this.applyTerrainMaterial();
	}

	setTerrainRenderer(mode: PlanetLodTerrainRendererMode): void {
		if (this.state.terrainRenderer === mode) return;
		this.restoreBatchSourceVisibility();
		this.destroyBatchMesh();
		this.state.terrainRenderer = mode;
		if (mode === 'batched') this.applyTerrainBatch();
	}

	setAtmosphereOff(enabled: boolean): void {
		this.state.atmosphereOff = enabled;
		this.applyAtmosphereState();
	}

	getState(): PlanetLodPerformanceIsolationState {
		return { ...this.state };
	}

	getBatchStats(): PlanetLodTerrainBatchStats {
		return {
			active: Boolean(this.batchMesh),
			sourceMeshes: this.batchSourceCount,
			batches: this.batchMesh ? 1 : 0,
			rebuilds: this.batchRebuilds,
		};
	}

	dispose(): void {
		this.detach();
		this.simpleMaterial.dispose();
		this.orbitMaterial.dispose();
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

	private applyTerrainMaterial(): void {
		if (this.state.terrainMaterial === 'production') return;
		const terrain = this.getTerrain();
		if (!terrain) return;

		const material = this.getDebugTerrainMaterial();
		if (!material) return;

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (object === this.batchMesh) return;
			if (!this.isTerrainPatchMesh(object)) return;
			if (!this.originalMaterials.has(object)) {
				this.originalMaterials.set(object, object.material);
			}
			object.material = material;
		});
	}

	private restoreMaterials(): void {
		const terrain = this.getTerrain();
		if (!terrain) return;

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (object === this.batchMesh) return;
			const original = this.originalMaterials.get(object);
			if (original) object.material = original;
		});

		this.originalMaterials = new WeakMap<THREE.Mesh, MeshMaterial>();
	}

	private applyTerrainBatch(): void {
		const terrain = this.getTerrain();
		const material = this.getDebugTerrainMaterial();

		// The production material still owns patch-local morph/uniform behavior.
		// Keep this first A/B test intentionally limited to the debug materials.
		if (!terrain || !material || this.state.terrainMaterial === 'production') {
			this.restoreBatchSourceVisibility();
			this.destroyBatchMesh();
			return;
		}

		terrain.updateWorldMatrix(true, true);
		const visibleMeshes: THREE.Mesh[] = [];

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (object === this.batchMesh) return;
			if (!this.isTerrainPatchMesh(object)) return;
			if (!object.visible) return;
			visibleMeshes.push(object);
		});

		this.batchSourceCount = visibleMeshes.length;

		if (visibleMeshes.length === 0) {
			this.destroyBatchMesh();
			return;
		}

		const signature = this.createBatchSignature(visibleMeshes, material);
		if (!this.batchMesh || signature !== this.batchSignature) {
			this.rebuildBatch(terrain, visibleMeshes, material, signature);
		}

		for (const mesh of visibleMeshes) {
			this.batchSourceVisibility.set(mesh, mesh.visible);
			mesh.visible = false;
		}
	}

	private rebuildBatch(
		terrain: TerrainRuntime,
		meshes: THREE.Mesh[],
		material: THREE.Material,
		signature: string,
	): void {
		this.destroyBatchMesh();

		let vertexCount = 0;
		let indexCount = 0;

		for (const mesh of meshes) {
			const geometry = mesh.geometry;
			vertexCount += geometry.getAttribute('position')?.count ?? 0;
			indexCount += geometry.index?.count ?? 0;
		}

		if (vertexCount <= 0 || indexCount <= 0) return;

		const batch = new THREE.BatchedMesh(
			meshes.length,
			vertexCount,
			indexCount,
			material,
		);
		batch.name = 'PlanetTerrainBatchDebug';
		batch.frustumCulled = false;
		batch.perObjectFrustumCulled = false;
		batch.sortObjects = false;

		terrain.updateWorldMatrix(true, false);
		this.terrainInverseWorld.copy(terrain.matrixWorld).invert();

		for (const mesh of meshes) {
			mesh.updateWorldMatrix(true, false);
			const geometryId = batch.addGeometry(mesh.geometry);
			const instanceId = batch.addInstance(geometryId);
			this.instanceMatrix.multiplyMatrices(
				this.terrainInverseWorld,
				mesh.matrixWorld,
			);
			batch.setMatrixAt(instanceId, this.instanceMatrix);
		}

		terrain.add(batch);
		this.batchMesh = batch;
		this.batchSignature = signature;
		this.batchRebuilds++;
	}

	private restoreBatchSourceVisibility(): void {
		for (const [mesh, visible] of this.batchSourceVisibility) {
			mesh.visible = visible;
		}
		this.batchSourceVisibility.clear();
	}

	private destroyBatchMesh(): void {
		if (!this.batchMesh) {
			this.batchSignature = '';
			return;
		}

		this.batchMesh.removeFromParent();
		this.batchMesh.dispose();
		this.batchMesh = null;
		this.batchSignature = '';
	}

	private createBatchSignature(
		meshes: THREE.Mesh[],
		material: THREE.Material,
	): string {
		return `${material.uuid}|${meshes.map((mesh) => {
			const index = mesh.geometry.index;
			return [
				mesh.uuid,
				mesh.geometry.id,
				mesh.geometry.getAttribute('position')?.count ?? 0,
				index?.count ?? 0,
				index?.version ?? 0,
			].join(':');
		}).join('|')}`;
	}

	private isTerrainPatchMesh(mesh: THREE.Mesh): boolean {
		return mesh.parent?.name.startsWith('TerrainPatch L') ?? false;
	}

	private getDebugTerrainMaterial(): THREE.Material | null {
		if (this.state.terrainMaterial === 'orbit') return this.orbitMaterial;
		if (this.state.terrainMaterial === 'simple') return this.simpleMaterial;
		return null;
	}

	private applyAtmosphereState(): void {
		this.planet?.setDebugLayerVisibility({
			atmosphere: !this.state.atmosphereOff,
		});
	}
}
