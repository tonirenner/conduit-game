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

type TerrainRuntime = THREE.Object3D;

type PatchSource = {
	mesh: THREE.Mesh;
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
	geometryAtlasTexture: THREE.DataTexture;
	colorAtlasTexture: THREE.DataTexture;
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

const REBUILD_DEBOUNCE_MS = 120;
const MAX_REBUILD_INTERVAL_MS = 400;
const MIN_STABLE_FRAMES = 2;
const RETIRE_GPU_FRAMES = 4;

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v3.
 *
 * V3 keeps the exact worker-generated sphereNormal data from V2 but changes
 * the resource lifetime completely:
 * - LOD churn is debounced instead of rebuilding on every worker completion.
 * - A complete replacement snapshot is built before it is attached.
 * - The old snapshot is swapped out atomically and disposed a few frames later.
 * - While a new snapshot is pending, production patch meshes render as a safe
 *   fallback instead of showing stale/missing instanced geometry.
 */
export class PlanetInstancedCubeSphereDebug {
	private activeState: GpuState | null = null;
	private readonly retiredStates: RetiredGpuState[] = [];
	private readonly sourceVisibility = new Map<THREE.Mesh, boolean>();
	private readonly indexSignatureCache = new WeakMap<THREE.BufferGeometry, string>();

	private pendingSignature = '';
	private pendingSinceMs = 0;
	private pendingStableFrames = 0;
	private lastBuildMs = 0;
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

		const sources = this.collectVisibleSources(terrain);
		this.sourceMeshes = sources.length;

		if (sources.length === 0) {
			this.resetPending();
			return;
		}

		const now = performance.now();
		const signature = this.createSignature(sources);
		const activeMatches =
			!this.forceRebuild && this.activeState?.signature === signature;

		if (activeMatches) {
			this.activeState!.root.visible = true;
			this.resetPending();
			this.hideSources(sources);
			return;
		}

		// Never render a stale instanced snapshot over a changing worker LOD.
		// The original patch meshes remain visible until a replacement snapshot
		// is completely built and swapped in.
		if (this.activeState) this.activeState.root.visible = false;

		const shouldBuild =
			!this.activeState ||
			this.forceRebuild ||
			this.advancePending(signature, now);

		if (!shouldBuild) return;

		const nextState = this.buildGpuState(sources, signature);
		if (!nextState) return;

		this.swapGpuState(terrain, nextState, now);
		this.hideSources(sources);
	}

	setColorMode(mode: PlanetInstancedColorMode): void {
		if (this.colorMode === mode) return;
		this.colorMode = mode;
		this.forceRebuild = true;
		this.resetPending();
	}

	setHeightDisplacementEnabled(enabled: boolean): void {
		if (this.heightDisplacement === enabled) return;
		this.heightDisplacement = enabled;
		this.forceRebuild = true;
		this.resetPending();
	}

	detach(): void {
		this.restoreSourceVisibility();
		this.resetPending();
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

	private collectVisibleSources(terrain: TerrainRuntime): PatchSource[] {
		const meshes: Array<{ mesh: THREE.Mesh; stitchKey: string; key: string }> = [];

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (!object.visible) return;
			if (!(object.parent?.name.startsWith('TerrainPatch L') ?? false)) return;
			if (!object.geometry.index) return;

			const sphereNormal = object.geometry.getAttribute('sphereNormal');
			const displacement = object.geometry.getAttribute('terrainDisplacement');
			const sourceColor = object.geometry.getAttribute('color');
			if (!sphereNormal || !displacement || !sourceColor) return;

			const stitchKey = this.createIndexSignature(object.geometry);
			const key = [
				object.uuid,
				object.geometry.id,
				sphereNormal.version,
				displacement.version,
				sourceColor.version,
				stitchKey,
			].join(':');

			meshes.push({ mesh: object, stitchKey, key });
		});

		// Traversal order can change while the quadtree mutates. Stable sorting
		// prevents rebuilds caused only by ordering differences.
		meshes.sort((a, b) => a.key.localeCompare(b.key));

		return meshes.map((source, atlasIndex) => ({
			...source,
			atlasIndex,
		}));
	}

	private advancePending(signature: string, now: number): boolean {
		if (signature !== this.pendingSignature) {
			this.pendingSignature = signature;
			this.pendingSinceMs = now;
			this.pendingStableFrames = 1;
		} else {
			this.pendingStableFrames++;
		}

		const stableLongEnough =
			this.pendingStableFrames >= MIN_STABLE_FRAMES &&
			now - this.pendingSinceMs >= REBUILD_DEBOUNCE_MS;
		const maxWaitExceeded = now - this.lastBuildMs >= MAX_REBUILD_INTERVAL_MS;

		return stableLongEnough || maxWaitExceeded;
	}

	private resetPending(): void {
		this.pendingSignature = '';
		this.pendingSinceMs = 0;
		this.pendingStableFrames = 0;
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
		const geometryPixels = new Float32Array(atlasWidth * atlasHeight * 4);
		const colorPixels = new Float32Array(atlasWidth * atlasHeight * 4);

		for (const source of sources) {
			this.writePatchToAtlases(
				source,
				rowSize,
				atlasColumns,
				atlasWidth,
				geometryPixels,
				colorPixels,
			);
		}

		const geometryAtlas = this.createFloatAtlas(
			geometryPixels,
			atlasWidth,
			atlasHeight,
			'PlanetInstancedCubeSphereGeometryAtlas',
		);
		const colorAtlas = this.createFloatAtlas(
			colorPixels,
			atlasWidth,
			atlasHeight,
			'PlanetInstancedCubeSphereColorAtlas',
		);
		const material = this.createMaterial(geometryAtlas, colorAtlas);
		const root = new THREE.Group();
		root.name = 'PlanetInstancedCubeSphereDebug';
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
			mesh.name = `PlanetInstancedCubeSphere:${group.key}`;
			mesh.frustumCulled = false;
			root.add(mesh);
		}

		if (root.children.length === 0) {
			material.dispose();
			geometryAtlas.dispose();
			colorAtlas.dispose();
			return null;
		}

		return {
			root,
			geometryAtlasTexture: geometryAtlas,
			colorAtlasTexture: colorAtlas,
			material,
			signature,
			drawMeshes: root.children.length,
			stitchGroups: groups.size,
			atlasSize: `${atlasWidth}x${atlasHeight}`,
		};
	}

	private swapGpuState(
		terrain: TerrainRuntime,
		nextState: GpuState,
		now: number,
	): void {
		const previous = this.activeState;

		terrain.add(nextState.root);
		nextState.root.visible = true;
		this.activeState = nextState;
		this.lastBuildMs = now;
		this.rebuilds++;
		this.forceRebuild = false;
		this.resetPending();

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

	private writePatchToAtlases(
		source: PatchSource,
		rowSize: number,
		atlasColumns: number,
		atlasWidth: number,
		geometryPixels: Float32Array,
		colorPixels: Float32Array,
	): void {
		const sphereNormal = source.mesh.geometry.getAttribute('sphereNormal');
		const displacement = source.mesh.geometry.getAttribute('terrainDisplacement');
		const sourceColor = source.mesh.geometry.getAttribute('color');
		const tileX = source.atlasIndex % atlasColumns;
		const tileY = Math.floor(source.atlasIndex / atlasColumns);

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				const vertexIndex = x + y * rowSize;
				const atlasX = tileX * rowSize + x;
				const atlasY = tileY * rowSize + y;
				const target = (atlasX + atlasY * atlasWidth) * 4;

				geometryPixels[target + 0] = sphereNormal.getX(vertexIndex);
				geometryPixels[target + 1] = sphereNormal.getY(vertexIndex);
				geometryPixels[target + 2] = sphereNormal.getZ(vertexIndex);
				geometryPixels[target + 3] = displacement.getX(vertexIndex);

				colorPixels[target + 0] = sourceColor.getX(vertexIndex);
				colorPixels[target + 1] = sourceColor.getY(vertexIndex);
				colorPixels[target + 2] = sourceColor.getZ(vertexIndex);
				colorPixels[target + 3] = 1;
			}
		}
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
		}

		geometry.setAttribute(
			'iAtlasRect',
			new THREE.InstancedBufferAttribute(atlasRect, 4),
		);
		geometry.instanceCount = group.sources.length;
		geometry.computeBoundingSphere();
		return geometry;
	}

	private createMaterial(
		geometryAtlas: THREE.DataTexture,
		colorAtlas: THREE.DataTexture,
	): THREE.Material {
		const material = new MeshBasicNodeMaterial({
			transparent: false,
			depthWrite: true,
			depthTest: true,
		});
		material.name = `PlanetInstancedCubeSphereMaterial:${this.colorMode}:${this.heightDisplacement ? 'height' : 'flat-radius'}`;

		const patchUv = attribute('patchUv', 'vec2');
		const atlasRect = attribute('iAtlasRect', 'vec4');
		const atlasUv = atlasRect.xy.add(patchUv.mul(atlasRect.zw));
		const geometrySample = texture(geometryAtlas, atlasUv);
		const sphereNormalVertex = normalize(geometrySample.xyz);
		const displacement = this.heightDisplacement ? geometrySample.w : float(0);

		material.positionNode = sphereNormalVertex.mul(
			float(this.planetRadius).add(displacement),
		);

		const sphereNormal = vertexStage(sphereNormalVertex);
		const colorSample = texture(colorAtlas, atlasUv).xyz;
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
			this.sourceVisibility.set(source.mesh, source.mesh.visible);
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
		state.geometryAtlasTexture.dispose();
		state.colorAtlasTexture.dispose();
	}
}