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
};

type StitchGroup = {
	key: string;
	sources: PatchSource[];
	representative: THREE.BufferGeometry;
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

/**
 * Feature-Lab-only Instanced CubeSphere renderer, v2.
 *
 * Unlike the first prototype this renderer does not reconstruct cube-face
 * directions from private patch face/bounds state. It mirrors the exact
 * worker-generated sphereNormal attribute into a geometry atlas and therefore
 * uses the same vertex directions as the production patch meshes.
 *
 * Shared topology is still retained: one regular grid per stitch/index
 * variant, with only atlas rects varying per instance.
 */
export class PlanetInstancedCubeSphereDebug {
	private root: THREE.Group | null = null;
	private geometryAtlasTexture: THREE.DataTexture | null = null;
	private colorAtlasTexture: THREE.DataTexture | null = null;
	private material: THREE.Material | null = null;
	private signature = '';
	private sourceVisibility = new Map<THREE.Mesh, boolean>();
	private sourceMeshes = 0;
	private drawMeshes = 0;
	private stitchGroups = 0;
	private rebuilds = 0;
	private atlasSize = '0x0';
	private colorMode: PlanetInstancedColorMode = 'fragment-atlas';
	private heightDisplacement = true;

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

	setColorMode(mode: PlanetInstancedColorMode): void {
		if (this.colorMode === mode) return;
		this.restoreSourceVisibility();
		this.colorMode = mode;
		this.destroyGpuState();
	}

	setHeightDisplacementEnabled(enabled: boolean): void {
		if (this.heightDisplacement === enabled) return;
		this.restoreSourceVisibility();
		this.heightDisplacement = enabled;
		this.destroyGpuState();
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
			colorMode: this.colorMode,
			heightDisplacement: this.heightDisplacement,
		};
	}

	private collectVisibleSources(terrain: TerrainRuntime): PatchSource[] {
		const result: PatchSource[] = [];

		terrain.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (!object.visible) return;
			if (!(object.parent?.name.startsWith('TerrainPatch L') ?? false)) return;
			if (!object.geometry.index) return;
			if (!object.geometry.getAttribute('sphereNormal')) return;
			if (!object.geometry.getAttribute('terrainDisplacement')) return;
			if (!object.geometry.getAttribute('color')) return;

			result.push({
				mesh: object,
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
		this.geometryAtlasTexture = geometryAtlas;
		this.colorAtlasTexture = colorAtlas;
		this.material = material;
		this.signature = signature;
		this.drawMeshes = root.children.length;
		this.stitchGroups = groups.size;
		this.atlasSize = `${atlasWidth}x${atlasHeight}`;
		this.rebuilds++;
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
		this.geometryAtlasTexture?.dispose();
		this.geometryAtlasTexture = null;
		this.colorAtlasTexture?.dispose();
		this.colorAtlasTexture = null;
		this.signature = '';
		this.drawMeshes = 0;
		this.stitchGroups = 0;
		this.atlasSize = '0x0';
	}
}
