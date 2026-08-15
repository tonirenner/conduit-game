import * as THREE from 'three';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

// Nine rings keep the local SurfaceView alive past the geometric horizon even
// on large solid planets during the Regional -> Surface handoff. With the
// 16 km base half extent this covers +/-4096 km instead of +/-1024 km.
const RING_COUNT = 9;
const GRID_CELLS = 24;
const BASE_HALF_EXTENT_METERS = 16_000;
const MIN_RECENTER_DISTANCE_METERS = 24_000;
const MAX_RECENTER_DISTANCE_METERS = 250_000;
const RECENTER_ALTITUDE_FACTOR = 0.18;
const RECENTER_MIN_OPACITY = 0.9;

export type SurfaceClipmapStats = {
	active: boolean;
	draws: number;
	rings: number;
	gridCells: number;
	outerHalfExtentMeters: number;
	recenterDistanceMeters: number;
	indexed: false;
};

type Ring = {
	mesh: THREE.Mesh;
	geometry: THREE.BufferGeometry;
	material: THREE.MeshStandardMaterial;
	template: Float32Array;
	positions: Float32Array;
	normals: Float32Array;
	colors: Float32Array;
};

type CachedSample = {
	x: number;
	y: number;
	z: number;
	nx: number;
	ny: number;
	nz: number;
	r: number;
	g: number;
	b: number;
};

/**
 * SurfaceView clipmap scaffold.
 *
 * The geometry topology is fixed and non-indexed so WebGPU never needs to
 * create/destroy index buffers while views hand over. Vertices are expressed
 * in a local tangent frame where one local unit is one physical meter. The
 * group itself converts that local meter frame into the compact planet render
 * scale.
 *
 * Terrain is sampled only when the local frame recenters. During the approach
 * the initial surface anchor stays stable while Regional still carries the
 * view. Once Surface dominates, recenter distance scales with altitude so
 * camera rotation/panning cannot trigger a full CPU terrain refill every few
 * kilometres.
 */
export class SurfaceClipmapTerrain {
	readonly group = new THREE.Group();

	private readonly sampler: PlanetTerrainSampler;
	private readonly renderMetersScale: number;
	private readonly rings: Ring[] = [];
	private readonly anchorDirection = new THREE.Vector3();
	private readonly tangentX = new THREE.Vector3();
	private readonly tangentZ = new THREE.Vector3();
	private readonly anchorPhysical = new THREE.Vector3();
	private hasAnchor = false;
	private currentRecenterDistanceMeters = MAX_RECENTER_DISTANCE_METERS;

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'PlanetSurfaceClipmapView';
		this.sampler = new PlanetTerrainSampler(definition);
		this.renderMetersScale = renderRadius / this.sampler.radiusMeters;

		for (let level = 0; level < RING_COUNT; level++) {
			const ring = this.createRing(level);
			this.rings.push(ring);
			this.group.add(ring.mesh);
		}

		this.recenter(cameraRenderPosition.clone().normalize());
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
		const altitudeMeters = this.getAltitudeMeters(cameraRenderPosition);
		this.currentRecenterDistanceMeters = this.getRecenterDistanceMeters(altitudeMeters);

		// Keep the handoff anchor stable while Regional is still materially visible.
		// Rebuilding all clipmap rings during that phase caused frame spikes and let
		// the Surface patch wander away from the Regional patch during camera orbit.
		if (alpha >= RECENTER_MIN_OPACITY) {
			const direction = cameraRenderPosition.clone().normalize();
			if (this.needsRecenter(direction, this.currentRecenterDistanceMeters)) {
				this.recenter(direction);
			}
		}

		this.group.visible = alpha > 0.001;
		for (const ring of this.rings) {
			ring.material.opacity = alpha;
			ring.material.depthWrite = alpha > 0.985;
		}
	}

	getStats(): SurfaceClipmapStats {
		return {
			active: this.group.visible,
			draws: this.group.visible ? this.rings.length : 0,
			rings: this.rings.length,
			gridCells: GRID_CELLS,
			outerHalfExtentMeters: BASE_HALF_EXTENT_METERS * (1 << (RING_COUNT - 1)),
			recenterDistanceMeters: this.currentRecenterDistanceMeters,
			indexed: false,
		};
	}

	dispose(): void {
		for (const ring of this.rings) {
			ring.geometry.dispose();
			ring.material.dispose();
		}
		this.rings.length = 0;
		this.group.clear();
	}

	private createRing(level: number): Ring {
		const halfExtent = BASE_HALF_EXTENT_METERS * (1 << level);
		const innerHalfExtent = level === 0 ? 0 : halfExtent * 0.5;
		const template = createRingTemplate(halfExtent, innerHalfExtent, GRID_CELLS);
		const vertexCount = template.length / 2;
		const positions = new Float32Array(vertexCount * 3);
		const normals = new Float32Array(vertexCount * 3);
		const colors = new Float32Array(vertexCount * 3);
		const geometry = new THREE.BufferGeometry();
		const positionAttribute = new THREE.BufferAttribute(positions, 3);
		const normalAttribute = new THREE.BufferAttribute(normals, 3);
		const colorAttribute = new THREE.BufferAttribute(colors, 3);
		positionAttribute.setUsage(THREE.DynamicDrawUsage);
		normalAttribute.setUsage(THREE.DynamicDrawUsage);
		colorAttribute.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute('position', positionAttribute);
		geometry.setAttribute('normal', normalAttribute);
		geometry.setAttribute('color', colorAttribute);

		const material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.93,
			metalness: 0,
			transparent: true,
			opacity: 0,
			depthTest: true,
			depthWrite: false,
		});
		material.name = `PlanetSurfaceClipmapMaterial:${level}`;

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = `PlanetSurfaceClipmapRing:${level}`;
		mesh.frustumCulled = false;
		mesh.renderOrder = 10 + level;

		return { mesh, geometry, material, template, positions, normals, colors };
	}

	private getAltitudeMeters(cameraRenderPosition: THREE.Vector3): number {
		return Math.max(
			0,
			(cameraRenderPosition.length() / this.renderRadius - 1) * this.sampler.radiusMeters,
		);
	}

	private getRecenterDistanceMeters(altitudeMeters: number): number {
		return THREE.MathUtils.clamp(
			altitudeMeters * RECENTER_ALTITUDE_FACTOR,
			MIN_RECENTER_DISTANCE_METERS,
			MAX_RECENTER_DISTANCE_METERS,
		);
	}

	private needsRecenter(direction: THREE.Vector3, thresholdMeters: number): boolean {
		if (!this.hasAnchor) return true;
		const dot = THREE.MathUtils.clamp(this.anchorDirection.dot(direction), -1, 1);
		const arcMeters = Math.acos(dot) * this.sampler.radiusMeters;
		return arcMeters >= thresholdMeters;
	}

	private recenter(direction: THREE.Vector3): void {
		this.anchorDirection.copy(direction).normalize();
		this.hasAnchor = true;

		const reference = Math.abs(this.anchorDirection.y) < 0.92
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		this.tangentX.crossVectors(reference, this.anchorDirection).normalize();
		this.tangentZ.crossVectors(this.anchorDirection, this.tangentX).normalize();

		const anchorSample = this.sampler.sample(this.anchorDirection, false);
		this.anchorPhysical.copy(anchorSample.direction).multiplyScalar(anchorSample.surfaceRadiusMeters);

		const basis = new THREE.Matrix4().makeBasis(
			this.tangentX,
			this.anchorDirection,
			this.tangentZ,
		);
		this.group.position.copy(this.anchorPhysical).multiplyScalar(this.renderMetersScale);
		this.group.quaternion.setFromRotationMatrix(basis);
		this.group.scale.setScalar(this.renderMetersScale);
		this.group.updateMatrix();

		const cache = new Map<string, CachedSample>();
		for (const ring of this.rings) this.fillRing(ring, cache);
	}

	private fillRing(ring: Ring, cache: Map<string, CachedSample>): void {
		const template = ring.template;
		for (let vertex = 0; vertex < template.length / 2; vertex++) {
			const localX = template[vertex * 2];
			const localZ = template[vertex * 2 + 1];
			const key = `${localX}:${localZ}`;
			let sample = cache.get(key);
			if (!sample) {
				sample = this.sampleLocal(localX, localZ);
				cache.set(key, sample);
			}

			const offset = vertex * 3;
			ring.positions[offset] = sample.x;
			ring.positions[offset + 1] = sample.y;
			ring.positions[offset + 2] = sample.z;
			ring.normals[offset] = sample.nx;
			ring.normals[offset + 1] = sample.ny;
			ring.normals[offset + 2] = sample.nz;
			ring.colors[offset] = sample.r;
			ring.colors[offset + 1] = sample.g;
			ring.colors[offset + 2] = sample.b;
		}

		(ring.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
		(ring.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
		ring.geometry.computeBoundingSphere();
	}

	private sampleLocal(localX: number, localZ: number): CachedSample {
		const samplePosition = this.anchorDirection.clone()
			.multiplyScalar(this.sampler.radiusMeters)
			.addScaledVector(this.tangentX, localX)
			.addScaledVector(this.tangentZ, localZ);
		const sampleDirection = samplePosition.normalize();
		const terrain = this.sampler.sample(sampleDirection, false);
		const surfacePoint = terrain.direction.clone().multiplyScalar(terrain.surfaceRadiusMeters);
		const delta = surfacePoint.sub(this.anchorPhysical);
		const color = getSurfaceColor(
			this.definition.class,
			terrain.rawTerrain.height,
			terrain.landMask,
			terrain.isWater,
			new THREE.Color(),
		);

		return {
			x: delta.dot(this.tangentX),
			y: delta.dot(this.anchorDirection),
			z: delta.dot(this.tangentZ),
			nx: terrain.direction.dot(this.tangentX),
			ny: terrain.direction.dot(this.anchorDirection),
			nz: terrain.direction.dot(this.tangentZ),
			r: color.r,
			g: color.g,
			b: color.b,
		};
	}
}

function createRingTemplate(
	halfExtent: number,
	innerHalfExtent: number,
	cells: number,
): Float32Array {
	const vertices: number[] = [];
	const cellSize = (halfExtent * 2) / cells;
	for (let z = 0; z < cells; z++) {
		const z0 = -halfExtent + z * cellSize;
		const z1 = z0 + cellSize;
		const centerZ = (z0 + z1) * 0.5;
		for (let x = 0; x < cells; x++) {
			const x0 = -halfExtent + x * cellSize;
			const x1 = x0 + cellSize;
			const centerX = (x0 + x1) * 0.5;
			if (
				innerHalfExtent > 0 &&
				Math.abs(centerX) < innerHalfExtent &&
				Math.abs(centerZ) < innerHalfExtent
			) {
				continue;
			}

			vertices.push(
				x0, z0,
				x0, z1,
				x1, z0,
				x1, z0,
				x0, z1,
				x1, z1,
			);
		}
	}
	return new Float32Array(vertices);
}

function getSurfaceColor(
	planetClass: PlanetClass,
	height: number,
	landMask: number,
	isWater: boolean,
	target: THREE.Color,
): THREE.Color {
	if (isWater) return target.setRGB(0.08, 0.24, 0.34);
	const palette = getPalette(planetClass);
	const elevation = THREE.MathUtils.clamp((height - 0.36) / 0.52, 0, 1);
	const land = THREE.MathUtils.clamp(landMask, 0, 1);
	target.copy(palette.low).lerp(palette.high, elevation);
	if (planetClass === 'terrestrial' || planetClass === 'ocean') {
		target.lerp(palette.accent, THREE.MathUtils.clamp((land - 0.52) * 1.3, 0, 0.45));
	}
	return target;
}

function getPalette(planetClass: PlanetClass): { low: THREE.Color; high: THREE.Color; accent: THREE.Color } {
	switch (planetClass) {
		case 'desert': return colors(0x8b5528, 0xd6ad67, 0xc78b43);
		case 'ice': return colors(0x678096, 0xd8e3e5, 0x9fb8c8);
		case 'lava': return colors(0x2e1712, 0x8d3c1d, 0xd36324);
		case 'toxic': return colors(0x4a4d2c, 0x8c9150, 0x71803d);
		case 'carbon': return colors(0x242424, 0x55514b, 0x3c3a36);
		case 'metal_rich': return colors(0x4a4038, 0x8c7864, 0x69594c);
		case 'barren': return colors(0x615446, 0xa28d72, 0x7f715f);
		case 'rocky': return colors(0x51483f, 0x9a8871, 0x736453);
		case 'terrestrial': return colors(0x66583d, 0x9c9166, 0x496844);
		case 'ocean': return colors(0x655f46, 0xa79b6f, 0x4d6f52);
		default: return colors(0x625548, 0xa48e73, 0x786858);
	}
}

function colors(low: number, high: number, accent: number) {
	return {
		low: new THREE.Color(low),
		high: new THREE.Color(high),
		accent: new THREE.Color(accent),
	};
}
