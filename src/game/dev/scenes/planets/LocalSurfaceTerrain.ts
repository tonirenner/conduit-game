import * as THREE from 'three';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

const GRID_SEGMENTS = 72;
const HALF_EXTENT_METERS = 2_750_000;
const RECENTER_FRACTION = 0.08;

/**
 * First SurfaceView implementation.
 *
 * This is intentionally a small, stable API boundary rather than the final
 * terrain technology. It reuses one BufferGeometry and resamples it only when
 * the surface anchor moved far enough. A GPU clipmap can replace this class
 * later without changing PlanetViewRuntime.
 */
export class LocalSurfaceTerrain {
	readonly group = new THREE.Group();

	private readonly sampler: PlanetTerrainSampler;
	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.MeshStandardMaterial;
	private readonly mesh: THREE.Mesh;
	private readonly positions: Float32Array;
	private readonly colors: Float32Array;
	private readonly renderMetersScale: number;
	private readonly anchorDirection = new THREE.Vector3();
	private hasAnchor = false;

	constructor(
		private readonly definition: PlanetDefinition,
		private readonly renderRadius: number,
		cameraRenderPosition: THREE.Vector3,
	) {
		this.group.name = 'PlanetSurfaceView';
		this.sampler = new PlanetTerrainSampler(definition);
		this.renderMetersScale = renderRadius / this.sampler.radiusMeters;

		const vertexCount = (GRID_SEGMENTS + 1) * (GRID_SEGMENTS + 1);
		this.positions = new Float32Array(vertexCount * 3);
		this.colors = new Float32Array(vertexCount * 3);
		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
		this.geometry.setIndex(createGridIndices(GRID_SEGMENTS));

		this.material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.92,
			metalness: 0,
			transparent: true,
			opacity: 0,
			depthTest: true,
			depthWrite: false,
		});

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.name = 'PlanetSurfaceLocalGrid';
		this.mesh.frustumCulled = false;
		this.group.add(this.mesh);

		this.recenter(cameraRenderPosition.clone().normalize());
	}

	update(cameraRenderPosition: THREE.Vector3, opacity: number): void {
		const direction = cameraRenderPosition.clone().normalize();
		if (this.needsRecenter(direction)) this.recenter(direction);

		const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
		this.group.visible = alpha > 0.001;
		this.material.opacity = alpha;
		this.material.depthWrite = alpha > 0.985;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
		this.group.clear();
	}

	private needsRecenter(direction: THREE.Vector3): boolean {
		if (!this.hasAnchor) return true;
		const angularThreshold = (
			HALF_EXTENT_METERS * RECENTER_FRACTION
		) / Math.max(1, this.sampler.radiusMeters);
		return this.anchorDirection.dot(direction) < Math.cos(angularThreshold);
	}

	private recenter(direction: THREE.Vector3): void {
		this.anchorDirection.copy(direction).normalize();
		this.hasAnchor = true;

		const reference = Math.abs(this.anchorDirection.y) < 0.92
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		const tangentX = new THREE.Vector3()
			.crossVectors(reference, this.anchorDirection)
			.normalize();
		const tangentZ = new THREE.Vector3()
			.crossVectors(this.anchorDirection, tangentX)
			.normalize();
		const samplePosition = new THREE.Vector3();
		const sampleDirection = new THREE.Vector3();
		const color = new THREE.Color();

		let vertex = 0;
		for (let y = 0; y <= GRID_SEGMENTS; y++) {
			const v = y / GRID_SEGMENTS;
			const localZ = THREE.MathUtils.lerp(-HALF_EXTENT_METERS, HALF_EXTENT_METERS, v);
			for (let x = 0; x <= GRID_SEGMENTS; x++) {
				const u = x / GRID_SEGMENTS;
				const localX = THREE.MathUtils.lerp(-HALF_EXTENT_METERS, HALF_EXTENT_METERS, u);

				samplePosition
					.copy(this.anchorDirection)
					.multiplyScalar(this.sampler.radiusMeters)
					.addScaledVector(tangentX, localX)
					.addScaledVector(tangentZ, localZ);
				sampleDirection.copy(samplePosition).normalize();

				const sample = this.sampler.sample(sampleDirection, false);
				const renderSurfaceRadius = sample.surfaceRadiusMeters * this.renderMetersScale;
				const offset = vertex * 3;
				this.positions[offset] = sample.direction.x * renderSurfaceRadius;
				this.positions[offset + 1] = sample.direction.y * renderSurfaceRadius;
				this.positions[offset + 2] = sample.direction.z * renderSurfaceRadius;

				getSurfaceColor(this.definition.class, sample.rawTerrain.height, sample.landMask, sample.isWater, color);
				this.colors[offset] = color.r;
				this.colors[offset + 1] = color.g;
				this.colors[offset + 2] = color.b;
				vertex++;
			}
		}

		(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
		this.geometry.computeVertexNormals();
		this.geometry.computeBoundingSphere();
	}
}

function createGridIndices(segments: number): Uint32Array {
	const indices = new Uint32Array(segments * segments * 6);
	let offset = 0;
	const stride = segments + 1;
	for (let y = 0; y < segments; y++) {
		for (let x = 0; x < segments; x++) {
			const a = y * stride + x;
			const b = a + 1;
			const c = a + stride;
			const d = c + 1;
			indices[offset++] = a;
			indices[offset++] = c;
			indices[offset++] = b;
			indices[offset++] = b;
			indices[offset++] = c;
			indices[offset++] = d;
		}
	}
	return indices;
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
