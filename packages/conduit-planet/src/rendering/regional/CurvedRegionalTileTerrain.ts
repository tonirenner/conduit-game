import * as THREE from 'three';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

const TILE_COUNT = 5;
const FAR_TILE_SEGMENTS = 16;
const MID_TILE_SEGMENTS = 24;
const NEAR_TILE_SEGMENTS = 40;
const CENTER_TILE_SEGMENTS = 64;
const EXTENT_REBUILD_THRESHOLD = 0.12;
const MIN_ANCHOR_STEP_RADIANS = THREE.MathUtils.degToRad(0.35);
const MAX_ANCHOR_STEP_RADIANS = THREE.MathUtils.degToRad(2.0);

/**
 * Geometry-first RegionalView inspired by the OpenWorlds normalized-quad idea.
 *
 * The visible region is split into fixed curved tiles around the camera nadir.
 * Every vertex is projected back onto the planet sphere and then displaced by
 * the canonical PlanetTerrainSampler elevation. LOD is assigned per tile so
 * the centre of the visible region gets real geometry detail while outer tiles
 * remain cheap. All tiles are merged into one BufferGeometry / draw call.
 *
 * Material detail is intentionally minimal here. AO/normal/roughness/hydraulic
 * erosion stay out until the geometry and view continuity are proven stable.
 */
export class CurvedRegionalTileTerrain {
	readonly group = new THREE.Group();

	private readonly sampler: PlanetTerrainSampler;
	private readonly anchor = new THREE.Vector3();
	private readonly material = new THREE.MeshStandardMaterial({
		vertexColors: true,
		metalness: 0,
		roughness: 0.9,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		depthTest: true,
	});
	private mesh: THREE.Mesh | null = null;
	private currentExtent = 1;
	private lodProfileKey = '';

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'CurvedRegionalTileTerrain';
		this.sampler = new PlanetTerrainSampler(definition);
		this.currentExtent = this.getPatchExtent(cameraRenderPosition);
		this.lodProfileKey = this.getLodProfileKey(cameraRenderPosition);
		this.rebuild(cameraRenderPosition);
		this.setOpacity(0);
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const direction = cameraRenderPosition.clone().normalize();
		const extent = this.getPatchExtent(cameraRenderPosition);
		const nextLodProfileKey = this.getLodProfileKey(cameraRenderPosition);
		const extentChanged = Math.abs(extent / Math.max(1e-6, this.currentExtent) - 1) > EXTENT_REBUILD_THRESHOLD;
		const lodChanged = nextLodProfileKey !== this.lodProfileKey;

		const anchorStep = THREE.MathUtils.clamp(
			Math.atan(this.currentExtent) / TILE_COUNT * 0.35,
			MIN_ANCHOR_STEP_RADIANS,
			MAX_ANCHOR_STEP_RADIANS,
		);
		const anchorChanged = direction.dot(this.anchor) < Math.cos(anchorStep);

		if (anchorChanged || extentChanged || lodChanged) {
			this.currentExtent = extent;
			this.lodProfileKey = nextLodProfileKey;
			this.rebuild(cameraRenderPosition);
		}

		this.setOpacity(opacity);
	}

	dispose(): void {
		this.mesh?.geometry.dispose();
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
		const radiusMeters = Math.max(1, this.sampler.radiusMeters);
		const horizonAngle = Math.acos(
			THREE.MathUtils.clamp(radiusMeters / (radiusMeters + altitudeMeters), 0, 1),
		);
		const coverageAngle = THREE.MathUtils.clamp(
			horizonAngle * 1.08 + THREE.MathUtils.degToRad(2),
			THREE.MathUtils.degToRad(4),
			THREE.MathUtils.degToRad(48),
		);
		return Math.tan(coverageAngle);
	}

	private getLodProfileKey(cameraRenderPosition: THREE.Vector3): string {
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		if (altitudeMeters > 3_000_000) return 'far';
		if (altitudeMeters > 700_000) return 'mid';
		if (altitudeMeters > 180_000) return 'near';
		return 'ground';
	}

	private getTileSegments(tileX: number, tileY: number): number {
		const distanceFromCenter = Math.max(
			Math.abs(tileX - Math.floor(TILE_COUNT / 2)),
			Math.abs(tileY - Math.floor(TILE_COUNT / 2)),
		);

		switch (this.lodProfileKey) {
			case 'far':
				return distanceFromCenter === 0 ? MID_TILE_SEGMENTS : FAR_TILE_SEGMENTS;
			case 'mid':
				if (distanceFromCenter === 0) return NEAR_TILE_SEGMENTS;
				if (distanceFromCenter === 1) return MID_TILE_SEGMENTS;
				return FAR_TILE_SEGMENTS;
			case 'near':
				if (distanceFromCenter === 0) return CENTER_TILE_SEGMENTS;
				if (distanceFromCenter === 1) return NEAR_TILE_SEGMENTS;
				return MID_TILE_SEGMENTS;
			case 'ground':
			default:
				if (distanceFromCenter === 0) return CENTER_TILE_SEGMENTS;
				if (distanceFromCenter === 1) return CENTER_TILE_SEGMENTS;
				return NEAR_TILE_SEGMENTS;
		}
	}

	private rebuild(cameraRenderPosition: THREE.Vector3): void {
		this.anchor.copy(cameraRenderPosition).normalize();
		const basis = createBasis(this.anchor);
		const geometry = this.buildGeometry(basis);

		if (this.mesh) {
			this.mesh.geometry.dispose();
			this.mesh.geometry = geometry;
		} else {
			this.mesh = new THREE.Mesh(geometry, this.material);
			this.mesh.name = 'CurvedRegionalTileTerrainMesh';
			this.mesh.frustumCulled = false;
			this.mesh.castShadow = false;
			this.mesh.receiveShadow = true;
			this.group.add(this.mesh);
		}
	}

	private buildGeometry(basis: SurfaceBasis): THREE.BufferGeometry {
		const positions: number[] = [];
		const normals: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];
		const direction = new THREE.Vector3();
		const color = new THREE.Color();
		const tileSpan = (this.currentExtent * 2) / TILE_COUNT;
		const renderMetersScale = this.renderRadius / this.sampler.radiusMeters;

		for (let tileY = 0; tileY < TILE_COUNT; tileY++) {
			for (let tileX = 0; tileX < TILE_COUNT; tileX++) {
				const tileSegments = this.getTileSegments(tileX, tileY);
				const baseVertex = positions.length / 3;

				for (let y = 0; y <= tileSegments; y++) {
					const fy = y / tileSegments;
					const v = -this.currentExtent + (tileY + fy) * tileSpan;
					for (let x = 0; x <= tileSegments; x++) {
						const fx = x / tileSegments;
						const u = -this.currentExtent + (tileX + fx) * tileSpan;
						sampleDirection(direction, basis, u, v);
						const sample = this.sampler.sample(direction, false);
						const radius = this.renderRadius + sample.elevationMeters * renderMetersScale;

						positions.push(
							direction.x * radius,
							direction.y * radius,
							direction.z * radius,
						);
						normals.push(direction.x, direction.y, direction.z);
						resolveTerrainColor(this.definition.class, sample, color);
						colors.push(color.r, color.g, color.b);
					}
				}

				const stride = tileSegments + 1;
				for (let y = 0; y < tileSegments; y++) {
					for (let x = 0; x < tileSegments; x++) {
						const a = baseVertex + y * stride + x;
						const b = a + 1;
						const c = a + stride;
						const d = c + 1;
						indices.push(a, b, c, b, d, c);
					}
				}
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		const vertexCount = positions.length / 3;
		geometry.setIndex(
			vertexCount <= 65_535
				? new THREE.Uint16BufferAttribute(indices, 1)
				: new THREE.Uint32BufferAttribute(indices, 1),
		);
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		return geometry;
	}
}

type SurfaceBasis = {
	up: THREE.Vector3;
	east: THREE.Vector3;
	north: THREE.Vector3;
};

type SurfaceSample = ReturnType<PlanetTerrainSampler['sample']>;

function createBasis(up: THREE.Vector3): SurfaceBasis {
	const reference = Math.abs(up.y) < 0.92
		? new THREE.Vector3(0, 1, 0)
		: new THREE.Vector3(1, 0, 0);
	const east = new THREE.Vector3().crossVectors(reference, up).normalize();
	const north = new THREE.Vector3().crossVectors(up, east).normalize();
	return { up, east, north };
}

function sampleDirection(
	target: THREE.Vector3,
	basis: SurfaceBasis,
	u: number,
	v: number,
): THREE.Vector3 {
	return target
		.copy(basis.up)
		.addScaledVector(basis.east, u)
		.addScaledVector(basis.north, v)
		.normalize();
}

function resolveTerrainColor(
	planetClass: PlanetClass,
	sample: SurfaceSample,
	target: THREE.Color,
): THREE.Color {
	if (sample.isWater) return target.setRGB(0.07, 0.20, 0.30);

	const relief = THREE.MathUtils.clamp(sample.rawTerrain.height, 0, 1);
	const mountain = THREE.MathUtils.clamp(sample.rawTerrain.mountainMask, 0, 1);
	const erosion = THREE.MathUtils.clamp(sample.rawTerrain.erosionMask, 0, 1);
	const palette = getPalette(planetClass);
	const rockBlend = THREE.MathUtils.clamp(mountain * 0.62 + erosion * 0.18, 0, 0.82);

	target.copy(palette.low).lerp(palette.high, relief);
	target.lerp(palette.rock, rockBlend);
	return target;
}

function getPalette(planetClass: PlanetClass): {
	low: THREE.Color;
	high: THREE.Color;
	rock: THREE.Color;
} {
	switch (planetClass) {
		case 'desert': return palette(0x8b5528, 0xd6ad67, 0x714025);
		case 'ice': return palette(0x678096, 0xd8e3e5, 0x536b7c);
		case 'lava': return palette(0x2e1712, 0x8d3c1d, 0x1d1412);
		case 'toxic': return palette(0x4a4d2c, 0x8c9150, 0x3f422d);
		case 'carbon': return palette(0x242424, 0x55514b, 0x171717);
		case 'metal_rich': return palette(0x4a4038, 0x8c7864, 0x403831);
		case 'barren': return palette(0x615446, 0xa28d72, 0x50483f);
		case 'rocky': return palette(0x51483f, 0x9a8871, 0x433c36);
		case 'terrestrial': return palette(0x4f5e35, 0x9c9166, 0x595449);
		case 'ocean': return palette(0x655f46, 0xa79b6f, 0x5a5548);
		default: return palette(0x625548, 0xa48e73, 0x51483f);
	}
}

function palette(low: number, high: number, rock: number) {
	return {
		low: new THREE.Color(low),
		high: new THREE.Color(high),
		rock: new THREE.Color(rock),
	};
}
