import * as THREE from 'three';

import { getClimateSample } from './Climate';
import { getTerrainHeight, getTerrainSample } from '../utils/noise';
import { logger } from '../utils/logger';
import { HorizonCulling } from './HorizonCulling';

export type CubeFace = {
	normal: THREE.Vector3;
	up: THREE.Vector3;
	right: THREE.Vector3;
};

export type PatchBounds = {
	x: number;
	y: number;
	size: number;
};

export type LodOptions = {
	maxLevel: number;
	splitMultiplier: number;
};

type TerrainSampleData = ReturnType<typeof getTerrainSample>;
type ClimateSampleData = ReturnType<typeof getClimateSample>;

export class TerrainPatch extends THREE.Group {
	private readonly mesh: THREE.Mesh;
	private readonly childrenPatches: TerrainPatch[] = [];
	private readonly skirtDepth = 0.010;

	constructor(
		private readonly face: CubeFace,
		private readonly bounds: PatchBounds,
		private readonly radius: number,
		private readonly resolution: number,
		private readonly material: THREE.Material,
		private readonly level: number = 0,
	) {
		super();

		this.name = `TerrainPatch L${level}`;

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

		const mergeDistance = splitDistance * 1.35;

		if (distance < splitDistance && this.level < options.maxLevel) {
			this.split();
		}

		if (this.childrenPatches.length > 0) {
			if (distance > mergeDistance) {
				this.merge();
				return;
			}

			for (const child of this.childrenPatches) {
				child.updateLOD(cameraPosition, options, horizonCulling);
			}
		}
	}

	split(): void {
		if (this.childrenPatches.length > 0) {
			return;
		}

		this.mesh.visible = false;

		logger.info('LOD split', {
			level: this.level,
			nextLevel: this.level + 1,
			bounds: this.bounds,
		});

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
				this.level + 1,
			);

			this.childrenPatches.push(child);
			this.add(child);
		}
	}

	merge(): void {
		logger.info('LOD merge', {
			level: this.level,
			children: this.childrenPatches.length,
			bounds: this.bounds,
		});

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

		const cubePoint = this.face.normal
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

		const spherePoint = cubePoint
			.normalize()
			.multiplyScalar(this.radius);

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

		// Konservativer Puffer für Terrainhöhe, Skirts und numerische Fehler.
		return maxDistance + this.radius * this.bounds.size * 0.08 + 0.12;
	}

	private getPointWorld(cubeX: number, cubeY: number): THREE.Vector3 {
		const cubePoint = this.face.normal
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

		const sphereNormal = cubePoint.normalize();

		const spherePoint = sphereNormal.multiplyScalar(this.radius);

		return this.localToWorld(spherePoint);
	}

	private createGeometry(): THREE.BufferGeometry {
		const colors: number[] = [];
		const positions: number[] = [];
		const normals: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const rowSize = this.resolution + 1;

		for (let y = 0; y <= this.resolution; y++) {
			for (let x = 0; x <= this.resolution; x++) {
				const localU = x / this.resolution;
				const localV = y / this.resolution;

				const cubeX = this.bounds.x + localU * this.bounds.size;
				const cubeY = this.bounds.y + localV * this.bounds.size;

				const cubePoint = this.face.normal
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

				const sphereNormal = cubePoint
					.clone()
					.normalize();

				const spherePoint = this.getTerrainPoint(sphereNormal);
				const terrainNormal = this.getTerrainNormal(sphereNormal);

				const color = this.getTerrainColor(sphereNormal);

				positions.push(spherePoint.x, spherePoint.y, spherePoint.z);
				normals.push(terrainNormal.x, terrainNormal.y, terrainNormal.z);
				uvs.push(localU, localV);
				colors.push(color.r, color.g, color.b);
			}
		}

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

		this.addSkirts(positions, normals, uvs, colors, indices, rowSize);

		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(colors, 3),
		);

		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(positions, 3),
		);

		geometry.setAttribute(
			'normal',
			new THREE.Float32BufferAttribute(normals, 3),
		);

		geometry.setAttribute(
			'uv',
			new THREE.Float32BufferAttribute(uvs, 2),
		);

		geometry.setIndex(indices);
		geometry.computeBoundingSphere();

		return geometry;
	}

	private addSkirts(
		positions: number[],
		normals: number[],
		uvs: number[],
		colors: number[],
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

		this.addSkirtEdge(top, positions, normals, uvs, colors, indices);
		this.addSkirtEdge(bottom, positions, normals, uvs, colors, indices);
		this.addSkirtEdge(left, positions, normals, uvs, colors, indices);
		this.addSkirtEdge(right, positions, normals, uvs, colors, indices);
	}

	private addSkirtEdge(
		edgeIndices: number[],
		positions: number[],
		normals: number[],
		uvs: number[],
		colors: number[],
		indices: number[],
	): void {
		const skirtIndices: number[] = [];

		for (const sourceIndex of edgeIndices) {
			const pIndex = sourceIndex * 3;
			const uvIndex = sourceIndex * 2;
			const colorIndex = sourceIndex * 3;

			const point = new THREE.Vector3(
				positions[pIndex + 0],
				positions[pIndex + 1],
				positions[pIndex + 2],
			);

			const normal = new THREE.Vector3(
				normals[pIndex + 0],
				normals[pIndex + 1],
				normals[pIndex + 2],
			);

			colors.push(
				colors[colorIndex + 0],
				colors[colorIndex + 1],
				colors[colorIndex + 2],
			);

			const downDirection = point.clone().normalize();

			const skirtPoint = point
				.clone()
				.addScaledVector(downDirection, -this.skirtDepth);

			const newIndex = positions.length / 3;

			positions.push(skirtPoint.x, skirtPoint.y, skirtPoint.z);
			normals.push(normal.x, normal.y, normal.z);
			uvs.push(uvs[uvIndex + 0], uvs[uvIndex + 1]);

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

	private getTerrainColor(sphereNormal: THREE.Vector3): THREE.Color {
		const sample = this.getSmoothedTerrainSample(sphereNormal);

		const land = sample.landMask;
		const height = sample.height;

		const climate = getClimateSample(
			sphereNormal,
			height,
			land,
		);

		const deepWater = new THREE.Color(0x071f2f);
		const midWater = new THREE.Color(0x0b3347);
		const shallowWater = new THREE.Color(0x155463);
		const coastalWater = new THREE.Color(0x1d6a70);
		const wetCoast = new THREE.Color(0x58664f);

		if (land < 0.30) {
			return deepWater.clone().lerp(
				midWater,
				this.smoothstep(0.00, 0.30, land),
			);
		}

		if (land < 0.43) {
			return midWater.clone().lerp(
				shallowWater,
				this.smoothstep(0.30, 0.43, land),
			);
		}

		if (land < 0.54) {
			return shallowWater.clone().lerp(
				coastalWater,
				this.smoothstep(0.43, 0.54, land),
			);
		}

		if (land < 0.62) {
			return coastalWater.clone().lerp(
				wetCoast,
				this.smoothstep(0.54, 0.62, land),
			);
		}

		const color = this.getClimateLandColor(climate, height);

		const coastInfluence =
			      1 -
			      Math.abs(this.clamp01((land - 0.62) / 0.24) * 2 - 1);

		if (coastInfluence > 0) {
			const coastGreen = new THREE.Color(0x496f3f);

			color.lerp(
				coastGreen,
				coastInfluence * climate.humidity * 0.18,
			);
		}

		const rockInfluence =
			      this.smoothstep(0.095, 0.22, height) *
			      (1 - climate.vegetation * 0.55);

		if (rockInfluence > 0) {
			const rock = new THREE.Color(0x706d61);

			color.lerp(
				rock,
				rockInfluence * 0.52,
			);
		}

		if (climate.snow > 0) {
			const snow = new THREE.Color(0xd0d4cb);

			color.lerp(
				snow,
				climate.snow * 0.82,
			);
		}

		const polar = this.smoothstep(0.74, 0.98, Math.abs(sphereNormal.y));

		if (polar > 0) {
			const polarTint = new THREE.Color(0x7d8674);

			color.lerp(
				polarTint,
				polar * 0.14 * (1 - climate.snow),
			);
		}

		return color;
	}

	private getClimateLandColor(
		climate: ClimateSampleData,
		height: number,
	): THREE.Color {
		const coldLand = new THREE.Color(0x667263);
		const humidForest = new THREE.Color(0x2f6b3d);
		const grassland = new THREE.Color(0x5f7840);
		const dryGrass = new THREE.Color(0x8a7a48);
		const semiDry = new THREE.Color(0x8f7045);
		const desert = new THREE.Color(0xa88755);
		const highland = new THREE.Color(0x746f58);

		const temperature = climate.temperature;
		const humidity = climate.humidity;
		const aridity = climate.aridity;
		const vegetation = climate.vegetation;

		const color = grassland.clone();

		color.lerp(
			coldLand,
			(1 - temperature) * 0.30,
		);

		color.lerp(
			humidForest,
			vegetation * 0.42,
		);

		color.lerp(
			dryGrass,
			aridity * 0.24,
		);

		const savanna = this.smoothstep(0.50, 0.82, aridity) *
		                this.smoothstep(0.42, 0.78, temperature);

		color.lerp(
			semiDry,
			savanna * 0.30,
		);

		const desertMask =
			      this.smoothstep(0.72, 0.92, aridity) *
			      (1 - this.smoothstep(0.28, 0.52, humidity));

		color.lerp(
			desert,
			desertMask * 0.55,
		);

		color.lerp(
			highland,
			this.smoothstep(0.065, 0.18, height) * 0.22,
		);

		return color;
	}

	private getBiomeBaseColor(
		biome: ClimateSampleData['biome'],
	): THREE.Color {
		switch (biome) {
			case 'deepOcean':
				return new THREE.Color(0x071f2f);

			case 'shallowOcean':
				return new THREE.Color(0x155463);

			case 'coast':
				return new THREE.Color(0x58664f);

			case 'ice':
				return new THREE.Color(0xbec8c8);

			case 'tundra':
				return new THREE.Color(0x7f856f);

			case 'borealForest':
				return new THREE.Color(0x355738);

			case 'temperateForest':
				return new THREE.Color(0x3e733d);

			case 'rainforest':
				return new THREE.Color(0x24783d);

			case 'grassland':
				return new THREE.Color(0x667f43);

			case 'savanna':
				return new THREE.Color(0x967b43);

			case 'desert':
				return new THREE.Color(0xb28b55);

			case 'dryHills':
				return new THREE.Color(0x786b4c);

			case 'mountain':
				return new THREE.Color(0x6f6d61);

			case 'snow':
				return new THREE.Color(0xd2d5cc);
		}
	}

	private getTerrainPoint(sphereNormal: THREE.Vector3): THREE.Vector3 {
		const height = this.getSmoothedTerrainHeight(sphereNormal);

		return sphereNormal
			.clone()
			.multiplyScalar(this.radius + height);
	}

	private getTerrainNormal(sphereNormal: THREE.Vector3): THREE.Vector3 {
		const epsilon = 0.004;

		const reference =
			      Math.abs(sphereNormal.y) < 0.95
			      ? new THREE.Vector3(0, 1, 0)
			      : new THREE.Vector3(1, 0, 0);

		const tangentA = reference
			.cross(sphereNormal)
			.normalize();

		const tangentB = sphereNormal
			.clone()
			.cross(tangentA)
			.normalize();

		const normalA1 = sphereNormal
			.clone()
			.addScaledVector(tangentA, epsilon)
			.normalize();

		const normalA2 = sphereNormal
			.clone()
			.addScaledVector(tangentA, -epsilon)
			.normalize();

		const normalB1 = sphereNormal
			.clone()
			.addScaledVector(tangentB, epsilon)
			.normalize();

		const normalB2 = sphereNormal
			.clone()
			.addScaledVector(tangentB, -epsilon)
			.normalize();

		const pointA1 = this.getTerrainPoint(normalA1);
		const pointA2 = this.getTerrainPoint(normalA2);
		const pointB1 = this.getTerrainPoint(normalB1);
		const pointB2 = this.getTerrainPoint(normalB2);

		const deltaA = pointA1.sub(pointA2);
		const deltaB = pointB1.sub(pointB2);

		return deltaA.cross(deltaB).normalize();
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

	private getSmoothedTerrainSample(
		sphereNormal: THREE.Vector3,
	): TerrainSampleData {
		const center = getTerrainSample(sphereNormal);

		const {
			      tangentA,
			      tangentB,
		      } = this.getTangentBasis(sphereNormal);

		const epsilon = 0.012;

		const sample1 = getTerrainSample(
			sphereNormal.clone().addScaledVector(tangentA, epsilon).normalize(),
		);

		const sample2 = getTerrainSample(
			sphereNormal.clone().addScaledVector(tangentA, -epsilon).normalize(),
		);

		const sample3 = getTerrainSample(
			sphereNormal.clone().addScaledVector(tangentB, epsilon).normalize(),
		);

		const sample4 = getTerrainSample(
			sphereNormal.clone().addScaledVector(tangentB, -epsilon).normalize(),
		);

		const centerWeight = 0.52;
		const sideWeight = 0.12;

		const landMask =
			      center.landMask * centerWeight +
			      (sample1.landMask + sample2.landMask + sample3.landMask + sample4.landMask) * sideWeight;

		const height =
			      center.height * centerWeight +
			      (sample1.height + sample2.height + sample3.height + sample4.height) * sideWeight;

		return {
			...center,
			landMask,
			height,
		};
	}

	private getSmoothedTerrainHeight(sphereNormal: THREE.Vector3): number {
		const center = getTerrainHeight(sphereNormal);

		const {
			      tangentA,
			      tangentB,
		      } = this.getTangentBasis(sphereNormal);

		const epsilon = 0.010;

		const h1 = getTerrainHeight(
			sphereNormal.clone().addScaledVector(tangentA, epsilon).normalize(),
		);

		const h2 = getTerrainHeight(
			sphereNormal.clone().addScaledVector(tangentA, -epsilon).normalize(),
		);

		const h3 = getTerrainHeight(
			sphereNormal.clone().addScaledVector(tangentB, epsilon).normalize(),
		);

		const h4 = getTerrainHeight(
			sphereNormal.clone().addScaledVector(tangentB, -epsilon).normalize(),
		);

		return (
			center * 0.58 +
			(h1 + h2 + h3 + h4) * 0.105
		);
	}

	private getTangentBasis(sphereNormal: THREE.Vector3): {
		tangentA: THREE.Vector3;
		tangentB: THREE.Vector3;
	} {
		const reference =
			      Math.abs(sphereNormal.y) < 0.95
			      ? new THREE.Vector3(0, 1, 0)
			      : new THREE.Vector3(1, 0, 0);

		const tangentA = reference
			.clone()
			.cross(sphereNormal)
			.normalize();

		const tangentB = sphereNormal
			.clone()
			.cross(tangentA)
			.normalize();

		return {
			tangentA,
			tangentB,
		};
	}

	private smoothstep(edge0: number, edge1: number, value: number): number {
		const x = this.clamp01((value - edge0) / (edge1 - edge0));

		return x * x * (3 - 2 * x);
	}

	private clamp01(value: number): number {
		return Math.max(0, Math.min(1, value));
	}
}
