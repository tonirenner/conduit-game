import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

const RELIEF_EXAGGERATION = 8;
const EXTENT_REBUILD_THRESHOLD = 0.14;

export class GpuRegionalSurfaceTerrain {
	readonly group = new THREE.Group();
	private readonly sampler: PlanetTerrainSampler;
	private readonly anchor = new THREE.Vector3();
	private currentExtent = 1.1;
	private gridResolution = 160;
	private mapResolution = 192;
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
		this.applyResolution(cameraRenderPosition);
		this.rebuild(cameraRenderPosition);
		this.setOpacity(0);
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const direction = cameraRenderPosition.clone().normalize();
		const extent = this.getPatchExtent(cameraRenderPosition);
		const nextResolution = this.getResolution(cameraRenderPosition);
		const resolutionChanged =
			nextResolution.grid !== this.gridResolution ||
			nextResolution.map !== this.mapResolution;

		if (
			direction.dot(this.anchor) < 0.992 ||
			Math.abs(extent / this.currentExtent - 1) > EXTENT_REBUILD_THRESHOLD ||
			resolutionChanged
		) {
			this.currentExtent = extent;
			this.gridResolution = nextResolution.grid;
			this.mapResolution = nextResolution.map;
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

	private getAltitudeMeters(cameraRenderPosition: THREE.Vector3): number {
		return Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.sampler.radiusMeters,
		);
	}

	private getPatchExtent(cameraRenderPosition: THREE.Vector3): number {
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		return THREE.MathUtils.clamp(
			0.038 + (altitudeMeters / Math.max(1, this.sampler.radiusMeters)) * 1.08,
			0.045,
			1.1,
		);
	}

	private getResolution(cameraRenderPosition: THREE.Vector3): { grid: number; map: number } {
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		if (altitudeMeters > 6_000_000) return { grid: 160, map: 192 };
		if (altitudeMeters > 3_000_000) return { grid: 192, map: 256 };
		return { grid: 256, map: 320 };
	}

	private applyResolution(cameraRenderPosition: THREE.Vector3): void {
		const resolution = this.getResolution(cameraRenderPosition);
		this.gridResolution = resolution.grid;
		this.mapResolution = resolution.map;
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
		this.material.normalScale.set(1.75, 1.75);
		this.material.aoMap = textures.ao;
		this.material.aoMapIntensity = 1.08;
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
		const resolution = this.gridResolution;
		const positions: number[] = [];
		const normals: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];
		const direction = new THREE.Vector3();

		for (let y = 0; y <= resolution; y++) {
			const v01 = y / resolution;
			const v = v01 * 2 - 1;
			for (let x = 0; x <= resolution; x++) {
				const u01 = x / resolution;
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

		const stride = resolution + 1;
		for (let y = 0; y < resolution; y++) {
			for (let x = 0; x < resolution; x++) {
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
		const resolution = this.mapResolution;
		const count = resolution * resolution;
		const elevation = new Float32Array(count);
		const landMask = new Float32Array(count);
		const mountainMask = new Float32Array(count);
		const erosionMask = new Float32Array(count);
		const riverMask = new Float32Array(count);
		const water = new Uint8Array(count);
		const direction = new THREE.Vector3();
		let minElevation = Number.POSITIVE_INFINITY;
		let maxElevation = Number.NEGATIVE_INFINITY;

		for (let y = 0; y < resolution; y++) {
			const v = ((y + 0.5) / resolution) * 2 - 1;
			for (let x = 0; x < resolution; x++) {
				const u = ((x + 0.5) / resolution) * 2 - 1;
				sampleDirection(direction, basis, u, v, this.currentExtent);
				const sample = this.sampler.sample(direction, false);
				const i = y * resolution + x;
				elevation[i] = sample.elevationMeters;
				landMask[i] = sample.landMask;
				mountainMask[i] = sample.rawTerrain.mountainMask;
				erosionMask[i] = sample.rawTerrain.erosionMask;
				riverMask[i] = sample.rawTerrain.riverMask;
				water[i] = sample.isWater ? 1 : 0;
				minElevation = Math.min(minElevation, sample.elevationMeters);
				maxElevation = Math.max(maxElevation, sample.elevationMeters);
			}
		}

		const metersToRender = this.renderRadius / this.sampler.radiusMeters;
		return {
			elevation,
			landMask,
			mountainMask,
			erosionMask,
			riverMask,
			water,
			minElevation,
			maxElevation,
			minElevationRender: minElevation * metersToRender,
			elevationRangeRender: Math.max(1, maxElevation - minElevation) * metersToRender,
		};
	}

	private buildMaps(field: TerrainField): TerrainMaps {
		const resolution = this.mapResolution;
		const count = resolution * resolution;
		const colorData = new Uint8Array(count * 4);
		const heightData = new Float32Array(count * 4);
		const normalData = new Uint8Array(count * 4);
		const aoData = new Uint8Array(count * 4);
		const roughnessData = new Uint8Array(count * 4);
		const color = new THREE.Color();
		const range = Math.max(1, field.maxElevation - field.minElevation);

		for (let y = 0; y < resolution; y++) {
			for (let x = 0; x < resolution; x++) {
				const i = y * resolution + x;
				const o = i * 4;
				const h = field.elevation[i];
				const left = field.elevation[y * resolution + Math.max(0, x - 1)];
				const right = field.elevation[y * resolution + Math.min(resolution - 1, x + 1)];
				const down = field.elevation[Math.max(0, y - 1) * resolution + x];
				const up = field.elevation[Math.min(resolution - 1, y + 1) * resolution + x];
				const dx = (right - left) / range;
				const dy = (up - down) / range;
				const slope = THREE.MathUtils.clamp(Math.hypot(dx, dy) * 8.0, 0, 1);
				const curvature = THREE.MathUtils.clamp(
					Math.abs(left + right + down + up - h * 4) / range * 24,
					0,
					1,
				);
				const mountain = field.mountainMask[i];
				const erosion = field.erosionMask[i];
				const river = field.riverMask[i];
				const rockRaw = THREE.MathUtils.clamp(
					slope * 0.76 + mountain * 0.50 + erosion * 0.26 - river * 0.36,
					0,
					1,
				);
				const valleyRaw = THREE.MathUtils.clamp(
					river * 0.82 + (1 - slope) * erosion * 0.26,
					0,
					1,
				);
				const rock = smoothMask(rockRaw, 0.18, 0.72);
				const valley = smoothMask(valleyRaw, 0.16, 0.66);
				const plain = THREE.MathUtils.clamp(1 - rock - valley * 0.58, 0, 1);

				resolveSplatColor(
					this.definition.class,
					field.landMask[i],
					h,
					field.water[i] === 1,
					plain,
					rock,
					valley,
					erosion,
					color,
				);
				colorData[o] = toByte(color.r);
				colorData[o + 1] = toByte(color.g);
				colorData[o + 2] = toByte(color.b);
				colorData[o + 3] = 255;

				const normalizedHeight = THREE.MathUtils.clamp((h - field.minElevation) / range, 0, 1);
				setFloatGray(heightData, o, normalizedHeight);

				const micro = deterministicDetail(x, y, this.definition.render.terrainSeed);
				const micro2 = deterministicDetail(x * 3 + 17, y * 3 - 11, this.definition.render.terrainSeed + 97);
				const detail = ((micro - 0.5) * 0.65 + (micro2 - 0.5) * 0.35) * (0.075 + rock * 0.055);
				const nx = -dx * (8.5 + rock * 4.5) + detail;
				const ny = -dy * (8.5 + rock * 4.5) - detail * 0.83;
				const invLength = 1 / Math.max(0.000001, Math.hypot(nx, ny, 1));
				normalData[o] = toByte(nx * invLength * 0.5 + 0.5);
				normalData[o + 1] = toByte(ny * invLength * 0.5 + 0.5);
				normalData[o + 2] = toByte(invLength * 0.5 + 0.5);
				normalData[o + 3] = 255;

				const cavity = THREE.MathUtils.clamp(
					curvature * 0.54 + valley * 0.38 + erosion * curvature * 0.32,
					0,
					0.86,
				);
				setGray(aoData, o, 1 - cavity);

				const roughness = field.water[i]
					? 0.38
					: THREE.MathUtils.clamp(
						0.66 + plain * 0.11 + rock * 0.23 + erosion * 0.11 - valley * 0.09,
						0.52,
						1,
					);
				setGray(roughnessData, o, roughness);
			}
		}

		const colorMap = makeByteTexture(colorData, resolution, true);
		const heightMap = makeFloatTexture(heightData, resolution);
		const normalMap = makeByteTexture(normalData, resolution, false);
		const aoMap = makeByteTexture(aoData, resolution, false);
		const roughnessMap = makeByteTexture(roughnessData, resolution, false);
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
	mountainMask: Float32Array;
	erosionMask: Float32Array;
	riverMask: Float32Array;
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

function sampleDirection(
	target: THREE.Vector3,
	basis: SurfaceBasis,
	u: number,
	v: number,
	extent: number,
): THREE.Vector3 {
	return target
		.copy(basis.up)
		.addScaledVector(basis.east, u * extent)
		.addScaledVector(basis.north, v * extent)
		.normalize();
}

function configureTexture(texture: THREE.DataTexture, srgb: boolean): THREE.DataTexture {
	texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function makeByteTexture(data: Uint8Array, resolution: number, srgb: boolean): THREE.DataTexture {
	return configureTexture(
		new THREE.DataTexture(
			data,
			resolution,
			resolution,
			THREE.RGBAFormat,
			THREE.UnsignedByteType,
		),
		srgb,
	);
}

function makeFloatTexture(data: Float32Array, resolution: number): THREE.DataTexture {
	return configureTexture(
		new THREE.DataTexture(
			data,
			resolution,
			resolution,
			THREE.RGBAFormat,
			THREE.FloatType,
		),
		false,
	);
}

function setGray(data: Uint8Array, offset: number, value: number): void {
	const byte = toByte(value);
	data[offset] = byte;
	data[offset + 1] = byte;
	data[offset + 2] = byte;
	data[offset + 3] = 255;
}

function setFloatGray(data: Float32Array, offset: number, value: number): void {
	const clamped = THREE.MathUtils.clamp(value, 0, 1);
	data[offset] = clamped;
	data[offset + 1] = clamped;
	data[offset + 2] = clamped;
	data[offset + 3] = 1;
}

function smoothMask(value: number, low: number, high: number): number {
	const t = THREE.MathUtils.clamp((value - low) / Math.max(0.000001, high - low), 0, 1);
	return t * t * (3 - 2 * t);
}

function toByte(value: number): number {
	return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}

function deterministicDetail(x: number, y: number, seed: number): number {
	const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.0017) * 43758.5453;
	return value - Math.floor(value);
}

function resolveSplatColor(
	planetClass: PlanetClass,
	landMask: number,
	elevation: number,
	isWater: boolean,
	plain: number,
	rock: number,
	valley: number,
	erosion: number,
	target: THREE.Color,
): void {
	if (isWater) {
		target.setRGB(0.025, 0.10 + landMask * 0.08, 0.20 + landMask * 0.14);
		return;
	}

	const relief = THREE.MathUtils.clamp(elevation / 9000 * 0.5 + 0.5, 0, 1);
	const palette = getTerrainPalette(planetClass, relief);
	const sum = Math.max(0.0001, plain + rock + valley);
	const wp = plain / sum;
	const wr = rock / sum;
	const wv = valley / sum;
	target.setRGB(
		palette.plain.r * wp + palette.rock.r * wr + palette.valley.r * wv,
		palette.plain.g * wp + palette.rock.g * wr + palette.valley.g * wv,
		palette.plain.b * wp + palette.rock.b * wr + palette.valley.b * wv,
	);
	target.multiplyScalar(THREE.MathUtils.lerp(1.03, 0.84, erosion * rock));
}

function getTerrainPalette(planetClass: PlanetClass, relief: number): TerrainPalette {
	if (planetClass === 'desert') return {
		plain: new THREE.Color().setRGB(0.52 + relief * 0.20, 0.24 + relief * 0.18, 0.075 + relief * 0.07),
		rock: new THREE.Color().setRGB(0.32 + relief * 0.18, 0.12 + relief * 0.10, 0.045 + relief * 0.04),
		valley: new THREE.Color().setRGB(0.37 + relief * 0.14, 0.18 + relief * 0.10, 0.065 + relief * 0.045),
	};
	if (planetClass === 'ice') return {
		plain: new THREE.Color().setRGB(0.70 + relief * 0.22, 0.77 + relief * 0.18, 0.82 + relief * 0.16),
		rock: new THREE.Color().setRGB(0.42 + relief * 0.18, 0.52 + relief * 0.17, 0.58 + relief * 0.16),
		valley: new THREE.Color().setRGB(0.54 + relief * 0.18, 0.65 + relief * 0.18, 0.71 + relief * 0.16),
	};
	if (planetClass === 'lava') return {
		plain: new THREE.Color().setRGB(0.20 + relief * 0.40, 0.035 + relief * 0.10, 0.01),
		rock: new THREE.Color().setRGB(0.08 + relief * 0.18, 0.018 + relief * 0.04, 0.008),
		valley: new THREE.Color().setRGB(0.30 + relief * 0.44, 0.055 + relief * 0.12, 0.012),
	};
	return {
		plain: new THREE.Color().setRGB(0.15 + relief * 0.22, 0.21 + relief * 0.24, 0.10 + relief * 0.12),
		rock: new THREE.Color().setRGB(0.14 + relief * 0.18, 0.14 + relief * 0.17, 0.12 + relief * 0.14),
		valley: new THREE.Color().setRGB(0.10 + relief * 0.15, 0.18 + relief * 0.20, 0.09 + relief * 0.11),
	};
}

type TerrainPalette = {
	plain: THREE.Color;
	rock: THREE.Color;
	valley: THREE.Color;
};