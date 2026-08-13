import * as THREE from 'three';

import type { HorizonCulling } from '@conduit/web3d/performance';

import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainSource,
} from './TerrainSource';
import {
	appendRegularGridIndices,
	createStitchedGridIndices,
	type TerrainGridStitchEdges,
	getCubeFaceIndex,
} from './terrain/TerrainGeometryUtils';

export type {
	CubeFace,
	PatchBounds,
} from './TerrainSource';

export type AdaptiveDetailLodOptions = {
	enabled: boolean;
	maxBoost: number;
	minLevel: number;
	maxCameraHeightMultiplier: number;
	coastWeight: number;
	reliefWeight: number;
	mountainWeight: number;
};

export type LodOptions = {
	maxLevel: number;
	splitMultiplier: number;
	allowMerge?: boolean;
	splitBudget?: {
		remaining: number;
	};
	adaptiveDetail?: AdaptiveDetailLodOptions;
};

export type TerrainPatchLeaf = {
	patch: TerrainPatch;
	face: CubeFace;
	bounds: PatchBounds;
	level: number;
	address: TerrainPatchAddress;
};

export type TerrainPatchAddress = {
	id: string;
	faceId: number;
	level: number;
	bounds: PatchBounds;
	edges: {
		top: TerrainPatchEdgeAddress;
		right: TerrainPatchEdgeAddress;
		bottom: TerrainPatchEdgeAddress;
		left: TerrainPatchEdgeAddress;
	};
};

export type TerrainPatchEdgeAddress = {
	id: string;
	cubeEdgeKey: string;
	min: number;
	max: number;
};

type PatchDetailFactors = {
	coastFactor: number;
	reliefFactor: number;
	mountainFactor: number;
};

function createTerrainPatchAddress(
	face: CubeFace,
	bounds: PatchBounds,
	level: number,
): TerrainPatchAddress {
	const faceId = getCubeFaceIndex(face.normal);
	const addressBounds = {
		...bounds,
	};

	return {
		id: [
			`f${faceId}`,
			`l${level}`,
			`x${numberKey(addressBounds.x)}`,
			`y${numberKey(addressBounds.y)}`,
			`s${numberKey(addressBounds.size)}`,
		].join('/'),
		faceId,
		level,
		bounds: addressBounds,
		edges: {
			top: createTerrainPatchEdgeAddress(
				face,
				faceId,
				'top',
				addressBounds.x,
				addressBounds.y,
				addressBounds.x + addressBounds.size,
				addressBounds.y,
			),
			right: createTerrainPatchEdgeAddress(
				face,
				faceId,
				'right',
				addressBounds.x + addressBounds.size,
				addressBounds.y,
				addressBounds.x + addressBounds.size,
				addressBounds.y + addressBounds.size,
			),
			bottom: createTerrainPatchEdgeAddress(
				face,
				faceId,
				'bottom',
				addressBounds.x,
				addressBounds.y + addressBounds.size,
				addressBounds.x + addressBounds.size,
				addressBounds.y + addressBounds.size,
			),
			left: createTerrainPatchEdgeAddress(
				face,
				faceId,
				'left',
				addressBounds.x,
				addressBounds.y,
				addressBounds.x,
				addressBounds.y + addressBounds.size,
			),
		},
	};
}

function createTerrainPatchEdgeAddress(
	face: CubeFace,
	faceId: number,
	localEdge: 'top' | 'right' | 'bottom' | 'left',
	startX: number,
	startY: number,
	endX: number,
	endY: number,
): TerrainPatchEdgeAddress {
	const start = getCubePointForFace(face, startX, startY);
	const end = getCubePointForFace(face, endX, endY);
	const epsilon = 0.000001;
	const fixedAxes: string[] = [];
	let variableAxis = -1;

	for (let axis = 0; axis < 3; axis++) {
		const startValue = start.getComponent(axis);
		const endValue = end.getComponent(axis);

		if (
			Math.abs(startValue - endValue) <= epsilon &&
			Math.abs(Math.abs(startValue) - 1) <= epsilon
		) {
			fixedAxes.push(`${axis}:${Math.sign(startValue)}`);
			continue;
		}

		variableAxis = axis;
	}

	const startValue =
		      variableAxis >= 0
		      ? start.getComponent(variableAxis)
		      : 0;

	const endValue =
		      variableAxis >= 0
		      ? end.getComponent(variableAxis)
		      : 0;

	const cubeEdgeKey =
		      fixedAxes.length === 2 && variableAxis >= 0
		      ? fixedAxes.sort().join('|')
		      : `face:${faceId}:${localEdge}`;

	const min = Math.min(startValue, endValue);
	const max = Math.max(startValue, endValue);

	return {
		id: [
			cubeEdgeKey,
			`a${numberKey(min)}`,
			`b${numberKey(max)}`,
		].join('/'),
		cubeEdgeKey,
		min,
		max,
	};
}

function getCubePointForFace(
	face: CubeFace,
	cubeX: number,
	cubeY: number,
): THREE.Vector3 {
	return face.normal
		.clone()
		.add(
			face.right
				.clone()
				.multiplyScalar(cubeX),
		)
		.add(
			face.up
				.clone()
				.multiplyScalar(cubeY),
		);
}

function numberKey(value: number): string {
	return value.toFixed(6);
}

export class TerrainPatch extends THREE.Group {
	private readonly mesh: THREE.Mesh;
	private readonly childrenPatches: TerrainPatch[] = [];
	private readonly terrainGrid: TerrainGrid;
	private readonly detailFactors: PatchDetailFactors;
	private readonly patchAddress: TerrainPatchAddress;
	private readonly patchOrigin: THREE.Vector3;
	private stitchEdges: TerrainGridStitchEdges = {
		top: false,
		right: false,
		bottom: false,
		left: false,
	};
	private morphFactor: number;

	constructor(
		private readonly face: CubeFace,
		private readonly bounds: PatchBounds,
		private readonly radius: number,
		private readonly resolution: number,
		private readonly material: THREE.Material,
		private readonly terrainSource: TerrainSource,
		private readonly level: number = 0,
		private readonly useGpuVertexDisplacement: boolean = false,
		private readonly terrainHeightScale = 1,
	) {
		super();
		this.morphFactor = level <= 2 ? 1 : 0;

		this.name = `TerrainPatch L${level}`;
		this.patchAddress = createTerrainPatchAddress(
			this.face,
			this.bounds,
			this.level,
		);

		this.terrainGrid = this.terrainSource.getPatchGrid(
			this.face,
			this.bounds,
			this.resolution,
		);
		this.patchOrigin = this.getCenterLocal();

		this.detailFactors = this.computePatchDetailFactors();

		this.mesh = new THREE.Mesh(
			this.createGeometry(),
			this.material,
		);
		this.mesh.position.copy(this.patchOrigin);
		this.mesh.onBeforeRender = () => {
			const shaderMaterial = this.mesh.material as THREE.ShaderMaterial;
			const morphUniform = shaderMaterial.uniforms?.uTerrainMorph;
			if (morphUniform) morphUniform.value = this.morphFactor;
		};
		this.mesh.frustumCulled = false;

		this.add(this.mesh);
	}

	setFrustumCullingEnabled(enabled: boolean): void {
		this.mesh.frustumCulled = enabled;

		for (const child of this.childrenPatches) {
			child.setFrustumCullingEnabled(enabled);
		}
	}

	setEdgeStitching(edges: TerrainGridStitchEdges): void {
		if (
			this.stitchEdges.top === edges.top &&
			this.stitchEdges.right === edges.right &&
			this.stitchEdges.bottom === edges.bottom &&
			this.stitchEdges.left === edges.left
		) {
			return;
		}

		this.stitchEdges = { ...edges };
		this.mesh.geometry.setIndex(
			createStitchedGridIndices(this.resolution, edges),
		);
	}

	updateLOD(
		cameraPosition: THREE.Vector3,
		options: LodOptions,
		horizonCulling?: HorizonCulling,
	): void {
		this.morphFactor = Math.min(1, this.morphFactor + 0.14);
		const center = this.getCenterLocal();

		if (horizonCulling) {
			const patchRadius = this.getPatchBoundingRadiusLocal(center);
			const cullingResult = horizonCulling.testPatchSphere(
				cameraPosition,
				center,
				patchRadius,
			);

			if (!cullingResult.visible) {
				this.setSubtreeVisible(false);
					return;
			}

			this.restoreVisibleState();
		}

		const distance = center.distanceTo(cameraPosition);

		const baseSplitDistance =
			      this.radius * this.bounds.size * options.splitMultiplier;

		const adaptiveBoost = this.getAdaptiveDetailBoost(
			cameraPosition,
			options,
		);

		const splitDistance =
			      baseSplitDistance *
			      (1.0 + adaptiveBoost);

		const mergeDistance = splitDistance * 1.90;

		const shouldSplit =
			      distance < splitDistance &&
			      this.level < options.maxLevel;

		if (shouldSplit && this.childrenPatches.length === 0) {
			const canSplit =
				      !options.splitBudget ||
				      options.splitBudget.remaining > 0;

			if (canSplit) {
				this.split();

				if (options.splitBudget) {
					options.splitBudget.remaining--;
				}
			}
		}

		if (this.childrenPatches.length > 0) {
			if (options.allowMerge !== false && distance > mergeDistance) {
				this.merge();
				return;
			}

			this.childrenPatches
				.slice()
				.sort((a, b) => (
						a.getCenterLocal().distanceToSquared(cameraPosition) -
						b.getCenterLocal().distanceToSquared(cameraPosition)
				))
				.forEach((child) => {
					child.updateLOD(
						cameraPosition,
						options,
						horizonCulling,
					);
				});
		}
	}

	split(): void {
		if (this.childrenPatches.length > 0) {
			return;
		}

		this.mesh.visible = false;

		const half = this.bounds.size / 2;

		const childBounds: PatchBounds[] = [
			{
				x: this.bounds.x,
				y: this.bounds.y,
				size: half,
			},
			{
				x: this.bounds.x + half,
				y: this.bounds.y,
				size: half,
			},
			{
				x: this.bounds.x,
				y: this.bounds.y + half,
				size: half,
			},
			{
				x: this.bounds.x + half,
				y: this.bounds.y + half,
				size: half,
			},
		];

		for (const bounds of childBounds) {
			const child = new TerrainPatch(
				this.face,
				bounds,
				this.radius,
				this.resolution,
				this.material,
				this.terrainSource,
				this.level + 1,
				this.useGpuVertexDisplacement,
				this.terrainHeightScale,
			);

			this.childrenPatches.push(child);
			this.add(child);
		}
	}

	canSplit(maxLevel: number): boolean {
		return this.childrenPatches.length === 0 &&
		       this.level < maxLevel;
	}

	collectLeaves(
		leaves: TerrainPatchLeaf[],
	): void {
		if (this.childrenPatches.length === 0) {
			leaves.push({
				patch: this,
				face: this.face,
				bounds: {
					...this.bounds,
				},
				level: this.level,
				address:
					this.patchAddress ??
					createTerrainPatchAddress(
						this.face,
						this.bounds,
						this.level,
					),
			});
			return;
		}

		for (const child of this.childrenPatches) {
			child.collectLeaves(leaves);
		}
	}

	merge(): void {
		for (const child of this.childrenPatches) {
			child.disposeDeep();
			this.remove(child);
		}

		this.childrenPatches.length = 0;
		this.mesh.visible = true;
	}

	disposeDeep(): void {
		for (const child of this.childrenPatches) {
			child.disposeDeep();
			this.remove(child);
		}

		this.childrenPatches.length = 0;
		this.mesh.geometry.dispose();
	}

	getStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
		morphingPatches: number;
	} {
		let totalPatches = 1;
		let visibleMeshes = this.mesh.visible ? 1 : 0;
		let maxLevel = this.level;
		let morphingPatches = this.mesh.visible && this.morphFactor < 1 ? 1 : 0;

		for (const child of this.childrenPatches) {
			const childStats = child.getStats();

			totalPatches += childStats.totalPatches;
			visibleMeshes += childStats.visibleMeshes;
			maxLevel = Math.max(maxLevel, childStats.maxLevel);
			morphingPatches += childStats.morphingPatches;
		}

		return {
			totalPatches,
			visibleMeshes,
			maxLevel,
			morphingPatches,
		};
	}

	forceSplitToLevel(targetLevel: number): void {
		if (this.level >= targetLevel) {
			return;
		}

		this.split();

		for (const child of this.childrenPatches) {
			child.forceSplitToLevel(targetLevel);
		}
	}


	private getAdaptiveDetailBoost(
		cameraPosition: THREE.Vector3,
		options: LodOptions,
	): number {
		const adaptiveDetail = options.adaptiveDetail;

		if (!adaptiveDetail?.enabled) {
			return 0;
		}

		if (this.level < adaptiveDetail.minLevel) {
			return 0;
		}

		const cameraHeight = Math.max(
			0,
			cameraPosition.length() - this.radius,
		);

		const maxCameraHeight =
			      this.radius *
			      adaptiveDetail.maxCameraHeightMultiplier;

		const heightInfluence =
			      1.0 -
			      this.smoothstep(
				      maxCameraHeight * 0.42,
				      maxCameraHeight,
				      cameraHeight,
			      );

		if (heightInfluence <= 0.001) {
			return 0;
		}

		const detailScore = this.clamp01(
			this.detailFactors.coastFactor *
			adaptiveDetail.coastWeight +
			this.detailFactors.reliefFactor *
			adaptiveDetail.reliefWeight +
			this.detailFactors.mountainFactor *
			adaptiveDetail.mountainWeight,
		);

		return detailScore *
		       adaptiveDetail.maxBoost *
		       heightInfluence;
	}

	private computePatchDetailFactors(): PatchDetailFactors {
		const rowSize = this.resolution + 1;
		const sampleCount = rowSize * rowSize;

		let coastMax = 0;
		let coastSum = 0;

		let gradientMax = 0;
		let gradientSum = 0;
		let gradientCount = 0;

		let minHeight = Number.POSITIVE_INFINITY;
		let maxHeight = Number.NEGATIVE_INFINITY;

		let mountainMax = 0;
		let mountainSum = 0;

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				const index = x + y * rowSize;

				const landMask = this.terrainGrid.landMasks[index];
				const height = this.terrainGrid.heights[index];
				const mountainMask = this.terrainGrid.mountainMasks[index];

				const coastDistance = Math.abs(landMask - 0.55);

				const coastValue =
					      1.0 -
					      this.smoothstep(
						      0.035,
						      0.235,
						      coastDistance,
					      );

				coastMax = Math.max(coastMax, coastValue);
				coastSum += coastValue;

				minHeight = Math.min(minHeight, height);
				maxHeight = Math.max(maxHeight, height);

				mountainMax = Math.max(mountainMax, mountainMask);
				mountainSum += mountainMask;

				if (x < rowSize - 1) {
					const rightIndex = index + 1;

					const gradient = Math.abs(
						landMask -
						this.terrainGrid.landMasks[rightIndex],
					);

					gradientMax = Math.max(gradientMax, gradient);
					gradientSum += gradient;
					gradientCount++;
				}

				if (y < rowSize - 1) {
					const downIndex = index + rowSize;

					const gradient = Math.abs(
						landMask -
						this.terrainGrid.landMasks[downIndex],
					);

					gradientMax = Math.max(gradientMax, gradient);
					gradientSum += gradient;
					gradientCount++;
				}
			}
		}

		const coastAverage = coastSum / sampleCount;
		const gradientAverage = gradientSum / Math.max(1, gradientCount);

		const coastFactor = this.clamp01(
			coastMax * 0.52 +
			coastAverage * 0.24 +
			this.smoothstep(0.04, 0.36, gradientMax) * 0.18 +
			this.smoothstep(0.01, 0.08, gradientAverage) * 0.06,
		);

		const heightRange = maxHeight - minHeight;

		const reliefFactor = this.clamp01(
			this.smoothstep(0.012, 0.080, heightRange) * 0.74 +
			this.smoothstep(0.035, 0.145, maxHeight) * 0.26,
		);

		const mountainFactor = this.clamp01(
			mountainMax * 0.76 +
			(mountainSum / sampleCount) * 0.24,
		);

		return {
			coastFactor,
			reliefFactor,
			mountainFactor,
		};
	}

	private smoothstep(
		edge0: number,
		edge1: number,
		value: number,
	): number {
		const t = this.clamp01(
			(value - edge0) /
			(edge1 - edge0),
		);

		return t * t * (3 - 2 * t);
	}

	private clamp01(value: number): number {
		return Math.max(
			0,
			Math.min(1, value),
		);
	}

	private restoreVisibleState(): void {
		if (this.childrenPatches.length > 0) {
			this.mesh.visible = false;

			for (const child of this.childrenPatches) {
				child.restoreVisibleState();
			}

			return;
		}

		this.mesh.visible = true;
	}

	private setSubtreeVisible(visible: boolean): void {
		this.mesh.visible = visible && this.childrenPatches.length === 0;

		for (const child of this.childrenPatches) {
			child.setSubtreeVisible(visible);
		}
	}

	getCenterLocal(): THREE.Vector3 {
		const cubeX = this.bounds.x + this.bounds.size / 2;
		const cubeY = this.bounds.y + this.bounds.size / 2;

		const sphereNormal = this.getSphereNormal(cubeX, cubeY);
		const spherePoint = this.getTerrainPoint(sphereNormal);

		return spherePoint;
	}

	private getPatchBoundingRadiusLocal(centerLocal: THREE.Vector3): number {
		const corners = [
			this.getPointLocal(this.bounds.x, this.bounds.y),
			this.getPointLocal(this.bounds.x + this.bounds.size, this.bounds.y),
			this.getPointLocal(this.bounds.x, this.bounds.y + this.bounds.size),
			this.getPointLocal(
				this.bounds.x + this.bounds.size,
				this.bounds.y + this.bounds.size,
			),
		];

		let maxDistance = 0;

		for (const corner of corners) {
			maxDistance = Math.max(
				maxDistance,
				corner.distanceTo(centerLocal),
			);
		}

		return maxDistance + this.radius * this.bounds.size * 0.14 + 0.26;
	}

	private getPointLocal(cubeX: number, cubeY: number): THREE.Vector3 {
		const sphereNormal = this.getSphereNormal(cubeX, cubeY);
		const spherePoint = this.getTerrainPoint(sphereNormal);

		return spherePoint;
	}

	private createGeometry(): THREE.BufferGeometry {
		const colors: number[] = [];
		const positions: number[] = [];
		const sphereNormals: number[] = [];
		const terrainNormals: number[] = [];
		const terrainHeights: number[] = [];
		const terrainDisplacements: number[] = [];
		const landMasks: number[] = [];
		const mountainMasks: number[] = [];
		const terrainDataUvs: number[] = [];
		const patchOrigins: number[] = [];
		const indices: number[] = [];

		const rowSize = this.resolution + 1;

		const terrainFaceIndex = this.getTerrainFaceIndex();
		const atlasColumn = terrainFaceIndex % 3;
		const atlasRow = Math.floor(terrainFaceIndex / 3);

		const atlasFaceUvInset = 2.0 / 2048.0;

		for (let y = 0; y <= this.resolution; y++) {
			for (let x = 0; x <= this.resolution; x++) {
				const index = x + y * rowSize;

				const localU = x / this.resolution;
				const localV = y / this.resolution;

				const cubeX = this.bounds.x + localU * this.bounds.size;
				const cubeY = this.bounds.y + localV * this.bounds.size;

				const faceU = THREE.MathUtils.clamp(
					(cubeX + 1.0) * 0.5,
					0,
					1,
				);

				const faceV = THREE.MathUtils.clamp(
					(cubeY + 1.0) * 0.5,
					0,
					1,
				);

				const atlasFaceU = THREE.MathUtils.lerp(
					atlasFaceUvInset,
					1.0 - atlasFaceUvInset,
					faceU,
				);

				const atlasFaceV = THREE.MathUtils.lerp(
					atlasFaceUvInset,
					1.0 - atlasFaceUvInset,
					faceV,
				);

				terrainDataUvs.push(
					(atlasColumn + atlasFaceU) / 3.0,
					(atlasRow + atlasFaceV) / 2.0,
				);
				patchOrigins.push(
					this.patchOrigin.x,
					this.patchOrigin.y,
					this.patchOrigin.z,
				);

				const sphereNormal = this.getSphereNormal(cubeX, cubeY);
				const height = this.terrainGrid.heights[index];
				const landMask = this.terrainGrid.landMasks[index];
				const mountainMask = this.terrainGrid.mountainMasks[index];
				const renderSpherePoint = sphereNormal
					.clone()
					.multiplyScalar(
						this.radius +
						(this.useGpuVertexDisplacement
							? 0
							: height * this.terrainHeightScale),
					)
					.sub(this.patchOrigin);

				const colorIndex = index * 3;

				positions.push(
					renderSpherePoint.x,
					renderSpherePoint.y,
					renderSpherePoint.z,
				);

				sphereNormals.push(sphereNormal.x, sphereNormal.y, sphereNormal.z);

				colors.push(
					this.terrainGrid.colors[colorIndex + 0],
					this.terrainGrid.colors[colorIndex + 1],
					this.terrainGrid.colors[colorIndex + 2],
				);

				terrainHeights.push(height);
				terrainDisplacements.push(
					height * this.terrainHeightScale,
				);
				landMasks.push(landMask);
				mountainMasks.push(mountainMask);
			}
		}

		this.buildTerrainNormals(
			sphereNormals,
			terrainNormals,
			rowSize,
		);

		appendRegularGridIndices(indices, this.resolution, rowSize);

		const geometry = new THREE.BufferGeometry();
		const morphPositions = this.createCoarseMorphPositions(
			positions,
			rowSize,
		);

		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(colors, 3),
		);

		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(positions, 3),
		);

		geometry.setAttribute(
			'morphPosition',
			new THREE.Float32BufferAttribute(morphPositions, 3),
		);

		geometry.setAttribute(
			'normal',
			new THREE.Float32BufferAttribute(terrainNormals, 3),
		);

		/**
		 * Stable local sphere normal.
		 *
		 * WebGPU/TSL procedural detail should sample in local planet space,
		 * same as the GLSL reference. This keeps surface noise independent
		 * from patch edge normal smoothing and world-space lighting.
		 */
		geometry.setAttribute(
			'sphereNormal',
			new THREE.Float32BufferAttribute(sphereNormals, 3),
		);

		geometry.setAttribute(
			'terrainHeight',
			new THREE.Float32BufferAttribute(terrainHeights, 1),
		);

		geometry.setAttribute(
			'terrainDisplacement',
			new THREE.Float32BufferAttribute(terrainDisplacements, 1),
		);

		geometry.setAttribute(
			'landMask',
			new THREE.Float32BufferAttribute(landMasks, 1),
		);

		geometry.setAttribute(
			'mountainMask',
			new THREE.Float32BufferAttribute(mountainMasks, 1),
		);

		geometry.setAttribute(
			'terrainDataUv',
			new THREE.Float32BufferAttribute(terrainDataUvs, 2),
		);

		geometry.setAttribute(
			'patchOrigin',
			new THREE.Float32BufferAttribute(patchOrigins, 3),
		);

		geometry.setIndex(indices);
		geometry.computeBoundingSphere();

		return geometry;
	}

	private createCoarseMorphPositions(
		positions: number[],
		rowSize: number,
	): number[] {
		const result: number[] = [];
		const read = (x: number, y: number, component: number): number =>
			positions[(x + y * rowSize) * 3 + component];

		for (let y = 0; y <= this.resolution; y++) {
			for (let x = 0; x <= this.resolution; x++) {
				const x0 = x - x % 2;
				const y0 = y - y % 2;
				const x1 = Math.min(this.resolution, x0 + 2);
				const y1 = Math.min(this.resolution, y0 + 2);
				const tx = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
				const ty = y1 === y0 ? 0 : (y - y0) / (y1 - y0);

				for (let component = 0; component < 3; component++) {
					const top = THREE.MathUtils.lerp(
						read(x0, y0, component),
						read(x1, y0, component),
						tx,
					);
					const bottom = THREE.MathUtils.lerp(
						read(x0, y1, component),
						read(x1, y1, component),
						tx,
					);
					result.push(THREE.MathUtils.lerp(top, bottom, ty));
				}
			}
		}

		return result;
	}

	private buildTerrainNormals(
		sphereNormals: number[],
		terrainNormals: number[],
		rowSize: number,
	): void {
		const getSphereNormal = (
			x: number,
			y: number,
			out: THREE.Vector3,
		): THREE.Vector3 => {
			const clampedX = THREE.MathUtils.clamp(x, 0, rowSize - 1);
			const clampedY = THREE.MathUtils.clamp(y, 0, rowSize - 1);
			const index = (clampedX + clampedY * rowSize) * 3;

			return out.set(
				sphereNormals[index + 0],
				sphereNormals[index + 1],
				sphereNormals[index + 2],
			);
		};

		const sampleStep = Math.max(
			0.0005,
			this.bounds.size / Math.max(1, this.resolution),
		);

		const sampleTerrainPoint = (
			cubeX: number,
			cubeY: number,
			out: THREE.Vector3,
		): THREE.Vector3 => {
			const sampleNormal = this.getSphereNormal(cubeX, cubeY);

			return out.copy(this.getTerrainPoint(sampleNormal));
		};

		const pMinusX = new THREE.Vector3();
		const pPlusX = new THREE.Vector3();
		const pMinusY = new THREE.Vector3();
		const pPlusY = new THREE.Vector3();
		const tangentX = new THREE.Vector3();
		const tangentY = new THREE.Vector3();
		const normal = new THREE.Vector3();
		const sphereNormal = new THREE.Vector3();

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				getSphereNormal(x, y, sphereNormal);

				const localU = x / Math.max(1, rowSize - 1);
				const localV = y / Math.max(1, rowSize - 1);
				const cubeX = this.bounds.x + localU * this.bounds.size;
				const cubeY = this.bounds.y + localV * this.bounds.size;

				sampleTerrainPoint(cubeX - sampleStep, cubeY, pMinusX);
				sampleTerrainPoint(cubeX + sampleStep, cubeY, pPlusX);
				sampleTerrainPoint(cubeX, cubeY - sampleStep, pMinusY);
				sampleTerrainPoint(cubeX, cubeY + sampleStep, pPlusY);

				tangentX.subVectors(pPlusX, pMinusX);
				tangentY.subVectors(pPlusY, pMinusY);

				normal.crossVectors(tangentX, tangentY);

				if (normal.lengthSq() < 0.0000001) {
					normal.copy(sphereNormal);
				} else {
					normal.normalize();

					if (normal.dot(sphereNormal) < 0) {
						normal.multiplyScalar(-1);
					}

					normal
						.lerp(sphereNormal, 0.025)
						.normalize();
				}

				terrainNormals.push(normal.x, normal.y, normal.z);
			}
		}
	}


	private getTerrainFaceIndex(): number {
		return getCubeFaceIndex(this.face.normal);
	}

	private getTerrainPoint(sphereNormal: THREE.Vector3): THREE.Vector3 {
		const sample = this.terrainSource.sampleNormal(sphereNormal);

		return sphereNormal
			.clone()
			.multiplyScalar(
				this.radius + sample.height * this.terrainHeightScale,
			);
	}

	private getSphereNormal(
		cubeX: number,
		cubeY: number,
	): THREE.Vector3 {
		return this.getCubePoint(cubeX, cubeY)
			.normalize();
	}

	private getCubePoint(
		cubeX: number,
		cubeY: number,
	): THREE.Vector3 {
		return this.face.normal
			.clone()
			.add(
				this.face.right
					.clone()
					.multiplyScalar(cubeX),
			)
			.add(
				this.face.up
					.clone()
					.multiplyScalar(cubeY),
			);
	}

}
