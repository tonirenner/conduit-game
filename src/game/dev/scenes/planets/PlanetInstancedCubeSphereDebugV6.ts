import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
	attribute,
	color,
	dot,
	float,
	max,
	mix,
	normalize,
	pow,
	smoothstep,
	texture,
	uniform,
	vertexStage,
} from 'three/tsl';
import type { CubeFace, PatchBounds } from '@conduit/planet';

export type PlanetInstancedColorMode = 'fragment-atlas' | 'vertex-rgb' | 'flat';

export type PlanetInstancedCubeSphereStats = {
	active: boolean;
	sourceMeshes: number;
	drawMeshes: number;
	stitchGroups: number;
	rebuilds: number;
	atlasSize: string;
	colorMode: PlanetInstancedColorMode;
	heightDisplacement: boolean;
};

type TerrainRuntime = THREE.Object3D;

type PatchRuntime = THREE.Group & {
	face: CubeFace;
	bounds: PatchBounds;
	level: number;
	patchAddress?: { id: string };
	isSplitPending?: () => boolean;
};

type PatchSource = {
	mesh: THREE.Mesh;
	face: CubeFace;
	bounds: PatchBounds;
	level: number;
	atlasIndex: number;
	stitchKey: string;
	key: string;
};

type StitchGroup = {
	key: string;
	sources: PatchSource[];
	representative: THREE.BufferGeometry;
};

type GpuState = {
	root: THREE.Group;
	terrainAtlasTexture: THREE.DataTexture;
	material: THREE.Material;
	signature: string;
	drawMeshes: number;
	stitchGroups: number;
	atlasSize: string;
};

type RetiredGpuState = {
	state: GpuState;
	framesLeft: number;
};

type TopologySnapshot = {
	sources: PatchSource[];
	pendingSplits: number;
};

const TOPOLOGY_SETTLE_MS = 140;
const TOPOLOGY_STABLE_FRAMES = 3;
const RETIRE_GPU_FRAMES = 4;

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v6.
 *
 * This is the first metadata-driven GPU geometry step inspired by the
 * procedural-planet approach: patch vertices no longer need a baked
 * sphereNormal texture. Each instance carries only the CubeFace basis and
 * patch bounds; the vertex shader reconstructs the cube point and normalizes
 * it onto the sphere.
 *
 * Height and color intentionally stay worker-derived for this iteration so
 * geometry reconstruction can be measured in isolation. They share one RGBA
 * float atlas: RGB = color, A = radial displacement.
 *
 * The stable full-leaf topology / atomic-snapshot rules from v5 are retained:
 * a previous complete snapshot remains visible until the next topology is
 * settled, built completely and swapped in one frame.
 */
export class PlanetInstancedCubeSphereDebug {
	private activeState: GpuState | null = null;
	private readonly retiredStates: RetiredGpuState[] = [];
	private readonly sourceVisibility = new Map<THREE.Mesh, boolean>();
	private readonly indexSignatureCache = new WeakMap<THREE.BufferGeometry, string>();

	private topologySignature = '';
	private topologyStableFrames = 0;
	private topologyReadySinceMs = 0;
	private forceRebuild = false;

	private sourceMeshes = 0;
	private rebuilds = 0;
	private colorMode: PlanetInstancedColorMode = 'fragment-atlas';
	private heightDisplacement = true;

	constructor(private readonly planetRadius: number) {}

	beforePlanetUpdate(): void {
		this.restoreSourceVisibility();
	}

	update(terrain: TerrainRuntime): void {
		this.retireOldStates();

		const topology = this.collectTopologySnapshot(terrain);
		const sources = topology.sources;
		this.sourceMeshes = sources.length;

		if (sources.length === 0) {
			this.resetTopologyCandidate();
			if (this.activeState) this.activeState.root.visible = true;
			return;
		}

		const now = performance.now();
		const signature = this.createSignature(sources);
		const activeMatches =
			!this.forceRebuild && this.activeState?.signature === signature;

		if (activeMatches) {
			this.activeState!.root.visible = true;
			this.resetTopologyCandidate();
			this.hideSources(sources);
			return;
		}

		// Always keep the last complete instanced sphere visible while a newer
		// worker topology settles. Never expose a transient leaf generation.
		if (this.activeState) {
			this.activeState.root.visible = true;
			this.hideSources(sources);
		}

		const shouldBuild =
			!this.activeState ||
			this.forceRebuild ||
			this.isTopologySettled(signature, now, topology.pendingSplits);

		if (!shouldBuild) return;

		const nextState = this.buildGpuState(sources, signature);
		if (!nextState) return;

		this.swapGpuState(terrain, nextState);
		this.resetTopologyCandidate();
		this.hideSources(sources);
	}

	setColorMode(mode: PlanetInstancedColorMode): void {
		if (this.colorMode === mode) return;
		this.colorMode = mode;
		this.forceRebuild = true;
		this.resetTopologyCandidate();
	}

	setHeightDisplacementEnabled(enabled: boolean): void {
		if (this.heightDisplacement === enabled) return;
		this.heightDisplacement = enabled;
		this.forceRebuild = true;
		this.resetTopologyCandidate();
	}

	detach(): void {
		this.restoreSourceVisibility();
		this.resetTopologyCandidate();
		this.forceRebuild = false;

		if (this.activeState) {
			this.disposeGpuState(this.activeState);
			this.activeState = null;
		}

		for (const retired of this.retiredStates) {
			this.disposeGpuState(retired.state);
		}
		this.retiredStates.length = 0;
		this.sourceMeshes = 0;
	}

	dispose(): void {
		this.detach();
	}

	getStats(): PlanetInstancedCubeSphereStats {
		return {
			active: Boolean(this.activeState?.root.visible),
			sourceMeshes: this.sourceMeshes,
			drawMeshes: this.activeState?.drawMeshes ?? 0,
			stitchGroups: this.activeState?.stitchGroups ?? 0,
			rebuilds: this.rebuilds,
			atlasSize: this.activeState?.atlasSize ?? '0x0',
			colorMode: this.colorMode,
			heightDisplacement: this.heightDisplacement,
		};
	}

	private collectTopologySnapshot(terrain: TerrainRuntime): TopologySnapshot {
		const leaves: Array<Omit<PatchSource, 'atlasIndex'>> = [];
		let pendingSplits = 0;

		terrain.traverse((object) => {
			if (!this.isTerrainPatchGroup(object)) return;

			const patch = object as PatchRuntime;
			if (patch.isSplitPending?.()) pendingSplits++;

			const hasPatchChildren = patch.children.some((child) =>
				this.isTerrainPatchGroup(child),
			);
			if (hasPatchChildren) return;

			const mesh = patch.children.find(
				(child): child is THREE.Mesh => child instanceof THREE.Mesh,
			);
			if (!mesh?.geometry.index) return;

			const displacement = mesh.geometry.getAttribute('terrainDisplacement');
			const sourceColor = mesh.geometry.getAttribute('color');
			if (!displacement || !sourceColor) return;

			const face = patch.face;
			const bounds = patch.bounds;
			if (!face?.normal || !face?.right || !face?.up || !bounds) return;

			const stitchKey = this.createIndexSignature(mesh.geometry);
			const address = patch.patchAddress?.id ?? [
				`n${this.vectorKey(face.normal)}`,
				`l${patch.level}`,
				`x${bounds.x.toFixed(6)}`,
				`y${bounds.y.toFixed(6)}`,
				`s${bounds.size.toFixed(6)}`,
			].join('/');
			const key = [
				address,
				displacement.version,
				sourceColor.version,
				stitchKey,
			].join(':');

			leaves.push({
				mesh,
				face,
				bounds: { ...bounds },
				level: patch.level,
				stitchKey,
				key,
			});
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

	private buildGpuState(
		sources: PatchSource[],
		signature: string,
	): GpuState | null {
		const firstPosition = sources[0]?.mesh.geometry.getAttribute('position');
		if (!firstPosition) return null;

		const rowSize = Math.round(Math.sqrt(firstPosition.count));
		if (rowSize < 2 || rowSize * rowSize !== firstPosition.count) return null;

		const atlasColumns = Math.ceil(Math.sqrt(sources.length));
		const atlasRows = Math.ceil(sources.length / atlasColumns);
		const atlasWidth = atlasColumns * rowSize;
		const atlasHeight = atlasRows * rowSize;
		const terrainPixels = new Float32Array(atlasWidth * atlasHeight * 4);

		for (const source of sources) {
			if (!this.writePatchToTerrainAtlas(
				source,
				rowSize,
				atlasColumns,
				atlasWidth,
				terrainPixels,
			)) {
				return null;
			}
		}

		const terrainAtlas = this.createFloatAtlas(
			terrainPixels,
			atlasWidth,
			atlasHeight,
			'PlanetInstancedCubeSphereTerrainAtlasV6',
		);
		const material = this.createMaterial(terrainAtlas);
		const root = new THREE.Group();
		root.name = 'PlanetInstancedCubeSphereDebugV6';
		root.visible = false;

		const groups = this.groupByStitchVariant(sources);
		for (const group of groups.values()) {
			const geometry = this.createInstancedGeometry(
				group,
				rowSize,
				atlasColumns,
				atlasRows,
			);
			if (!geometry) continue;

			const mesh = new THREE.Mesh(geometry, material);
			mesh.name = `PlanetInstancedCubeSphereV6:${group.key}`;
			mesh.frustumCulled = false;
			root.add(mesh);
		}

		if (root.children.length === 0) {
			material.dispose();
			terrainAtlas.dispose();
			return null;
		}

		return {
			root,
			terrainAtlasTexture: terrainAtlas,
			material,
			signature,
			drawMeshes: root.children.length,
			stitchGroups: groups.size,
			atlasSize: `${atlasWidth}x${atlasHeight}`,
		};
	}

	private writePatchToTerrainAtlas(
		source: PatchSource,
		rowSize: number,
		atlasColumns: number,
		atlasWidth: number,
		terrainPixels: Float32Array,
	): boolean {
		const displacement = source.mesh.geometry.getAttribute('terrainDisplacement');
		const sourceColor = source.mesh.geometry.getAttribute('color');
		const vertexCount = rowSize * rowSize;
		if (!displacement || !sourceColor) return false;
		if (displacement.count !== vertexCount || sourceColor.count !== vertexCount) {
			return false;
		}

		const tileX = source.atlasIndex % atlasColumns;
		const tileY = Math.floor(source.atlasIndex / atlasColumns);

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				const vertexIndex = x + y * rowSize;
				const atlasX = tileX * rowSize + x;
				const atlasY = tileY * rowSize + y;
				const target = (atlasX + atlasY * atlasWidth) * 4;

				terrainPixels[target + 0] = sourceColor.getX(vertexIndex);
				terrainPixels[target + 1] = sourceColor.getY(vertexIndex);
				terrainPixels[target + 2] = sourceColor.getZ(vertexIndex);
				terrainPixels[target + 3] = displacement.getX(vertexIndex);
			}
		}
		return true;
	}

	private createInstancedGeometry(
		group: StitchGroup,
		rowSize: number,
		atlasColumns: number,
		atlasRows: number,
	): THREE.InstancedBufferGeometry | null {
		const representativeIndex = group.representative.index;
		if (!representativeIndex) return null;

		const vertexCount = rowSize * rowSize;
		const position = new Float32Array(vertexCount * 3);
		const patchUv = new Float32Array(vertexCount * 2);

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				const index = x + y * rowSize;
				patchUv[index * 2 + 0] = x / Math.max(1, rowSize - 1);
				patchUv[index * 2 + 1] = y / Math.max(1, rowSize - 1);
			}
		}

		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
		geometry.setAttribute('patchUv', new THREE.BufferAttribute(patchUv, 2));
		geometry.setIndex(representativeIndex.clone());

		const atlasRect = new Float32Array(group.sources.length * 4);
		const faceNormal = new Float32Array(group.sources.length * 3);
		const faceRight = new Float32Array(group.sources.length * 3);
		const faceUp = new Float32Array(group.sources.length * 3);
		const bounds = new Float32Array(group.sources.length * 3);

		for (let i = 0; i < group.sources.length; i++) {
			const source = group.sources[i];
			const tileX = source.atlasIndex % atlasColumns;
			const tileY = Math.floor(source.atlasIndex / atlasColumns);

			atlasRect.set([
				(tileX * rowSize + 0.5) / (atlasColumns * rowSize),
				(tileY * rowSize + 0.5) / (atlasRows * rowSize),
				(rowSize - 1) / (atlasColumns * rowSize),
				(rowSize - 1) / (atlasRows * rowSize),
			], i * 4);
			faceNormal.set(source.face.normal.toArray(), i * 3);
			faceRight.set(source.face.right.toArray(), i * 3);
			faceUp.set(source.face.up.toArray(), i * 3);
			bounds.set([
				source.bounds.x,
				source.bounds.y,
				source.bounds.size,
			], i * 3);
		}

		geometry.setAttribute(
			'iAtlasRect',
			new THREE.InstancedBufferAttribute(atlasRect, 4),
		);
		geometry.setAttribute(
			'iFaceNormal',
			new THREE.InstancedBufferAttribute(faceNormal, 3),
		);
		geometry.setAttribute(
			'iFaceRight',
			new THREE.InstancedBufferAttribute(faceRight, 3),
		);
		geometry.setAttribute(
			'iFaceUp',
			new THREE.InstancedBufferAttribute(faceUp, 3),
		);
		geometry.setAttribute(
			'iBounds',
			new THREE.InstancedBufferAttribute(bounds, 3),
		);
		geometry.instanceCount = group.sources.length;
		return geometry;
	}

	private createMaterial(terrainAtlas: THREE.DataTexture): THREE.Material {
		const material = new MeshBasicNodeMaterial({
			transparent: false,
			depthWrite: true,
			depthTest: true,
		});
		material.name = `PlanetInstancedCubeSphereMaterialV6:${this.colorMode}:${this.heightDisplacement ? 'height' : 'flat-radius'}`;

		const patchUv = attribute('patchUv', 'vec2');
		const atlasRect = attribute('iAtlasRect', 'vec4');
		const faceNormal = attribute('iFaceNormal', 'vec3');
		const faceRight = attribute('iFaceRight', 'vec3');
		const faceUp = attribute('iFaceUp', 'vec3');
		const bounds = attribute('iBounds', 'vec3');

		const cubeX = bounds.x.add(patchUv.x.mul(bounds.z));
		const cubeY = bounds.y.add(patchUv.y.mul(bounds.z));
		const sphereNormalVertex = normalize(
			faceNormal
				.add(faceRight.mul(cubeX))
				.add(faceUp.mul(cubeY)),
		);
		const atlasUv = atlasRect.xy.add(patchUv.mul(atlasRect.zw));
		const terrainSample = texture(terrainAtlas, atlasUv);
		const displacement = this.heightDisplacement ? terrainSample.w : float(0);

		material.positionNode = sphereNormalVertex.mul(
			float(this.planetRadius).add(displacement),
		);

		const sphereNormal = vertexStage(sphereNormalVertex);
		const colorSample = terrainSample.xyz;
		const baseColor =
			this.colorMode === 'flat'
				? color(0xc58b4f)
				: this.colorMode === 'vertex-rgb'
					? vertexStage(colorSample)
					: colorSample;

		const sunDirection = uniform(
			new THREE.Vector3(0.72, 0.34, 0.60).normalize(),
		);
		const ndl = dot(sphereNormal, sunDirection);
		const day = smoothstep(-0.20, 0.40, ndl);
		const direct = pow(max(ndl, 0.0), 0.72);
		const dayColor = baseColor.mul(float(0.46).add(direct.mul(1.02)));
		const nightColor = baseColor.mul(0.24).add(color(0x07121e).mul(0.12));

		material.colorNode = mix(nightColor, dayColor, day).mul(1.22);
		material.toneMapped = false;
		return material as unknown as THREE.Material;
	}

	private groupByStitchVariant(sources: PatchSource[]): Map<string, StitchGroup> {
		const groups = new Map<string, StitchGroup>();
		for (const source of sources) {
			let group = groups.get(source.stitchKey);
			if (!group) {
				group = {
					key: source.stitchKey,
					sources: [],
					representative: source.mesh.geometry,
				};
				groups.set(source.stitchKey, group);
			}
			group.sources.push(source);
		}
		return groups;
	}

	private createFloatAtlas(
		pixels: Float32Array,
		width: number,
		height: number,
		name: string,
	): THREE.DataTexture {
		const atlas = new THREE.DataTexture(
			pixels,
			width,
			height,
			THREE.RGBAFormat,
			THREE.FloatType,
		);
		atlas.name = name;
		atlas.minFilter = THREE.LinearFilter;
		atlas.magFilter = THREE.LinearFilter;
		atlas.wrapS = THREE.ClampToEdgeWrapping;
		atlas.wrapT = THREE.ClampToEdgeWrapping;
		atlas.generateMipmaps = false;
		atlas.needsUpdate = true;
		return atlas;
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

	private swapGpuState(terrain: TerrainRuntime, nextState: GpuState): void {
		const previous = this.activeState;
		terrain.add(nextState.root);
		nextState.root.visible = true;
		this.activeState = nextState;
		this.rebuilds++;
		this.forceRebuild = false;

		if (previous) {
			previous.root.visible = false;
			previous.root.removeFromParent();
			this.retiredStates.push({
				state: previous,
				framesLeft: RETIRE_GPU_FRAMES,
			});
		}
	}

	private retireOldStates(): void {
		for (let i = this.retiredStates.length - 1; i >= 0; i--) {
			const retired = this.retiredStates[i];
			retired.framesLeft--;
			if (retired.framesLeft > 0) continue;
			this.disposeGpuState(retired.state);
			this.retiredStates.splice(i, 1);
		}
	}

	private createIndexSignature(geometry: THREE.BufferGeometry): string {
		const cached = this.indexSignatureCache.get(geometry);
		if (cached) return cached;

		const index = geometry.index;
		if (!index) return 'none';

		let hash = 2166136261;
		for (let i = 0; i < index.count; i++) {
			hash ^= index.getX(i) | 0;
			hash = Math.imul(hash, 16777619);
		}
		const signature = `${index.count}:${hash >>> 0}`;
		this.indexSignatureCache.set(geometry, signature);
		return signature;
	}

	private createSignature(sources: PatchSource[]): string {
		return sources.map((source) => source.key).join('|');
	}

	private hideSources(sources: PatchSource[]): void {
		for (const source of sources) {
			if (!this.sourceVisibility.has(source.mesh)) {
				this.sourceVisibility.set(source.mesh, source.mesh.visible);
			}
			source.mesh.visible = false;
		}
	}

	private restoreSourceVisibility(): void {
		for (const [mesh, visible] of this.sourceVisibility) {
			mesh.visible = visible;
		}
		this.sourceVisibility.clear();
	}

	private disposeGpuState(state: GpuState): void {
		for (const child of state.root.children) {
			if (child instanceof THREE.Mesh) child.geometry.dispose();
		}
		state.root.removeFromParent();
		state.root.clear();
		state.material.dispose();
		state.terrainAtlasTexture.dispose();
	}

	private isTerrainPatchGroup(object: THREE.Object3D): object is PatchRuntime {
		return object instanceof THREE.Group && object.name.startsWith('TerrainPatch L');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${vector.x.toFixed(0)},${vector.y.toFixed(0)},${vector.z.toFixed(0)}`;
	}
}
