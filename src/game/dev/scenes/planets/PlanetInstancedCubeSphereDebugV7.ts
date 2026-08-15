import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
	abs,
	attribute,
	color,
	dot,
	float,
	max,
	mix,
	mx_noise_float,
	normalize,
	pow,
	smoothstep,
	texture,
	uniform,
	vec3,
	vertexStage,
} from 'three/tsl';
import type { CubeFace, PatchBounds } from '@conduit/planet/TerrainPatch';
import type { TerrainSeedConfig } from '@conduit/planet/terrain/noise';

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

type TerrainSourceRuntime = {
	terrainSeedConfig?: TerrainSeedConfig;
};

type TerrainRuntime = THREE.Object3D & {
	terrainHeightScale?: number;
	terrainSource?: TerrainSourceRuntime;
};

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

type TopologySnapshot = {
	sources: PatchSource[];
	pendingSplits: number;
};

const TOPOLOGY_SETTLE_MS = 140;
const TOPOLOGY_STABLE_FRAMES = 3;
const RETIRE_GPU_FRAMES = 4;

const FALLBACK_TERRAIN_CONFIG: TerrainSeedConfig = {
	seed: 1,
	profile: 'earthlike',
	continentOffset: new THREE.Vector3(19.1, -37.4, 61.7),
	ridgeOffset: new THREE.Vector3(-83.2, 47.6, 29.3),
	detailOffset: new THREE.Vector3(131.4, -71.8, 91.2),
	erosionOffset: new THREE.Vector3(),
	riverOffset: new THREE.Vector3(),
	continentScale: 1,
	coastScale: 1,
	mountainScale: 1,
	heightScale: 1,
	oceanBias: 0,
};

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v7.
 *
 * V6 proved metadata-driven CubeSphere reconstruction works and removed the
 * baked sphere-normal geometry atlas. V7 removes worker height data from the
 * render path as well: the vertex shader reconstructs the CubeSphere and
 * generates a lightweight seeded procedural relief directly on the GPU.
 *
 * Worker geometry remains authoritative for LOD topology, stitch indices and
 * the current debug color atlas. This intentionally keeps the experiment
 * isolated: one variable changes at a time, while the stable full-leaf
 * topology / atomic snapshot lifecycle from v5/v6 is retained.
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
	private terrainConfig: TerrainSeedConfig = FALLBACK_TERRAIN_CONFIG;
	private terrainHeightScale = 0;
	private terrainConfigSignature = '';

	constructor(private readonly planetRadius: number) {}

	beforePlanetUpdate(): void {
		this.restoreSourceVisibility();
	}

	update(terrain: TerrainRuntime): void {
		this.retireOldStates();
		this.syncTerrainConfig(terrain);

		const topology = this.collectTopologySnapshot(terrain);
		const sources = topology.sources;
		this.sourceMeshes = sources.length;

		if (sources.length === 0) {
			this.resetTopologyCandidate();
			if (this.activeState) this.activeState.root.visible = true;
			return;
		}

		const now = performance.now();
		const signature = `${this.terrainConfigSignature}|${this.createSignature(sources)}`;
		const activeMatches =
			!this.forceRebuild && this.activeState?.signature === signature;

		if (activeMatches) {
			this.activeState!.root.visible = true;
			this.resetTopologyCandidate();
			this.hideSources(sources);
			return;
		}

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

	private syncTerrainConfig(terrain: TerrainRuntime): void {
		const sourceConfig = terrain.terrainSource?.terrainSeedConfig;
		const nextConfig = sourceConfig ?? FALLBACK_TERRAIN_CONFIG;
		const nextHeightScale = Number.isFinite(terrain.terrainHeightScale)
			? Math.max(0, terrain.terrainHeightScale ?? 0)
			: 0;
		const nextSignature = [
			nextConfig.seed,
			nextConfig.profile,
			nextConfig.continentScale.toFixed(6),
			nextConfig.coastScale.toFixed(6),
			nextConfig.mountainScale.toFixed(6),
			nextConfig.heightScale.toFixed(6),
			nextConfig.oceanBias.toFixed(6),
			nextConfig.continentOffset.toArray().map((v) => v.toFixed(4)).join(','),
			nextConfig.ridgeOffset.toArray().map((v) => v.toFixed(4)).join(','),
			nextConfig.detailOffset.toArray().map((v) => v.toFixed(4)).join(','),
			nextHeightScale.toFixed(8),
		].join('|');

		if (nextSignature === this.terrainConfigSignature) return;
		this.terrainConfig = nextConfig;
		this.terrainHeightScale = nextHeightScale;
		this.terrainConfigSignature = nextSignature;
		this.forceRebuild = true;
		this.resetTopologyCandidate();
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

			const sourceColor = mesh.geometry.getAttribute('color');
			if (!sourceColor) return;

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
			const key = [address, sourceColor.version, stitchKey].join(':');

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
		const colorPixels = new Float32Array(atlasWidth * atlasHeight * 4);

		for (const source of sources) {
			if (!this.writePatchToColorAtlas(
				source,
				rowSize,
				atlasColumns,
				atlasWidth,
				colorPixels,
			)) {
				return null;
			}
		}

		const colorAtlas = this.createFloatAtlas(
			colorPixels,
			atlasWidth,
			atlasHeight,
			'PlanetInstancedCubeSphereColorAtlasV7',
		);
		const material = this.createMaterial(colorAtlas);
		const root = new THREE.Group();
		root.name = 'PlanetInstancedCubeSphereDebugV7';
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
			mesh.name = `PlanetInstancedCubeSphereV7:${group.key}`;
			mesh.frustumCulled = false;
			root.add(mesh);
		}

		if (root.children.length === 0) {
			material.dispose();
			colorAtlas.dispose();
			return null;
		}

		return {
			root,
			colorAtlasTexture: colorAtlas,
			material,
			signature,
			drawMeshes: root.children.length,
			stitchGroups: groups.size,
			atlasSize: `${atlasWidth}x${atlasHeight}`,
		};
	}

	private writePatchToColorAtlas(
		source: PatchSource,
		rowSize: number,
		atlasColumns: number,
		atlasWidth: number,
		colorPixels: Float32Array,
	): boolean {
		const sourceColor = source.mesh.geometry.getAttribute('color');
		const vertexCount = rowSize * rowSize;
		if (!sourceColor || sourceColor.count !== vertexCount) return false;

		const tileX = source.atlasIndex % atlasColumns;
		const tileY = Math.floor(source.atlasIndex / atlasColumns);

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				const vertexIndex = x + y * rowSize;
				const atlasX = tileX * rowSize + x;
				const atlasY = tileY * rowSize + y;
				const target = (atlasX + atlasY * atlasWidth) * 4;

				colorPixels[target + 0] = sourceColor.getX(vertexIndex);
				colorPixels[target + 1] = sourceColor.getY(vertexIndex);
				colorPixels[target + 2] = sourceColor.getZ(vertexIndex);
				colorPixels[target + 3] = 1;
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

	private createMaterial(colorAtlas: THREE.DataTexture): THREE.Material {
		const material = new MeshBasicNodeMaterial({
			transparent: false,
			depthWrite: true,
			depthTest: true,
		});
		material.name = `PlanetInstancedCubeSphereMaterialV7:${this.colorMode}:${this.heightDisplacement ? 'gpu-height' : 'flat-radius'}`;

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
		const displacement = this.heightDisplacement
			? this.createProceduralHeight(sphereNormalVertex)
			: float(0);

		material.positionNode = sphereNormalVertex.mul(
			float(this.planetRadius).add(displacement),
		);

		const sphereNormal = vertexStage(sphereNormalVertex);
		const atlasUv = atlasRect.xy.add(patchUv.mul(atlasRect.zw));
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

	private createProceduralHeight(direction: ReturnType<typeof normalize>) {
		const config = this.terrainConfig;
		const continentOffset = vec3(
			config.continentOffset.x,
			config.continentOffset.y,
			config.continentOffset.z,
		);
		const ridgeOffset = vec3(
			config.ridgeOffset.x,
			config.ridgeOffset.y,
			config.ridgeOffset.z,
		);
		const detailOffset = vec3(
			config.detailOffset.x,
			config.detailOffset.y,
			config.detailOffset.z,
		);

		const noise01 = (position: ReturnType<typeof vec3>) =>
			mx_noise_float(position).mul(0.5).add(0.5);
		const continentPosition = direction
			.mul(config.continentScale * 1.25)
			.add(continentOffset);
		const continent = noise01(continentPosition)
			.mul(0.57)
			.add(noise01(continentPosition.mul(2.03)).mul(0.28))
			.add(noise01(continentPosition.mul(4.11)).mul(0.15))
			.add(
				noise01(
					direction
						.mul(config.coastScale * 2.4)
						.add(continentOffset),
				).sub(0.5).mul(0.045),
			)
			.sub(config.oceanBias);

		const landMask = smoothstep(0.525, 0.585, continent);
		const highlands = max(continent.sub(0.54), 0);
		const mountainMask = smoothstep(0.62, 0.78, continent).mul(landMask);
		const ridgePosition = direction
			.mul(config.mountainScale * 3.8)
			.add(ridgeOffset);
		const ridgeLarge = float(1).sub(abs(mx_noise_float(ridgePosition)));
		const ridgeMedium = float(1).sub(abs(mx_noise_float(ridgePosition.mul(2.17))));
		const ridgeShape = pow(
			max(ridgeLarge.mul(0.68).add(ridgeMedium.mul(0.32)).sub(0.22), 0),
			2.0,
		).mul(mountainMask);
		const detail = noise01(
			direction.mul(18).add(detailOffset),
		).sub(0.5).mul(0.009).mul(landMask);

		const rawHeight = max(
			landMask.mul(0.006)
				.add(highlands.mul(0.095))
				.add(ridgeShape.mul(0.165))
				.add(detail),
			0,
		).mul(config.heightScale);

		return rawHeight.mul(this.terrainHeightScale);
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
		state.colorAtlasTexture.dispose();
	}

	private isTerrainPatchGroup(object: THREE.Object3D): object is PatchRuntime {
		return object instanceof THREE.Group && object.name.startsWith('TerrainPatch L');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${vector.x.toFixed(0)},${vector.y.toFixed(0)},${vector.z.toFixed(0)}`;
	}
}
