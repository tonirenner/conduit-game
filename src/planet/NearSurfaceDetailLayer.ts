import * as THREE from 'three';

import type { SurfaceRenderProfile } from './rendering/SurfaceRenderProfile';
import type { PlanetClass } from './model/PlanetDefinition';

export type NearSurfaceBiome =
	| 'ocean'
	| 'coast'
	| 'grassland'
	| 'forest'
	| 'rocky'
	| 'desert'
	| 'snow'
	| 'barren';

export type NearSurfacePlacementSample = {
	height: number;
	surfaceRadius: number;

	landMask: number;
	mountainMask: number;
	slope: number;

	temperature: number;
	humidity: number;
	aridity: number;
	vegetation: number;
	snow: number;

	biome: NearSurfaceBiome;
};

export type NearSurfaceDetailLayerOptions = {
	radius: number;
	seed: number;
	planetClass: PlanetClass | string;
	surfaceProfile: SurfaceRenderProfile | null;

	/**
	 * Phase 9c:
	 *
	 * Exact placement sampler from Planet.ts.
	 * This connects placement to the same terrain/climate logic used by the
	 * planet surface instead of using a fake local noise mask.
	 */
	sampleSurface?: (
		normal: THREE.Vector3,
	) => NearSurfacePlacementSample | null;
};

/**
 * Phase 9c.4:
 *
 * Terrain/biome/climate bound near-surface detail layer.
 *
 * Dry-land probe placement hotfix.
 *
 * Fixes:
 * - no more free-floating prop carpet
 * - placement is bound to terrain land mask
 * - rocks react to mountain mask / slope / aridity
 * - tufts react to humidity / vegetation / snow / slope
 * - patches avoid steep, snowy and ocean areas
 *
 * Still intentionally approximate:
 * - exact terrain atlas readback is not used here yet
 * - sampleSurface currently comes from CPU terrain/climate samplers
 */
export class NearSurfaceDetailLayer {
	public readonly group: THREE.Group;

	private readonly rocks: THREE.InstancedMesh;
	private readonly tufts: THREE.InstancedMesh;
	private readonly groundPatches: THREE.InstancedMesh;

	private readonly rng: () => number;

	private readonly dummy = new THREE.Object3D();
	private readonly scratchA = new THREE.Vector3();
	private readonly scratchB = new THREE.Vector3();
	private readonly scratchC = new THREE.Vector3();
	private readonly scratchQuaternion = new THREE.Quaternion();

	private lastAnchorNormal = new THREE.Vector3(0, 1, 0);
	private initialized = false;

	private lastVisibility = 0;
	private lastRockCount = 0;
	private lastTuftCount = 0;
	private lastPatchCount = 0;

	private readonly debugMode =
		                 typeof window !== 'undefined' &&
		                 new URLSearchParams(window.location.search).get('nearDebug') === '1';

	constructor(
		private readonly options: NearSurfaceDetailLayerOptions,
	) {
		this.rng = createSeededRandom((options.seed ^ 0x9ea5cafe) >>> 0);

		this.group = new THREE.Group();
		this.group.name = 'NearSurfaceDetailLayer';
		this.group.visible = false;

		this.rocks = this.createRockInstances();
		this.tufts = this.createTuftInstances();
		this.groundPatches = this.createGroundPatchInstances();

		this.group.add(this.groundPatches);
		this.group.add(this.rocks);
		this.group.add(this.tufts);
	}

	update(
		cameraPosition: THREE.Vector3,
		deltaSeconds: number,
	): void {
		if (!this.shouldRenderForPlanet()) {
			this.group.visible = false;
			this.lastVisibility = 0;
			return;
		}

		const heightAboveSurface =
			      cameraPosition.length() -
			      this.options.radius;

		const visibility = getNearSurfaceVisibility(
			heightAboveSurface,
			this.options.radius,
			this.debugMode,
		);

		this.lastVisibility = visibility;

		if (visibility <= 0.001) {
			this.group.visible = false;
			return;
		}

		this.group.visible = true;

		const anchorNormal = this.scratchA
			.copy(cameraPosition)
			.normalize();

		const shouldRebuild =
			      !this.initialized ||
			      anchorNormal.dot(this.lastAnchorNormal) < 0.99935;

		if (shouldRebuild) {
			this.rebuildPatch(anchorNormal);
			this.lastAnchorNormal.copy(anchorNormal);
			this.initialized = true;
		}

		const alpha = THREE.MathUtils.clamp(visibility, 0, 1);
		const debugBoost = this.debugMode ? 0.18 : 0.0;

		setMaterialOpacity(
			this.rocks.material,
			THREE.MathUtils.clamp(0.70 * alpha + debugBoost, 0, 0.88),
		);

		setMaterialOpacity(
			this.tufts.material,
			THREE.MathUtils.clamp(0.36 * alpha + debugBoost, 0, 0.66),
		);

		setMaterialOpacity(
			this.groundPatches.material,
			THREE.MathUtils.clamp(0.15 * alpha + debugBoost * 0.75, 0, 0.42),
		);

		this.tufts.rotation.y += deltaSeconds * 0.00002;
	}

	getDebugStats(): {
		enabled: boolean;
		visible: boolean;
		alpha: number;
		rocks: number;
		tufts: number;
		patches: number;
		debug: boolean;
	} {
		return {
			enabled: this.shouldRenderForPlanet(),
			visible: this.group.visible,
			alpha: this.lastVisibility,
			rocks: this.lastRockCount,
			tufts: this.lastTuftCount,
			patches: this.lastPatchCount,
			debug: this.debugMode,
		};
	}

	dispose(): void {
		this.rocks.geometry.dispose();
		this.tufts.geometry.dispose();
		this.groundPatches.geometry.dispose();

		disposeMaterial(this.rocks.material);
		disposeMaterial(this.tufts.material);
		disposeMaterial(this.groundPatches.material);
	}

	private shouldRenderForPlanet(): boolean {
		const profile = this.options.surfaceProfile;

		if (!profile?.enabled) {
			return false;
		}

		if (this.options.planetClass === 'lava') {
			return false;
		}

		if (
			this.options.planetClass === 'gas_giant' ||
			this.options.planetClass === 'ice_giant'
		) {
			return false;
		}

		return (
			profile.palette === 'earthlike' ||
			profile.palette === 'oceanic' ||
			profile.palette === 'rocky' ||
			this.options.planetClass === 'terrestrial' ||
			this.options.planetClass === 'ocean'
		);
	}

	private rebuildPatch(anchorNormal: THREE.Vector3): void {
		const right = this.scratchB;
		const forward = this.scratchC;

		createTangentBasis(anchorNormal, right, forward);

		const patchRadius =
			      this.options.radius *
			      (this.debugMode ? 0.28 : 0.20);

		this.placeGroundPatches(anchorNormal, right, forward, patchRadius);
		this.placeRocks(anchorNormal, right, forward, patchRadius);
		this.placeTufts(anchorNormal, right, forward, patchRadius);
	}

	private createRockInstances(): THREE.InstancedMesh {
		const geometry = new THREE.DodecahedronGeometry(
			this.options.radius * (this.debugMode ? 0.012 : 0.0058),
			0,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                color: new THREE.Color(this.debugMode ? 0xffcc33 : 0x4b4437),
			                                                roughness: 0.97,
			                                                metalness: 0.02,
			                                                transparent: true,
			                                                opacity: 0.0,
			                                                depthWrite: true,
			                                                depthTest: true,
		                                                });

		const mesh = new THREE.InstancedMesh(
			geometry,
			material,
			NEAR_DETAIL_ROCK_CAPACITY,
		);

		mesh.name = 'NearSurfaceRocks';
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		mesh.frustumCulled = false;
		mesh.renderOrder = 5;
		mesh.count = 0;

		return mesh;
	}

	private createTuftInstances(): THREE.InstancedMesh {
		const geometry = new THREE.ConeGeometry(
			this.options.radius * (this.debugMode ? 0.006 : 0.0026),
			this.options.radius * (this.debugMode ? 0.036 : 0.018),
			5,
			1,
			false,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                color: new THREE.Color(this.debugMode ? 0x38ff55 : 0x2f5f2a),
			                                                roughness: 0.92,
			                                                metalness: 0.0,
			                                                transparent: true,
			                                                opacity: 0.0,
			                                                depthWrite: true,
			                                                depthTest: true,
		                                                });

		const mesh = new THREE.InstancedMesh(
			geometry,
			material,
			NEAR_DETAIL_TUFT_CAPACITY,
		);

		mesh.name = 'NearSurfaceVegetationTufts';
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		mesh.frustumCulled = false;
		mesh.renderOrder = 6;
		mesh.count = 0;

		return mesh;
	}

	private createGroundPatchInstances(): THREE.InstancedMesh {
		const geometry = new THREE.CircleGeometry(
			this.options.radius * (this.debugMode ? 0.038 : 0.018),
			12,
		);

		const material = new THREE.MeshBasicMaterial({
			                                             color: new THREE.Color(this.debugMode ? 0x00ccff : 0x20351f),
			                                             transparent: true,
			                                             opacity: 0.0,
			                                             depthWrite: false,
			                                             depthTest: true,
			                                             side: THREE.DoubleSide,
		                                             });

		const mesh = new THREE.InstancedMesh(
			geometry,
			material,
			NEAR_DETAIL_PATCH_CAPACITY,
		);

		mesh.name = 'NearSurfaceGroundPatches';
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		mesh.frustumCulled = false;
		mesh.renderOrder = 4;
		mesh.count = 0;

		return mesh;
	}

	private placeGroundPatches(
		anchorNormal: THREE.Vector3,
		right: THREE.Vector3,
		forward: THREE.Vector3,
		patchRadius: number,
	): void {
		let placed = 0;

		for (
			let attempt = 0;
			attempt < NEAR_DETAIL_PATCH_CAPACITY * 9 &&
			placed < NEAR_DETAIL_PATCH_CAPACITY;
			attempt++
		) {
			const normal = this.getCandidateNormal(
				anchorNormal,
				right,
				forward,
				patchRadius * 1.05,
				attempt,
				11,
				0.60,
			);

			const sample = this.getPlacementSample(normal);

			if (!sample || !this.acceptGroundPatch(sample)) {
				continue;
			}

			if (!this.isDryPlacementArea(normal, sample, patchRadius * 0.055)) {
				continue;
			}

			const scale =
				      this.options.radius *
				      (this.debugMode
				       ? 0.042 + this.rng() * 0.060
				       : 0.012 + this.rng() * 0.030);

			this.placeFlatInstanceOnSphere(
				this.groundPatches,
				placed,
				normal,
				this.getSurfaceRadiusForPlacement(
					sample,
					this.debugMode ? 1.012 : 1.004,
				),
				scale,
				0.45 + this.rng() * 0.55,
			);

			placed++;
		}

		this.lastPatchCount = placed;
		this.groundPatches.count = placed;
		this.groundPatches.instanceMatrix.needsUpdate = true;
	}

	private placeRocks(
		anchorNormal: THREE.Vector3,
		right: THREE.Vector3,
		forward: THREE.Vector3,
		patchRadius: number,
	): void {
		let placed = 0;

		for (
			let attempt = 0;
			attempt < NEAR_DETAIL_ROCK_CAPACITY * 10 &&
			placed < NEAR_DETAIL_ROCK_CAPACITY;
			attempt++
		) {
			const normal = this.getCandidateNormal(
				anchorNormal,
				right,
				forward,
				patchRadius,
				attempt,
				17,
				0.72,
			);

			const sample = this.getPlacementSample(normal);

			if (!sample || !this.acceptRock(sample)) {
				continue;
			}

			if (!this.isDryPlacementArea(normal, sample, patchRadius * 0.070)) {
				continue;
			}

			const rockyScaleBoost =
				      sample.biome === 'rocky'
				      ? 0.30
				      : sample.biome === 'desert' || sample.biome === 'barren'
				        ? 0.18
				        : 0.0;

			const scale =
				      this.debugMode
				      ? 0.62 + this.rng() * 1.28
				      : 0.22 + rockyScaleBoost + this.rng() * 0.62;

			this.placeRaisedInstanceOnSphere(
				this.rocks,
				placed,
				normal,
				this.getSurfaceRadiusForPlacement(
					sample,
					this.debugMode
					? 1.018 + this.rng() * 0.010
					: 1.006 + this.rng() * 0.006,
				),
				scale,
			);

			placed++;
		}

		this.lastRockCount = placed;
		this.rocks.count = placed;
		this.rocks.instanceMatrix.needsUpdate = true;
	}

	private placeTufts(
		anchorNormal: THREE.Vector3,
		right: THREE.Vector3,
		forward: THREE.Vector3,
		patchRadius: number,
	): void {
		let placed = 0;

		for (
			let attempt = 0;
			attempt < NEAR_DETAIL_TUFT_CAPACITY * 11 &&
			placed < NEAR_DETAIL_TUFT_CAPACITY;
			attempt++
		) {
			const normal = this.getCandidateNormal(
				anchorNormal,
				right,
				forward,
				patchRadius * 0.88,
				attempt,
				29,
				0.76,
			);

			const sample = this.getPlacementSample(normal);

			if (!sample || !this.acceptTuft(sample)) {
				continue;
			}

			if (!this.isDryPlacementArea(normal, sample, patchRadius * 0.050)) {
				continue;
			}

			const densityBoost =
				      (sample.biome === 'forest' ? 0.45 : 0) +
				      (sample.biome === 'grassland' ? 0.25 : 0) +
				      (sample.biome === 'coast' ? 0.12 : 0) +
				      sample.humidity * 0.20 -
				      sample.aridity * 0.15;

			if (
				this.rng() >
				THREE.MathUtils.clamp(
					0.45 + densityBoost,
					0.18,
					0.96,
				)
			) {
				continue;
			}

			const scale =
				      this.debugMode
				      ? 0.70 + this.rng() * 1.05
				      : 0.24 + this.rng() * 0.62;

			this.placeRaisedInstanceOnSphere(
				this.tufts,
				placed,
				normal,
				this.getSurfaceRadiusForPlacement(
					sample,
					this.debugMode ? 1.025 : 1.010,
				),
				scale,
			);

			placed++;
		}

		this.lastTuftCount = placed;
		this.tufts.count = placed;
		this.tufts.instanceMatrix.needsUpdate = true;
	}

	private getCandidateNormal(
		anchorNormal: THREE.Vector3,
		right: THREE.Vector3,
		forward: THREE.Vector3,
		patchRadius: number,
		index: number,
		salt: number,
		clusterPower: number,
	): THREE.Vector3 {
		const random = createSeededRandom(
			(
				this.options.seed ^
				(index * 374761393) ^
				(salt * 668265263) ^
				Math.floor((anchorNormal.x + 2) * 10000) ^
				Math.floor((anchorNormal.y + 2) * 30000) ^
				Math.floor((anchorNormal.z + 2) * 70000)
			) >>> 0,
		);

		const clusterAngle = random() * Math.PI * 2;
		const clusterDistance =
			      Math.pow(random(), clusterPower) *
			      patchRadius *
			      0.54;

		const localAngle =
			      clusterAngle +
			      (random() - 0.5) * 1.3;

		const localDistance =
			      Math.pow(random(), 1.9) *
			      patchRadius *
			      0.36;

		const dx =
			      Math.cos(clusterAngle) * clusterDistance +
			      Math.cos(localAngle) * localDistance;

		const dy =
			      Math.sin(clusterAngle) * clusterDistance +
			      Math.sin(localAngle) * localDistance;

		const local = anchorNormal
			.clone()
			.multiplyScalar(this.options.radius)
			.addScaledVector(right, dx)
			.addScaledVector(forward, dy);

		return local.normalize();
	}

	private getPlacementSample(
		normal: THREE.Vector3,
	): NearSurfacePlacementSample | null {
		if (this.options.sampleSurface) {
			return this.options.sampleSurface(normal);
		}

		const fallbackLand =
			      this.options.surfaceProfile?.hasOcean
			      ? this.fallbackLandMask(normal)
			      : 1.0;

		return {
			height: 0,
			surfaceRadius: this.options.radius,
			landMask: fallbackLand,
			mountainMask: 0,
			slope: 0,
			temperature: this.options.surfaceProfile?.climateTemperature ?? 0.5,
			humidity: this.options.surfaceProfile?.climateHumidity ?? 0.45,
			aridity: this.options.surfaceProfile?.climateAridity ?? 0.45,
			vegetation: fallbackLand > 0.55 ? 0.45 : 0,
			snow: 0,
			biome: fallbackLand > 0.55 ? 'grassland' : 'ocean',
		};
	}

	private acceptGroundPatch(
		sample: NearSurfacePlacementSample,
	): boolean {
		if (!isSafeDryLand(sample, 0.94)) {
			return false;
		}

		if (sample.biome === 'ocean' || sample.biome === 'coast') {
			return false;
		}

		if (sample.slope > 0.38) {
			return false;
		}

		if (sample.snow > 0.65) {
			return false;
		}

		return true;
	}

	private acceptRock(
		sample: NearSurfacePlacementSample,
	): boolean {
		if (!isSafeDryLand(sample, 0.92)) {
			return false;
		}

		if (sample.biome === 'ocean') {
			return false;
		}

		const rockyScore =
			      sample.mountainMask * 0.46 +
			      sample.slope * 0.34 +
			      sample.aridity * 0.18 +
			      (1 - sample.vegetation) * 0.12;

		if (sample.biome === 'coast') {
			return false;
		}

		if (sample.biome === 'rocky' || sample.biome === 'barren') {
			return rockyScore > 0.22;
		}

		if (sample.biome === 'desert') {
			return rockyScore > 0.30;
		}

		return rockyScore > 0.46;
	}

	private acceptTuft(
		sample: NearSurfacePlacementSample,
	): boolean {
		if (!isSafeDryLand(sample, 0.96)) {
			return false;
		}

		if (
			sample.biome === 'ocean' ||
			sample.biome === 'coast' ||
			sample.biome === 'rocky' ||
			sample.biome === 'barren'
		) {
			return false;
		}

		if (sample.snow > 0.30) {
			return false;
		}

		if (sample.slope > 0.30) {
			return false;
		}

		if (sample.humidity < 0.34) {
			return false;
		}

		if (sample.aridity > 0.74) {
			return false;
		}

		return true;
	}

	private isDryPlacementArea(
		normal: THREE.Vector3,
		centerSample: NearSurfacePlacementSample,
		probeDistance: number,
	): boolean {
		if (!isSafeDryLand(centerSample, 0.96)) {
			return false;
		}

		const right = new THREE.Vector3();
		const forward = new THREE.Vector3();

		createTangentBasis(
			normal,
			right,
			forward,
		);

		const probes = [
			this.offsetNormal(normal, right, probeDistance),
			this.offsetNormal(normal, right, -probeDistance),
			this.offsetNormal(normal, forward, probeDistance),
			this.offsetNormal(normal, forward, -probeDistance),
			this.offsetNormal(
				this.offsetNormal(normal, right, probeDistance * 0.72),
				forward,
				probeDistance * 0.72,
			),
			this.offsetNormal(
				this.offsetNormal(normal, right, -probeDistance * 0.72),
				forward,
				-probeDistance * 0.72,
			),
		];

		for (const probeNormal of probes) {
			const sample = this.getPlacementSample(probeNormal);

			if (!sample || !isSafeDryLand(sample, 0.94)) {
				return false;
			}
		}

		return true;
	}

	private offsetNormal(
		base: THREE.Vector3,
		tangent: THREE.Vector3,
		amount: number,
	): THREE.Vector3 {
		return base.clone()
			.addScaledVector(tangent, amount)
			.normalize();
	}

	private getSurfaceRadiusForPlacement(
		sample: NearSurfacePlacementSample,
		baseLift: number,
	): number {
		const terrainRadius =
			      sample.surfaceRadius > 0
			      ? sample.surfaceRadius
			      : this.options.radius + sample.height;

		return Math.max(
			this.options.radius * baseLift,
			terrainRadius + this.options.radius * (baseLift - 1.0),
		);
	}

	private fallbackLandMask(normal: THREE.Vector3): number {
		const continent =
			      this.fallbackNoise(normal, 191) * 0.62 +
			      this.fallbackNoise(normal.clone().multiplyScalar(2.1), 293) * 0.38;

		const oceanLevel =
			      THREE.MathUtils.clamp(
				      this.options.surfaceProfile?.oceanLevel ?? 0.45,
				      0.18,
				      0.72,
			      );

		const landThreshold =
			      THREE.MathUtils.lerp(
				      0.42,
				      0.64,
				      oceanLevel,
			      );

		return continent > landThreshold ? 1.0 : 0.0;
	}

	private fallbackNoise(
		normal: THREE.Vector3,
		salt: number,
	): number {
		return valueNoise3D(
			normal.x * 3.7 + this.options.seed * 0.000013,
			normal.y * 3.7 + this.options.seed * 0.000017,
			normal.z * 3.7 + this.options.seed * 0.000019,
			(this.options.seed ^ salt) >>> 0,
		);
	}

	private placeRaisedInstanceOnSphere(
		mesh: THREE.InstancedMesh,
		index: number,
		normal: THREE.Vector3,
		radius: number,
		scale: number,
	): void {
		this.dummy.position.copy(normal.clone().multiplyScalar(radius));

		this.scratchQuaternion.setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			normal,
		);

		this.dummy.quaternion.copy(this.scratchQuaternion);
		this.dummy.rotateY(this.rng() * Math.PI * 2);
		this.dummy.rotateX((this.rng() - 0.5) * 0.18);
		this.dummy.rotateZ((this.rng() - 0.5) * 0.18);

		this.dummy.scale.setScalar(scale);
		this.dummy.updateMatrix();

		mesh.setMatrixAt(index, this.dummy.matrix);
	}

	private placeFlatInstanceOnSphere(
		mesh: THREE.InstancedMesh,
		index: number,
		normal: THREE.Vector3,
		radius: number,
		scale: number,
		aspect: number,
	): void {
		this.dummy.position.copy(normal.clone().multiplyScalar(radius));

		this.scratchQuaternion.setFromUnitVectors(
			new THREE.Vector3(0, 0, 1),
			normal,
		);

		this.dummy.quaternion.copy(this.scratchQuaternion);
		this.dummy.rotateZ(this.rng() * Math.PI * 2);
		this.dummy.scale.set(scale, scale * aspect, scale);
		this.dummy.updateMatrix();

		mesh.setMatrixAt(index, this.dummy.matrix);
	}
}

const NEAR_DETAIL_ROCK_CAPACITY = 80;
const NEAR_DETAIL_TUFT_CAPACITY = 150;
const NEAR_DETAIL_PATCH_CAPACITY = 36;

function isSafeDryLand(
	sample: NearSurfacePlacementSample,
	minLandMask: number,
): boolean {
	/**
	 * Phase 9c.4:
	 *
	 * The visual water/coast shader still treats a broad landMask band as
	 * water/coastal transition. Near details should only spawn on unmistakable
	 * dry land until atlas sampling is wired in.
	 */
	if (sample.landMask < minLandMask) {
		return false;
	}

	if (sample.biome === 'ocean' || sample.biome === 'coast') {
		return false;
	}

	if (sample.height <= 0.006) {
		return false;
	}

	return true;
}

function getNearSurfaceVisibility(
	heightAboveSurface: number,
	planetRadius: number,
	debugMode: boolean,
): number {
	/**
	 * Phase 9c.4:
	 *
	 * The strict land-only filter from 9c.2 fixed ocean placement, but the
	 * layer became too late/subtle in approach. Start fading in earlier while
	 * keeping the actual hard land-only placement rules.
	 */
	const fadeInStart = planetRadius * (debugMode ? 1.25 : 1.05);
	const fadeInEnd = planetRadius * (debugMode ? 0.42 : 0.36);
	const fadeOutNearGround = planetRadius * 0.020;

	const distanceFade =
		      1 -
		      THREE.MathUtils.smoothstep(
			      heightAboveSurface,
			      fadeInEnd,
			      fadeInStart,
		      );

	const groundFade =
		      THREE.MathUtils.smoothstep(
			      heightAboveSurface,
			      fadeOutNearGround,
			      planetRadius * 0.10,
		      );

	return THREE.MathUtils.clamp(distanceFade * groundFade, 0, 1);
}

function createTangentBasis(
	normal: THREE.Vector3,
	outRight: THREE.Vector3,
	outForward: THREE.Vector3,
): void {
	const up =
		      Math.abs(normal.y) < 0.92
		      ? new THREE.Vector3(0, 1, 0)
		      : new THREE.Vector3(1, 0, 0);

	outRight.copy(up).cross(normal).normalize();
	outForward.copy(normal).cross(outRight).normalize();
}

function valueNoise3D(
	x: number,
	y: number,
	z: number,
	seed: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;

	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const uz = fz * fz * (3 - 2 * fz);

	const c000 = hash3(ix, iy, iz, seed);
	const c100 = hash3(ix + 1, iy, iz, seed);
	const c010 = hash3(ix, iy + 1, iz, seed);
	const c110 = hash3(ix + 1, iy + 1, iz, seed);
	const c001 = hash3(ix, iy, iz + 1, seed);
	const c101 = hash3(ix + 1, iy, iz + 1, seed);
	const c011 = hash3(ix, iy + 1, iz + 1, seed);
	const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

	const x00 = lerp(c000, c100, ux);
	const x10 = lerp(c010, c110, ux);
	const x01 = lerp(c001, c101, ux);
	const x11 = lerp(c011, c111, ux);

	const y0 = lerp(x00, x10, uy);
	const y1 = lerp(x01, x11, uy);

	return lerp(y0, y1, uz);
}

function hash3(
	x: number,
	y: number,
	z: number,
	seed: number,
): number {
	let h = seed >>> 0;

	h ^= Math.imul(x, 374761393);
	h ^= Math.imul(y, 668265263);
	h ^= Math.imul(z, 2147483647);
	h = Math.imul(h ^ (h >>> 13), 1274126177);

	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function lerp(
	a: number,
	b: number,
	t: number,
): number {
	return a + (b - a) * t;
}

function setMaterialOpacity(
	material: THREE.Material | THREE.Material[],
	opacity: number,
): void {
	if (Array.isArray(material)) {
		for (const item of material) {
			setSingleMaterialOpacity(item, opacity);
		}

		return;
	}

	setSingleMaterialOpacity(material, opacity);
}

function setSingleMaterialOpacity(
	material: THREE.Material,
	opacity: number,
): void {
	if (!('opacity' in material)) {
		return;
	}

	(material as THREE.Material & { opacity: number }).opacity = opacity;
	material.transparent = opacity < 0.999;
	material.needsUpdate = true;
}

function disposeMaterial(
	material: THREE.Material | THREE.Material[],
): void {
	if (Array.isArray(material)) {
		for (const item of material) {
			item.dispose();
		}

		return;
	}

	material.dispose();
}

function createSeededRandom(seed: number): () => number {
	let value = seed >>> 0;

	return () => {
		value += 0x6d2b79f5;

		let mixed = value;

		mixed = Math.imul(
			mixed ^ (mixed >>> 15),
			mixed | 1,
		);

		mixed ^= mixed + Math.imul(
			mixed ^ (mixed >>> 7),
			mixed | 61,
		);

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}
