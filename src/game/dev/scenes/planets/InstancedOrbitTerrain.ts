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
	texture3D,
	uniform,
	vertexStage,
} from 'three/tsl';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { createDefaultCubeFaces } from '@conduit/planet/terrain';
import { getPlanetRenderHeightScale } from '@conduit/planet/near-view';
import {
	createOrbitTerrainVolume,
	ORBIT_TERRAIN_VOLUME_RESOLUTION,
} from './OrbitTerrainVolume';

const ORBIT_PATCH_LEVEL = 2;
const ORBIT_GRID_SEGMENTS = 24;

export type InstancedOrbitTerrainStats = {
	active: boolean;
	draws: number;
	instances: number;
	patchLevel: number;
	gridSegments: number;
	volumeResolution: number;
};

type OrbitPalette = {
	low: number;
	high: number;
	accent: number;
	water: number;
};

/**
 * OrbitView terrain renderer.
 *
 * This deliberately does NOT run a camera-driven quadtree. OrbitView has one
 * job: draw the complete planet cheaply until RegionalView takes over.
 *
 * - one shared 24x24 grid
 * - fixed level-2 CubeSphere topology (96 instances)
 * - one InstancedBufferGeometry / one draw call
 * - terrain displacement + masks sampled from one pre-baked RGBA16F 3D LUT
 * - no per-frame terrain noise
 * - no per-frame patch allocation/split/merge/stitch work
 */
export class InstancedOrbitTerrain {
	readonly group = new THREE.Group();

	private readonly geometry: THREE.InstancedBufferGeometry;
	private readonly material: MeshBasicNodeMaterial;
	private readonly mesh: THREE.Mesh;
	private readonly terrainVolume: THREE.Data3DTexture;
	private readonly instanceCount: number;

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
	) {
		this.group.name = 'PlanetOrbitInstancedView';
		this.terrainVolume = createOrbitTerrainVolume(definition);
		this.geometry = this.createGeometry();
		this.instanceCount = this.geometry.instanceCount;
		this.material = this.createMaterial();
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.name = 'PlanetOrbitInstancedTerrain';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 0;
		this.group.add(this.mesh);
	}

	update(opacity: number): void {
		const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
		this.group.visible = alpha > 0.001;
		this.material.opacity = alpha;
		this.material.depthWrite = alpha > 0.985;
	}

	getStats(): InstancedOrbitTerrainStats {
		return {
			active: this.group.visible,
			draws: this.group.visible ? 1 : 0,
			instances: this.instanceCount,
			patchLevel: ORBIT_PATCH_LEVEL,
			gridSegments: ORBIT_GRID_SEGMENTS,
			volumeResolution: ORBIT_TERRAIN_VOLUME_RESOLUTION,
		};
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
		this.terrainVolume.dispose();
		this.group.clear();
	}

	private createGeometry(): THREE.InstancedBufferGeometry {
		const segments = ORBIT_GRID_SEGMENTS;
		const rowSize = segments + 1;
		const vertexCount = rowSize * rowSize;
		const positions = new Float32Array(vertexCount * 3);
		const patchUv = new Float32Array(vertexCount * 2);

		for (let y = 0; y <= segments; y++) {
			for (let x = 0; x <= segments; x++) {
				const index = x + y * rowSize;
				patchUv[index * 2] = x / segments;
				patchUv[index * 2 + 1] = y / segments;
			}
		}

		const instancesPerAxis = 1 << ORBIT_PATCH_LEVEL;
		const patchSize = 2 / instancesPerAxis;
		const faces = createDefaultCubeFaces();
		const instanceCount = faces.length * instancesPerAxis * instancesPerAxis;
		const faceNormal = new Float32Array(instanceCount * 3);
		const faceRight = new Float32Array(instanceCount * 3);
		const faceUp = new Float32Array(instanceCount * 3);
		const bounds = new Float32Array(instanceCount * 3);

		let instance = 0;
		for (const face of faces) {
			for (let y = 0; y < instancesPerAxis; y++) {
				for (let x = 0; x < instancesPerAxis; x++) {
					faceNormal.set(face.normal.toArray(), instance * 3);
					faceRight.set(face.right.toArray(), instance * 3);
					faceUp.set(face.up.toArray(), instance * 3);
					bounds.set([
						-1 + x * patchSize,
						-1 + y * patchSize,
						patchSize,
					], instance * 3);
					instance++;
				}
			}
		}

		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('patchUv', new THREE.BufferAttribute(patchUv, 2));
		geometry.setAttribute('iFaceNormal', new THREE.InstancedBufferAttribute(faceNormal, 3));
		geometry.setAttribute('iFaceRight', new THREE.InstancedBufferAttribute(faceRight, 3));
		geometry.setAttribute('iFaceUp', new THREE.InstancedBufferAttribute(faceUp, 3));
		geometry.setAttribute('iBounds', new THREE.InstancedBufferAttribute(bounds, 3));
		geometry.setIndex(createGridIndices(segments));
		geometry.instanceCount = instanceCount;
		return geometry;
	}

	private createMaterial(): MeshBasicNodeMaterial {
		const material = new MeshBasicNodeMaterial({
			transparent: true,
			opacity: 1,
			depthTest: true,
			depthWrite: true,
		});
		material.name = 'PlanetOrbitInstancedTerrainMaterial';
		material.toneMapped = false;

		const patchUv = attribute('patchUv', 'vec2');
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
		const volumeUvVertex = sphereNormalVertex.mul(0.49).add(0.5);
		const terrainVertex = texture3D(this.terrainVolume, volumeUvVertex);
		const heightScale = getPlanetRenderHeightScale(this.definition, this.renderRadius);
		const displacement = terrainVertex.x.mul(heightScale);
		material.positionNode = sphereNormalVertex.mul(
			float(this.renderRadius).add(displacement),
		);

		const sphereNormal = vertexStage(sphereNormalVertex);
		const volumeUv = sphereNormal.mul(0.49).add(0.5);
		const terrain = texture3D(this.terrainVolume, volumeUv);
		const rawHeight = terrain.x;
		const land = terrain.y;
		const mountain = terrain.z;
		const erosion = terrain.w;
		const palette = getPalette(this.definition.class);
		const elevation = smoothstep(0.008, 0.19, rawHeight);
		const terrainColor = mix(
			color(palette.low),
			color(palette.high),
			elevation.mul(0.82).add(mountain.mul(0.18)),
		);
		const accented = mix(
			terrainColor,
			color(palette.accent),
			mountain.mul(0.24).add(erosion.mul(0.08)),
		);
		const baseColor = this.definition.surface.hasOcean
			? mix(
				color(palette.water),
				accented,
				smoothstep(0.44, 0.60, land),
			)
			: accented;

		const sunDirection = uniform(
			new THREE.Vector3(0.72, 0.34, 0.60).normalize(),
		);
		const ndl = dot(sphereNormal, sunDirection);
		const day = smoothstep(-0.20, 0.40, ndl);
		const direct = pow(max(ndl, 0.0), 0.72);
		const dayColor = baseColor.mul(float(0.48).add(direct.mul(1.00)));
		const nightColor = baseColor.mul(0.24).add(color(0x07121e).mul(0.10));
		material.colorNode = mix(nightColor, dayColor, day).mul(1.18);
		return material;
	}
}

function createGridIndices(segments: number): Uint32Array {
	const indices = new Uint32Array(segments * segments * 6);
	const stride = segments + 1;
	let write = 0;
	for (let y = 0; y < segments; y++) {
		for (let x = 0; x < segments; x++) {
			const a = y * stride + x;
			const b = a + 1;
			const c = a + stride;
			const d = c + 1;
			indices[write++] = a;
			indices[write++] = c;
			indices[write++] = b;
			indices[write++] = b;
			indices[write++] = c;
			indices[write++] = d;
		}
	}
	return indices;
}

function getPalette(planetClass: PlanetClass): OrbitPalette {
	switch (planetClass) {
		case 'desert': return { low: 0x8b5528, high: 0xd6ad67, accent: 0xc78b43, water: 0x20485c };
		case 'ice': return { low: 0x678096, high: 0xd8e3e5, accent: 0x9fb8c8, water: 0x244e68 };
		case 'lava': return { low: 0x2e1712, high: 0x8d3c1d, accent: 0xd36324, water: 0x34120d };
		case 'toxic': return { low: 0x4a4d2c, high: 0x8c9150, accent: 0x71803d, water: 0x354535 };
		case 'carbon': return { low: 0x242424, high: 0x55514b, accent: 0x3c3a36, water: 0x1d2e38 };
		case 'metal_rich': return { low: 0x4a4038, high: 0x8c7864, accent: 0x69594c, water: 0x273b48 };
		case 'barren': return { low: 0x615446, high: 0xa28d72, accent: 0x7f715f, water: 0x293f50 };
		case 'rocky': return { low: 0x51483f, high: 0x9a8871, accent: 0x736453, water: 0x263e50 };
		case 'terrestrial': return { low: 0x66583d, high: 0x9c9166, accent: 0x496844, water: 0x194765 };
		case 'ocean': return { low: 0x655f46, high: 0xa79b6f, accent: 0x4d6f52, water: 0x143f5f };
		default: return { low: 0x625548, high: 0xa48e73, accent: 0x786858, water: 0x274455 };
	}
}
