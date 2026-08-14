import * as THREE from 'three';
import type { Planet } from '@conduit/planet/rendering';
import { createPlanetOrbitSurfaceNodeMaterial } from '@conduit/planet/rendering';
import {
	PlanetInstancedCubeSphereDebug,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV2';

export type { PlanetInstancedColorMode };

type TerrainRuntime = THREE.Object3D & {
	updateLOD?: (cameraPosition: THREE.Vector3) => void;
};

type MeshMaterial = THREE.Material | THREE.Material[];

export type PlanetLodTerrainMaterialMode = 'production' | 'orbit' | 'simple';
export type PlanetLodTerrainRendererMode = 'patches' | 'batched' | 'instanced';

export type PlanetLodPerformanceIsolationState = {
	freezeLod: boolean;
	terrainMaterial: PlanetLodTerrainMaterialMode;
	terrainRenderer: PlanetLodTerrainRendererMode;
	instancedColorMode: PlanetInstancedColorMode;
	instancedHeightDisplacement: boolean;
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
 * - Batched mode remains as the first failed A/B reference.
 * - Instanced mode mirrors visible worker/quadtree leaves into a shared-grid
 *   InstancedBufferGeometry renderer grouped only by stitch/index variant.
 * - Instanced color mode isolates fragment atlas sampling from vertex-stage
 *   sampling/interpolation and a flat baseline.
 * - Instanced height displacement can be disabled independently to isolate
 *   geometry-atlas/vertex displacement cost.
 * - Atmosphere Off uses Planet's existing debug layer visibility API.
 */
export class PlanetLodPerformanceIsolation {
	private planet: Planet | null = null;
	private state: PlanetLodPerformanceIsolationState = {
		freezeLod: false,
		terrainMaterial: 'production',
		terrainRenderer: 'patches',
		instancedColorMode: 'fragment-atlas',
		instancedHeightDisplacement: true,
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
	private readonly instancedRenderer: PlanetInstancedCubeSphereDebug;
	private batchMesh: THREE.BatchedMesh | null = null;
	private batchSignature = '';
	private batchSourceVisibility = new Map<THREE.Mesh, boolean>();
	private batchSourceCount = 0;
	private batchRebuilds = 0;
	private readonly identityMatrix = new THREE.Matrix4();

	constructor(planetRadius = 3) {
		this.orbitMaterial = createPlanetOrbitSurfaceNodeMaterial(
			planetRadius,
		) as THREE.Material;
		this.instancedRenderer = new PlanetInstancedCubeSphereDebug(planetRadius);
		this.instancedRenderer.setColorMode(this.state.instancedColorMode);
		this.instancedRenderer.setHeightDisplacementEnabled(
			this.state.instancedHeightDisplacement,
		);
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
		this.instancedRenderer.detach();
		this.restoreLodUpdate();
		this.restoreMaterials();
		this.planet?.setDebugLayerVisibility({ atmosphere: true });
		this.planet = null;
		this.originalMaterials = new WeakMap<THREE.Mesh, MeshMaterial>();
	}

	/**
	 * Alternate renderers hide production patch meshes after Planet.update().
	 * Restore them before the next update so the existing LOD/horizon-culling
	 * code remains the sole authority for leaf visibility.
	 */
	beforePlanetUpdate(): void {
		this.restoreBatchSourceVisibility();
		this.instancedRenderer.beforePlanetUpdate();
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

		if (this.state.terrainRenderer === 'instanced') {
			this.restoreBatchSourceVisibility();
			this.destroyBatchMesh();
			const terrain = this.getTerrain();
			if (terrain && this.state.terrainMaterial !== 'production') {
				this.instancedRenderer.update(terrain);
			} else {
				this.instancedRenderer.detach();
			}
			return;
		}

		this.instancedRenderer.detach();

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
		this.instancedRenderer.detach();
		this.restoreMaterials();
		this.state.terrainMaterial = mode;
		this.applyTerrainMaterial();
	}

	setTerrainRenderer(mode: PlanetLodTerrainRendererMode): void {
		if (this.state.terrainRenderer === mode) return;
		this.restoreBatchSourceVisibility();
		this.destroyBatchMesh();
		this.instancedRenderer.detach();
		this.state.terrainRenderer = mode;
		if (mode === 'batched') this.applyTerrainBatch();
	}

	setInstancedColorMode(mode: PlanetInstancedColorMode): void {
		if (this.state.instancedColorMode === mode) return;
		this.state.instancedColorMode = mode;
		this.instancedRenderer.setColorMode(mode);
	}

	setInstancedHeightDisplacement(enabled: boolean): void {
		if (this.state.instancedHeightDisplacement === enabled) return;
		this.state.instancedHeightDisplacement = enabled;
		this.instancedRenderer.setHeightDisplacementEnabled(enabled);
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

	getInstancedStats(): PlanetInstancedCubeSphereStats {
		return this.instancedRenderer.getStats();
	}

	dispose(): void {
		this.detach();
		this.instancedRenderer.dispose();
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

		for (const mesh of meshes) {
			const geometry = this.createBatchGeometry(mesh.geometry);
			const geometryId = batch.addGeometry(geometry);
			const instanceId = batch.addInstance(geometryId);
			batch.setMatrixAt(instanceId, this.identityMatrix);
			geometry.dispose();
		}

		terrain.add(batch);
		this.batchMesh = batch;
		this.batchSignature = signature;
		this.batchRebuilds++;
	}

	private createBatchGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
		const geometry = source.clone();
		const patchOrigin = geometry.getAttribute('patchOrigin');

		if (patchOrigin) {
			geometry.setAttribute(
				'patchOrigin',
				new THREE.Float32BufferAttribute(
					new Float32Array(patchOrigin.count * 3),
					3,
				),
			);
		}

		return geometry;
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
