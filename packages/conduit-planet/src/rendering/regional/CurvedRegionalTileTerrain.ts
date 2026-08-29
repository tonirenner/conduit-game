import * as THREE from 'three';
import type { PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';
import { evaluateSurfaceTerrainMaterial } from '../surface/SurfaceTerrainMaterial';

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
 * the canonical PlanetTerrainSampler elevation. LOD is selected per altitude
 * band, but all tiles in one build use the same edge resolution. Keeping
 * neighbouring tile borders identical avoids T-junctions and visible cracks
 * while retaining real geometry LOD as the camera approaches the surface.
 * All tiles are merged into one BufferGeometry / draw call.
 *
 * Broad material color is evaluated through the same canonical Surface material
 * evaluator used by SurfaceView. Regional intentionally does not inherit the
 * fragment-scale micro-normal/cavity detail yet; those remain representation-
 * specific until the broad Regional -> Surface handoff is visually continuous.
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
		depthTest: false,
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
		const ownsDepth = opacity > 0.96;
		this.material.opacity = opacity;
		// During Orbit -> Regional handoff the two terrain representations are
		// intentionally almost co-planar. Testing the transparent RegionalView
		// against OrbitView's depth buffer produces a regular checker/diamond
		// pattern as fragments alternately win and lose the depth test. While the
		// RegionalView is blending, render it as the overlay it conceptually is.
		// Once it owns the view, restore normal depth behaviour for terrain.
		this.material.depthTest = ownsDepth;
		this.material.depthWrite = ownsDepth;
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
		// Regional is a finite cap around the camera nadir. Matching only the
		// mathematical horizon is too tight for an oblique camera: terrain relief,
		// projection and anchor hysteresis can expose the patch boundary as a dark
		// band before Surface has taken over. Keep a generous guard band around the
		// visible cap so Regional always remains the continuous curved backdrop.
		const coverageAngle = THREE.MathUtils.clamp(
			horizonAngle * 1.6 + THREE.MathUtils.degToRad(6),
			THREE.MathUtils.degToRad(8),
			THREE.MathUtils.degToRad(55),
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

	private getTileSegments(): number {
		// A tile edge may only meet another edge with the exact same vertex
		// distribution. Mixing spatial resolutions inside one patch produced
		// T-junctions because the projected spherical/elevation edges are curved,
		// so high-resolution border vertices did not lie on the coarse chords.
		// Keep LOD altitude-driven until explicit edge stitching is introduced.
		switch (this.lodProfileKey) {
			case 'far':
				return FAR_TILE_SEGMENTS;
			case 'mid':
				return MID_TILE_SEGMENTS;
			case 'near':
				return NEAR_TILE_SEGMENTS;
			case 'ground':
			default:
				return CENTER_TILE_SEGMENTS;
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
		const tileSegments = this.getTileSegments();

		for (let tileY = 0; tileY < TILE_COUNT; tileY++) {
			for (let tileX = 0; tileX < TILE_COUNT; tileX++) {
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
						const slope = THREE.MathUtils.clamp(
							(1 - THREE.MathUtils.clamp(sample.normal.dot(sample.direction), -1, 1)) * 8,
							0,
							1,
						);
						const surfaceMaterial = evaluateSurfaceTerrainMaterial(
							this.definition,
							{
								direction: sample.direction,
								detailOffset: this.sampler.terrainSeedConfig.detailOffset,
								height: sample.rawTerrain.height,
								landMask: sample.landMask,
								mountainMask: sample.rawTerrain.mountainMask,
								erosionMask: sample.rawTerrain.erosionMask,
								riverMask: sample.rawTerrain.riverMask,
								volcanicMask: sample.volcanicMask,
								isWater: sample.isWater,
								slope,
							},
							color,
						);

						positions.push(
							direction.x * radius,
							direction.y * radius,
							direction.z * radius,
						);
						normals.push(direction.x, direction.y, direction.z);
						colors.push(
							surfaceMaterial.color.r,
							surfaceMaterial.color.g,
							surfaceMaterial.color.b,
						);
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
