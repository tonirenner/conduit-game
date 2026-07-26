import * as THREE from 'three';

import { HorizonCulling } from './HorizonCulling';

import type {
	CubeFace,
	PatchBounds,
	TerrainGrid,
	TerrainSource,
} from './TerrainSource';

export type {
	CubeFace,
	PatchBounds,
} from './TerrainSource';

export type LodOptions = {
	maxLevel: number;
	splitMultiplier: number;
	allowMerge?: boolean;
	splitBudget?: {
		remaining: number;
	};
};

export class TerrainPatch extends THREE.Group {
	private readonly mesh: THREE.Mesh;
	private readonly childrenPatches: TerrainPatch[] = [];
	private readonly terrainGrid: TerrainGrid;

	constructor(
		private readonly face: CubeFace,
		private readonly bounds: PatchBounds,
		private readonly radius: number,
		private readonly resolution: number,
		private readonly material: THREE.Material,
		private readonly terrainSource: TerrainSource,
		private readonly level: number = 0,
	) {
		super();

		this.name = `TerrainPatch L${level}`;

		this.terrainGrid = this.terrainSource.getPatchGrid(
			this.face,
			this.bounds,
			this.resolution,
		);

		this.mesh = new THREE.Mesh(
			this.createGeometry(),
			this.material,
		);

		this.add(this.mesh);
	}

	updateLOD(
		cameraPosition: THREE.Vector3,
		options: LodOptions,
		horizonCulling?: HorizonCulling,
	): void {
		const center = this.getCenterWorld();

		if (horizonCulling) {
			const patchRadius = this.getPatchBoundingRadiusWorld(center);
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

		const splitDistance =
			      this.radius * this.bounds.size * options.splitMultiplier;

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
					a.getCenterWorld().distanceToSquared(cameraPosition) -
					b.getCenterWorld().distanceToSquared(cameraPosition)
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
			);

			this.childrenPatches.push(child);
			this.add(child);
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
	} {
		let totalPatches = 1;
		let visibleMeshes = this.mesh.visible ? 1 : 0;
		let maxLevel = this.level;

		for (const child of this.childrenPatches) {
			const childStats = child.getStats();

			totalPatches += childStats.totalPatches;
			visibleMeshes += childStats.visibleMeshes;
			maxLevel = Math.max(maxLevel, childStats.maxLevel);
		}

		return {
			totalPatches,
			visibleMeshes,
			maxLevel,
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

	private getCenterWorld(): THREE.Vector3 {
		const cubeX = this.bounds.x + this.bounds.size / 2;
		const cubeY = this.bounds.y + this.bounds.size / 2;

		const sphereNormal = this.getSphereNormal(cubeX, cubeY);
		const spherePoint = this.getTerrainPoint(sphereNormal);

		return this.localToWorld(spherePoint);
	}

	private getPatchBoundingRadiusWorld(centerWorld: THREE.Vector3): number {
		const corners = [
			this.getPointWorld(this.bounds.x, this.bounds.y),
			this.getPointWorld(this.bounds.x + this.bounds.size, this.bounds.y),
			this.getPointWorld(this.bounds.x, this.bounds.y + this.bounds.size),
			this.getPointWorld(
				this.bounds.x + this.bounds.size,
				this.bounds.y + this.bounds.size,
			),
		];

		let maxDistance = 0;

		for (const corner of corners) {
			maxDistance = Math.max(
				maxDistance,
				corner.distanceTo(centerWorld),
			);
		}

		return maxDistance + this.radius * this.bounds.size * 0.14 + 0.26;
	}

	private getPointWorld(cubeX: number, cubeY: number): THREE.Vector3 {
		const sphereNormal = this.getSphereNormal(cubeX, cubeY);
		const spherePoint = this.getTerrainPoint(sphereNormal);

		return this.localToWorld(spherePoint);
	}

	private createGeometry(): THREE.BufferGeometry {
		const colors: number[] = [];
		const positions: number[] = [];
		const sphereNormals: number[] = [];
		const terrainNormals: number[] = [];
		const uvs: number[] = [];
		const terrainHeights: number[] = [];
		const landMasks: number[] = [];
		const mountainMasks: number[] = [];
		const waterHints: number[] = [];
		const indices: number[] = [];

		const rowSize = this.resolution + 1;

		for (let y = 0; y <= this.resolution; y++) {
			for (let x = 0; x <= this.resolution; x++) {
				const index = x + y * rowSize;

				const localU = x / this.resolution;
				const localV = y / this.resolution;

				const cubeX = this.bounds.x + localU * this.bounds.size;
				const cubeY = this.bounds.y + localV * this.bounds.size;

				const sphereNormal = this.getSphereNormal(cubeX, cubeY);
				const height = this.terrainGrid.heights[index];
				const landMask = this.terrainGrid.landMasks[index];
				const mountainMask = this.terrainGrid.mountainMasks[index];
				const waterHint = 1.0 - THREE.MathUtils.smoothstep(
					landMask,
					0.42,
					0.76,
				);

				const spherePoint = sphereNormal
					.clone()
					.multiplyScalar(this.radius + height);

				const colorIndex = index * 3;

				positions.push(spherePoint.x, spherePoint.y, spherePoint.z);
				sphereNormals.push(sphereNormal.x, sphereNormal.y, sphereNormal.z);
				uvs.push(localU, localV);

				colors.push(
					this.terrainGrid.colors[colorIndex + 0],
					this.terrainGrid.colors[colorIndex + 1],
					this.terrainGrid.colors[colorIndex + 2],
				);

				terrainHeights.push(height);
				landMasks.push(landMask);
				mountainMasks.push(mountainMask);
				waterHints.push(waterHint);
			}
		}

		this.buildTerrainNormals(
			positions,
			sphereNormals,
			terrainNormals,
			rowSize,
		);

		for (let y = 0; y < this.resolution; y++) {
			for (let x = 0; x < this.resolution; x++) {
				const a = x + y * rowSize;
				const b = x + (y + 1) * rowSize;
				const c = x + 1 + y * rowSize;
				const d = x + 1 + (y + 1) * rowSize;

				indices.push(a, c, b);
				indices.push(c, d, b);
			}
		}

		this.addSkirts(
			positions,
			terrainNormals,
			uvs,
			colors,
			terrainHeights,
			landMasks,
			mountainMasks,
			waterHints,
			indices,
			rowSize,
		);

		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(colors, 3),
		);

		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(positions, 3),
		);

		/**
		 * Main normal now uses terrain-derived normals.
		 * This means normalWorld in TSL finally sees actual terrain slope.
		 */
		geometry.setAttribute(
			'normal',
			new THREE.Float32BufferAttribute(terrainNormals, 3),
		);

		geometry.setAttribute(
			'uv',
			new THREE.Float32BufferAttribute(uvs, 2),
		);

		geometry.setAttribute(
			'terrainHeight',
			new THREE.Float32BufferAttribute(terrainHeights, 1),
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
			'waterHint',
			new THREE.Float32BufferAttribute(waterHints, 1),
		);

		geometry.setAttribute(
			'terrainNormal',
			new THREE.Float32BufferAttribute(terrainNormals, 3),
		);

		geometry.setIndex(indices);
		geometry.computeBoundingSphere();

		return geometry;
	}

	private buildTerrainNormals(
		positions: number[],
		sphereNormals: number[],
		terrainNormals: number[],
		rowSize: number,
	): void {
		const getPosition = (
			x: number,
			y: number,
			out: THREE.Vector3,
		): THREE.Vector3 => {
			const clampedX = THREE.MathUtils.clamp(x, 0, rowSize - 1);
			const clampedY = THREE.MathUtils.clamp(y, 0, rowSize - 1);
			const index = (clampedX + clampedY * rowSize) * 3;

			return out.set(
				positions[index + 0],
				positions[index + 1],
				positions[index + 2],
			);
		};

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

		const pLeft = new THREE.Vector3();
		const pRight = new THREE.Vector3();
		const pDown = new THREE.Vector3();
		const pUp = new THREE.Vector3();
		const tangentX = new THREE.Vector3();
		const tangentY = new THREE.Vector3();
		const normal = new THREE.Vector3();
		const sphereNormal = new THREE.Vector3();

		for (let y = 0; y < rowSize; y++) {
			for (let x = 0; x < rowSize; x++) {
				getPosition(x - 1, y, pLeft);
				getPosition(x + 1, y, pRight);
				getPosition(x, y - 1, pDown);
				getPosition(x, y + 1, pUp);
				getSphereNormal(x, y, sphereNormal);

				tangentX.subVectors(pRight, pLeft);
				tangentY.subVectors(pUp, pDown);

				normal.crossVectors(tangentX, tangentY);

				if (normal.lengthSq() < 0.0000001) {
					normal.copy(sphereNormal);
				} else {
					normal.normalize();

					if (normal.dot(sphereNormal) < 0) {
						normal.multiplyScalar(-1);
					}

					/**
					 * Blend toward the sphere normal to avoid noisy patch-border shading.
					 * High enough to show mountains, soft enough for orbit.
					 */
					const edgeDistance = Math.min(
						x,
						y,
						rowSize - 1 - x,
						rowSize - 1 - y,
					);

					const edgeBlend = edgeDistance <= 1
					                  ? 0.62
					                  : edgeDistance <= 2
					                    ? 0.38
					                    : 0.18;

					normal
						.lerp(sphereNormal, edgeBlend)
						.normalize();
				}

				terrainNormals.push(normal.x, normal.y, normal.z);
			}
		}
	}

	private addSkirts(
		positions: number[],
		normals: number[],
		uvs: number[],
		colors: number[],
		terrainHeights: number[],
		landMasks: number[],
		mountainMasks: number[],
		waterHints: number[],
		indices: number[],
		rowSize: number,
	): void {
		const top: number[] = [];
		const bottom: number[] = [];
		const left: number[] = [];
		const right: number[] = [];

		for (let i = 0; i < rowSize; i++) {
			top.push(i);
			bottom.push(i + (rowSize - 1) * rowSize);
			left.push(i * rowSize);
			right.push(i * rowSize + (rowSize - 1));
		}

		this.addSkirtEdge(top, positions, normals, uvs, colors, terrainHeights, landMasks, mountainMasks, waterHints, indices);
		this.addSkirtEdge(bottom, positions, normals, uvs, colors, terrainHeights, landMasks, mountainMasks, waterHints, indices);
		this.addSkirtEdge(left, positions, normals, uvs, colors, terrainHeights, landMasks, mountainMasks, waterHints, indices);
		this.addSkirtEdge(right, positions, normals, uvs, colors, terrainHeights, landMasks, mountainMasks, waterHints, indices);
	}

	private addSkirtEdge(
		edgeIndices: number[],
		positions: number[],
		normals: number[],
		uvs: number[],
		colors: number[],
		terrainHeights: number[],
		landMasks: number[],
		mountainMasks: number[],
		waterHints: number[],
		indices: number[],
	): void {
		const skirtIndices: number[] = [];
		const skirtDepth = this.getSkirtDepth();

		for (const sourceIndex of edgeIndices) {
			const pIndex = sourceIndex * 3;
			const uvIndex = sourceIndex * 2;
			const colorIndex = sourceIndex * 3;

			const point = new THREE.Vector3(
				positions[pIndex + 0],
				positions[pIndex + 1],
				positions[pIndex + 2],
			);

			const downDirection = point.clone().normalize();

			const skirtPoint = point
				.clone()
				.addScaledVector(downDirection, -skirtDepth);

			const newIndex = positions.length / 3;

			positions.push(skirtPoint.x, skirtPoint.y, skirtPoint.z);

			normals.push(
				normals[pIndex + 0],
				normals[pIndex + 1],
				normals[pIndex + 2],
			);

			uvs.push(uvs[uvIndex + 0], uvs[uvIndex + 1]);

			colors.push(
				colors[colorIndex + 0],
				colors[colorIndex + 1],
				colors[colorIndex + 2],
			);

			terrainHeights.push(terrainHeights[sourceIndex]);
			landMasks.push(landMasks[sourceIndex]);
			mountainMasks.push(mountainMasks[sourceIndex]);
			waterHints.push(waterHints[sourceIndex]);

			skirtIndices.push(newIndex);
		}

		for (let i = 0; i < edgeIndices.length - 1; i++) {
			const a = edgeIndices[i];
			const b = edgeIndices[i + 1];
			const c = skirtIndices[i];
			const d = skirtIndices[i + 1];

			indices.push(a, b, c);
			indices.push(b, d, c);
		}
	}

	private getTerrainPoint(sphereNormal: THREE.Vector3): THREE.Vector3 {
		const sample = this.terrainSource.sampleNormal(sphereNormal);

		return sphereNormal
			.clone()
			.multiplyScalar(this.radius + sample.height);
	}

	private getSphereNormal(
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
			)
			.normalize();
	}

	private getSkirtDepth(): number {
		return 0.024 * Math.pow(0.72, this.level);
	}
}
