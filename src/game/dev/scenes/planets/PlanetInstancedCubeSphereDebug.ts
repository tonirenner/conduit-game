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
} from 'three/tsl';

type TerrainRuntime = THREE.Object3D;

type CubeFaceRuntime = {
	normal: THREE.Vector3;
	right: THREE.Vector3;
	up: THREE.Vector3;
};

type PatchBoundsRuntime = {
	x: number;
	y: number;
	size: number;
};

type TerrainPatchRuntime = THREE.Object3D & {
	face?: CubeFaceRuntime;
	bounds?: PatchBoundsRuntime;
};

type PatchSource = {
	mesh: THREE.Mesh;
	face: CubeFaceRuntime;
	bounds: PatchBoundsRuntime;
	atlasIndex: number;
	stitchKey: string;
};

type StitchGroup = {
	key: string;
	sources: PatchSource[];
	representative: THREE.BufferGeometry;
};

export type PlanetInstancedCubeSphereStats = {
	active: boolean;
	sourceMeshes: number;
	drawMeshes: number;
	stitchGroups: number;
	rebuilds: number;
	atlasSize: string;
};

/**
 * Feature-Lab-only Instanced CubeSphere renderer.
 *
 * The production quadtree/workers remain the authority for LOD and terrain
 * generation. This renderer mirrors only the visible leaves into a GPU layout
 * that is much closer to the intended long-term architecture:
 *
 * - one shared regular grid per stitch/index variant
 * - per-instance cube face basis + patch bounds
 * - one temporary float atlas containing baked displacement + RGB
 * - sphere reconstruction in the vertex node
 *
 * This means hundreds of patch meshes can collapse into at most the number of
 * active stitch variants (normally <= 16) without changing the worker system.
 */
export class PlanetInstancedCubeSphereDebug {
	private root: THREE.Group | null = null;
	private atlasTexture: THREE.DataTexture | null = null;
	private material: THREE.Material | null = null;
	private signature = '';
	private sourceVisibility = new Map<THREE.Mesh, boolean>();
	private sourceMeshes = 0;
	private drawMeshes = 0;
	private stitchGroups = 0;
	private rebuilds = 0;
	private atlasSize = '0x0';

	constructor(private readonly planetRadius: number) {}

	beforePlanetUpdate(): void {
		this.restoreSourceVisibility();
	}

	update(terrain: TerrainRuntime): void {
		const sources = this.collectVisibleSources(terrain);
		this.sourceMeshes = sources.length;

		if (sources.length === 0) {
			this.destroyGpuState();
			return;
		}

		const signature = this.createSignature(sources);
		if (!this.root || signature !== this.signature) {
			this.rebuild(terrain, sources, signature);
		}

		for (const source of sources) {
			this.sourceVisibility.set(source.mesh, source.mesh.visible);
			source.mesh.visible = false;
		}
	}

	detach(): void {
		this.restoreSourceVisibility();
		this.destroyGpuState();
		this.sourceMeshes = 0;
		this.drawMeshes = 0;
		this.stitchGroups = 0;
		this.atlasSize = '0x0';
	}

	dispose(): void {
		this.detach();
	}

	getStats(): PlanetInstancedCubeSphereStats {
		return {
			active: Boolean(this.root),
			sourceMeshes: this.sourceMeshes,
			drawMeshes: this.drawMeshes,
			stitchGroups: this.stitchGroups,
			rebuilds: this.rebuilds,
			atlasSize: this.atlasSize,
		};
	}

	private collectVisibleSources(terrain: TerrainRuntime): PatchSource[] {
		const result: PatchSource[] = [];

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (!object.visible) return;
			if (!(object.parent?.name.startsWith('TerrainPatch L') ?? false)) return;

			const patch = object.parent as TerrainPatchRuntime;
			if (!patch.face || !patch.bounds) return;
			if (!object.geometry.index) return;
			if (!object.geometry.getAttribute('terrainDisplacement')) return;
			if (!object.geometry.getAttribute('color')) return;

			result.push({
				mesh: object,
				face: patch.face,
				bounds: patch.bounds,
				atlasIndex: result.length,
				stitchKey: this.createIndexSignature(object.geometry),
			});
		});

		return result;
	}

	private rebuild(
		terrain: TerrainRuntime,
		sources: PatchSource[],
		signature: string,
	): void {
		this.destroyGpuState();

		const firstPosition = sources[0]?.mesh.geometry.getAttribute('position');
		if (!firstPosition) return;

		const rowSize = Math.round(Math.sqrt(firstPosition.count));
		if (rowSize < 2 || rowSize * rowSize !== firstPosition.count) return;

		const atlasColumns = Math.ceil(Math.sqrt(sources.length));
		const atlasRows = Math.ceil(sources.length / atlasColumns);
		const atlasWidth = atlasColumns * rowSize;
		const atlasHeight = atlasRows * rowSize;
		const atlasPixels = new Float32Array(atlasWidth * atlasHeight * 4);

		for (const source of sources) {
			this.writePatchToAtlas(
				source,
				rowSize,
				atlasColumns,
				atlasWidth,
				atlasPixels,
			);
		}

		const atlasTexture = new THREE.DataTexture(
			atlasPixels,
			atlasWidth,
			atlasHeight,
			THREE.RGBAFormat,
			THREE.FloatType,
		);
		atlasTexture.name = 'PlanetInstancedCubeSphereAtlas';
		atlasTexture.minFilter = THREE.LinearFilter;
		atlasTexture.magFilter = THREE.LinearFilter;
		atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
		atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
		atlasTexture.generateMipmaps = false;
		atlasTexture.needsUpdate = true;

		const material = this.createMaterial(atlasTexture);
		const root = new THREE.Group();
		root.name = 'PlanetInstancedCubeSphereDebug';

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

		terrain.add(root);

		this.root = root;
		this.atlasTexture = atlasTexture;
		this.material = material;
		this.signature = signature;
		this.drawMeshes = root.children.length;
		this.stitchGroups = groups.size;
		this.atlasSize = `${atlasWidth}x${atlasHeight}`;
		this.rebuilds++;
	}

	private writePatchToAtlas(
		source: PatchSource,
		rowSize: number,
		atlasColumns: number,
		atlasWidth: number,
		pixels: Float32Array,
	): void {
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

				pixels[target + 0] = displacement.getX(vertexIndex);
				pixels[target + 1] = sourceColor.getX(vertexIndex);
				pixels[target + 2] = sourceColor.getY(vertexIndex);
				pixels[target + 3] = sourceColor.getZ(vertexIndex);
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

		const faceNormal = new Float32Array(group.sources.length * 3);
		const faceRight = new Float32Array(group.sources.length * 3);
		const faceUp = new Float32Array(group.sources.length * 3);
		const bounds = new Float32Array(group.sources.length * 3);
		const atlasRect = new Float32Array(group.sources.length * 4);

		for (let i = 0; i < group.sources.length; i++) {
			const source = group.sources[i];
			faceNormal.set(source.face.normal.toArray(), i * 3);
			faceRight.set(source.face.right.toArray(), i * 3);
			faceUp.set(source.face.up.toArray(), i * 3);
			bounds.set([
				source.bounds.x,
				source.bounds.y,
				source.bounds.size,
			], i * 3);

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
		geometry.setAttribute(
			'iAtlasRect',
			new THREE.InstancedBufferAttribute(atlasRect, 4),
		);
		geometry.instanceCount = group.sources.length;
		geometry.computeBoundingSphere();

		return geometry;
	}

	private createMaterial(atlas: THREE.DataTexture): THREE.Material {
		const material = new MeshBasicNodeMaterial({
			transparent: false,
			depthWrite: true,
			depthTest: true,
		});
		material.name = 'PlanetInstancedCubeSphereMaterial';

		const patchUv = attribute('patchUv', 'vec2');
		const faceNormal = attribute('iFaceNormal', 'vec3');
		const faceRight = attribute('iFaceRight', 'vec3');
		const faceUp = attribute('iFaceUp', 'vec3');
		const bounds = attribute('iBounds', 'vec3');
		const atlasRect = attribute('iAtlasRect', 'vec4');

		const cubeX = bounds.x.add(patchUv.x.mul(bounds.z));
		const cubeY = bounds.y.add(patchUv.y.mul(bounds.z));
		const sphereNormal = normalize(
			faceNormal
				.add(faceRight.mul(cubeX))
				.add(faceUp.mul(cubeY)),
		);

		const atlasUv = atlasRect.xy.add(patchUv.mul(atlasRect.zw));
		const baked = texture(atlas, atlasUv);
		const displacement = baked.x;
		const baseColor = baked.yzw;

		material.positionNode = sphereNormal.mul(
			float(this.planetRadius).add(displacement),
		);

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
		const index = geometry.index;
		if (!index) return 'none';

		let hash = 2166136261;
		for (let i = 0; i < index.count; i++) {
			hash ^= index.getX(i) | 0;
			hash = Math.imul(hash, 16777619);
		}

		return `${index.count}:${hash >>> 0}`;
	}

	private createSignature(sources: PatchSource[]): string {
		return sources
			.map((source) => [
				source.mesh.uuid,
				source.mesh.geometry.id,
				source.stitchKey,
			].join(':'))
			.join('|');
	}

	private restoreSourceVisibility(): void {
		for (const [mesh, visible] of this.sourceVisibility) {
			mesh.visible = visible;
		}
		this.sourceVisibility.clear();
	}

	private destroyGpuState(): void {
		if (this.root) {
			for (const child of this.root.children) {
				if (child instanceof THREE.Mesh) child.geometry.dispose();
			}
			this.root.removeFromParent();
			this.root.clear();
			this.root = null;
		}

		this.material?.dispose();
		this.material = null;
		this.atlasTexture?.dispose();
		this.atlasTexture = null;
		this.signature = '';
		this.drawMeshes = 0;
		this.stitchGroups = 0;
		this.atlasSize = '0x0';
	}
}
