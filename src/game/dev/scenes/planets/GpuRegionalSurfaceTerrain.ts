import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

const GRID_RESOLUTION = 192;
const MAP_RESOLUTION = 192;
const RELIEF_EXAGGERATION = 8;
const EXTENT_REBUILD_THRESHOLD = 0.16;

export class GpuRegionalSurfaceTerrain {
	readonly group = new THREE.Group();
	private readonly sampler: PlanetTerrainSampler;
	private readonly anchor = new THREE.Vector3();
	private currentExtent = 1.1;
	private mesh: THREE.Mesh | null = null;
	private maps: THREE.Texture[] = [];
	private readonly material = new MeshStandardNodeMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
		depthTest: true,
		metalness: 0,
		roughness: 1,
	});

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'GpuRegionalSurfaceTerrain';
		this.sampler = new PlanetTerrainSampler(definition);
		this.currentExtent = this.getPatchExtent(cameraRenderPosition);
		this.rebuild(cameraRenderPosition);
		this.setOpacity(0);
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const direction = cameraRenderPosition.clone().normalize();
		const extent = this.getPatchExtent(cameraRenderPosition);
		if (
			direction.dot(this.anchor) < 0.992 ||
			Math.abs(extent / this.currentExtent - 1) > EXTENT_REBUILD_THRESHOLD
		) {
			this.currentExtent = extent;
			this.rebuild(cameraRenderPosition);
		}
		this.setOpacity(opacity);
	}

	dispose(): void {
		this.mesh?.geometry.dispose();
		for (const map of this.maps) map.dispose();
		this.maps = [];
		this.material.dispose();
		this.group.clear();
		this.mesh = null;
	}

	private setOpacity(value: number): void {
		const opacity = THREE.MathUtils.clamp(value, 0, 1);
		this.material.opacity = opacity;
		this.material.depthWrite = opacity > 0.96;
		this.group.visible = opacity > 0.001;
	}

	private getPatchExtent(cameraRenderPosition: THREE.Vector3): number {
		const altitudeMeters = Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.sampler.radiusMeters,
		);
		return THREE.MathUtils.clamp(
			0.045 + (altitudeMeters / Math.max(1, this.sampler.radiusMeters)) * 1.35,
			0.055,
			1.1,
		);
	}

	private rebuild(cameraRenderPosition: THREE.Vector3): void {
		this.anchor.copy(cameraRenderPosition).normalize();
		const basis = createBasis(this.anchor);
		const field = this.sampleField(basis);
		const geometry = this.buildGeometry(basis);
		const textures = this.buildMaps(field);

		for (const map of this.maps) map.dispose();
		this.maps = textures.all;
		this.material.map = textures.color;
		this.material.displacementMap = textures.height;
		this.material.displacementScale = field.elevationRangeRender * RELIEF_EXAGGERATION;
		this.material.displacementBias = field.minElevationRender * RELIEF_EXAGGERATION;
		this.material.normalMap = textures.normal;
		this.material.normalScale.set(1.35, 1.35);
		this.material.aoMap = textures.ao;
		this.material.aoMapIntensity = 0.85;
		this.material.roughnessMap = textures.roughness;
		this.material.needsUpdate = true;

		if (this.mesh) {
			this.mesh.geometry.dispose();
			this.mesh.geometry = geometry;
		} else {
			this.mesh = new THREE.Mesh(geometry, this.material as unknown as THREE.Material);
			this.mesh.name = 'GpuRegionalSurfaceTerrainMesh';
			this.mesh.frustumCulled = true;
			this.mesh.castShadow = true;
			this.mesh.receiveShadow = true;
			this.group.add(this.mesh);
		}
	}

	private buildGeometry(basis: SurfaceBasis): THREE.BufferGeometry {
		const positions: number[] = [];
		const normals: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];
		const direction = new THREE.Vector3();

		for (let y = 0; y <= GRID_RESOLUTION; y++) {
			const v01 = y / GRID_RESOLUTION;
			const v = v01 * 2 - 1;
			for (let x = 0; x <= GRID_RESOLUTION; x++) {
				const u01 = x / GRID_RESOLUTION;
				const u = u01 * 2 - 1;
				sampleDirection(direction, basis, u, v, this.currentExtent);
				positions.push(
					direction.x * this.renderRadius,
					direction.y * this.renderRadius,
					direction.z * this.renderRadius,
				);
				normals.push(direction.x, direction.y, direction.z);
				uvs.push(u01, 1 - v01);
			}
		}

		const stride = GRID_RESOLUTION + 1;
		for (let y = 0; y < GRID_RESOLUTION; y++) {
			for (let x = 0; x < GRID_RESOLUTION; x++) {
				const a = y * stride + x;
				const b = a + 1;
				const c = a + stride;
				const d = c + 1;
				indices.push(a, b, c, b, d, c);
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		const uv = new THREE.Float32BufferAttribute(uvs, 2);
		geometry.setAttribute('uv', uv);
		geometry.setAttribute('uv1', uv.clone());
		geometry.setIndex(indices);
		geometry.computeBoundingSphere();
		return geometry;
	}

	private sampleField(basis: SurfaceBasis): TerrainField {
		const count = MAP_RESOLUTION * MAP_RESOLUTION;
		const elevation = new Float32Array(count);
		const landMask = new Float32Array(count);
		const water = new Uint8Array(count);
		const direction = new THREE.Vector3();
		let minElevation = Number.POSITIVE_INFINITY;
		let maxElevation = Number.NEGATIVE_INFINITY;

		for (let y = 0; y < MAP_RESOLUTION; y++) {
			const v = ((y + 0.5) / MAP_RESOLUTION) * 2 - 1;
			for (let x = 0; x < MAP_RESOLUTION; x++) {
				const u = ((x + 0.5) / MAP_RESOLUTION) * 2 - 1;
				sampleDirection(direction, basis, u, v, this.currentExtent);
				const sample = this.sampler.sample(direction, false);
				const i = y * MAP_RESOLUTION + x;
				elevation[i] = sample.elevationMeters;
				landMask[i] = sample.landMask;
				water[i] = sample.isWater ? 1 : 0;
				minElevation = Math.min(minElevation, sample.elevationMeters);
				maxElevation = Math.max(maxElevation, sample.elevationMeters);
			}
		}

		const metersToRender = this.renderRadius / this.sampler.radiusMeters;
		return {
			elevation,
			landMask,
			water,
			minElevation,
			maxElevation,
			minElevationRender: minElevation * metersToRender,
			elevationRangeRender: Math.max(1, maxElevation - minElevation) * metersToRender,
		};
	}

	private buildMaps(field: TerrainField): TerrainMaps {
		const count = MAP_RESOLUTION * MAP_RESOLUTION;
		const colorData = new Uint8Array(count * 4);
		const heightData = new Uint8Array(count * 4);
		const normalData = new Uint8Array(count * 4);
		const aoData = new Uint8Array(count * 4);
		const roughnessData = new Uint8Array(count * 4);
		const color = new THREE.Color();
		const range = Math.max(1, field.maxElevation - field.minElevation);

		for (let y = 0; y < MAP_RESOLUTION; y++) {
			for (let x = 0; x < MAP_RESOLUTION; x++) {
				const i = y * MAP_RESOLUTION + x;
				const o = i * 4;
				const h = field.elevation[i];
				const left = field.elevation[y * MAP_RESOLUTION + Math.max(0, x - 1)];
				const right = field.elevation[y * MAP_RESOLUTION + Math.min(MAP_RESOLUTION - 1, x + 1)];
				const down = field.elevation[Math.max(0, y - 1) * MAP_RESOLUTION + x];
				const up = field.elevation[Math.min(MAP_RESOLUTION - 1, y + 1) * MAP_RESOLUTION + x];
				const dx = (right - left) / range;
				const dy = (up - down) / range;
				const slope = THREE.MathUtils.clamp(Math.hypot(dx, dy) * 6, 0, 1);
				const curvature = THREE.MathUtils.clamp(Math.abs(left + right + down + up - h * 4) / range * 18, 0, 1);

				resolveColor(this.definition.class, field.landMask[i], h, field.water[i] === 1, slope, color);
				colorData[o] = toByte(color.r);
				colorData[o + 1] = toByte(color.g);
				colorData[o + 2] = toByte(color.b);
				colorData[o + 3] = 255;

				const normalizedHeight = THREE.MathUtils.clamp((h - field.minElevation) / range, 0, 1);
				setGray(heightData, o, normalizedHeight);

				const normal = new THREE.Vector3(-dx * 7, -dy * 7, 1).normalize();
				normalData[o] = toByte(normal.x * 0.5 + 0.5);
				normalData[o + 1] = toByte(normal.y * 0.5 + 0.5);
				normalData[o + 2] = toByte(normal.z * 0.5 + 0.5);
				normalData[o + 3] = 255;

				setGray(aoData, o, 1 - curvature * 0.65);
				const roughness = field.water[i] ? 0.42 : THREE.MathUtils.clamp(0.72 + slope * 0.22, 0, 1);
				setGray(roughnessData, o, roughness);
			}
		}

		const colorMap = makeTexture(colorData, true);
		const heightMap = makeTexture(heightData, false);
		const normalMap = makeTexture(normalData, false);
		const aoMap = makeTexture(aoData, false);
		const roughnessMap = makeTexture(roughnessData, false);
		return {
			color: colorMap,
			height: heightMap,
			normal: normalMap,
			ao: aoMap,
			roughness: roughnessMap,
			all: [colorMap, heightMap, normalMap, aoMap, roughnessMap],
		};
	}
}

type SurfaceBasis = { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 };
type TerrainField = {
	elevation: Float32Array;
	landMask: Float32Array;
	water: Uint8Array;
	minElevation: number;
	maxElevation: number;
	minElevationRender: number;
	elevationRangeRender: number;
};
type TerrainMaps = {
	color: THREE.DataTexture;
	height: THREE.DataTexture;
	normal: THREE.DataTexture;
	ao: THREE.DataTexture;
	roughness: THREE.DataTexture;
	all: THREE.Texture[];
};

function createBasis(up: THREE.Vector3): SurfaceBasis {
	const reference = Math.abs(up.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
	const east = new THREE.Vector3().crossVectors(reference, up).normalize();
	const north = new THREE.Vector3().crossVectors(up, east).normalize();
	return { up, east, north };
}

function sampleDirection(target: THREE.Vector3, basis: SurfaceBasis, u: number, v: number, extent: number): THREE.Vector3 {
	return target.copy(basis.up).addScaledVector(basis.east, u * extent).addScaledVector(basis.north, v * extent).normalize();
}

function makeTexture(data: Uint8Array, srgb: boolean): THREE.DataTexture {
	const texture = new THREE.DataTexture(data, MAP_RESOLUTION, MAP_RESOLUTION, THREE.RGBAFormat, THREE.UnsignedByteType);
	texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function setGray(data: Uint8Array, offset: number, value: number): void {
	const byte = toByte(value);
	data[offset] = byte;
	data[offset + 1] = byte;
	data[offset + 2] = byte;
	data[offset + 3] = 255;
}

function toByte(value: number): number {
	return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}

function resolveColor(planetClass: PlanetClass, landMask: number, elevation: number, isWater: boolean, slope: number, target: THREE.Color): void {
	if (isWater) {
		target.setRGB(0.025, 0.10 + landMask * 0.08, 0.20 + landMask * 0.14);
		return;
	}
	const relief = THREE.MathUtils.clamp(elevation / 9000 * 0.5 + 0.5, 0, 1);
	if (planetClass === 'desert') target.setRGB(0.48 + relief * 0.28 - slope * 0.12, 0.20 + relief * 0.25 - slope * 0.08, 0.055 + relief * 0.08);
	else if (planetClass === 'ice') target.setRGB(0.62 + relief * 0.30, 0.70 + relief * 0.25, 0.76 + relief * 0.22);
	else if (planetClass === 'lava') target.setRGB(0.20 + relief * 0.55, 0.035 + relief * 0.14, 0.01);
	else target.setRGB(0.12 + relief * 0.24 - slope * 0.06, 0.18 + relief * 0.30, 0.09 + relief * 0.16);
}
