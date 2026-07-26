import * as THREE from 'three';

import {
	getTerrainSample,
	type TerrainSample,
} from '../utils/noise';

import { getClimateSample } from './Climate';

import type {
	CubeFace,
	PatchBounds,
} from './TerrainPatch';

export type TerrainHeightGrid = {
	key: string;
	resolution: number;
	rowSize: number;

	heights: Float32Array;
	landMasks: Float32Array;
	continents: Float32Array;
	mountainMasks: Float32Array;

	colors: Float32Array;
};

type CachedTerrainSampleData = {
	height: number;
	landMask: number;
	continent: number;
	mountainMask: number;
};

export class TerrainHeightCache {
	private readonly grids = new Map<string, TerrainHeightGrid>();
	private readonly usage = new Map<string, number>();

	private tick = 0;

	constructor(
		private readonly maxEntries = 1800,
	) {}

	getPatchGrid(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainHeightGrid {
		const key = this.getPatchKey(face, bounds, resolution);

		const existing = this.grids.get(key);

		if (existing) {
			this.touch(key);
			return existing;
		}

		const grid = this.createPatchGrid(
			key,
			face,
			bounds,
			resolution,
		);

		this.grids.set(key, grid);
		this.touch(key);
		this.evictIfNeeded();

		return grid;
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		return getTerrainSample(normal);
	}

	getStats(): {
		entries: number;
		maxEntries: number;
	} {
		return {
			entries: this.grids.size,
			maxEntries: this.maxEntries,
		};
	}

	clear(): void {
		this.grids.clear();
		this.usage.clear();
		this.tick = 0;
	}

	private createPatchGrid(
		key: string,
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): TerrainHeightGrid {
		const rowSize = resolution + 1;
		const vertexCount = rowSize * rowSize;

		const heights = new Float32Array(vertexCount);
		const landMasks = new Float32Array(vertexCount);
		const continents = new Float32Array(vertexCount);
		const mountainMasks = new Float32Array(vertexCount);

		const colors = new Float32Array(vertexCount * 3);

		let index = 0;

		for (let y = 0; y <= resolution; y++) {
			for (let x = 0; x <= resolution; x++) {
				const localU = x / resolution;
				const localV = y / resolution;

				const cubeX = bounds.x + localU * bounds.size;
				const cubeY = bounds.y + localV * bounds.size;

				const sphereNormal = this.getSphereNormal(
					face,
					cubeX,
					cubeY,
				);

				const sample = getTerrainSample(sphereNormal);

				heights[index] = sample.height;
				landMasks[index] = sample.landMask;
				continents[index] = sample.continent;
				mountainMasks[index] = sample.mountainMask;

				const color = this.getTerrainColor(
					sphereNormal,
					sample,
				);

				const colorIndex = index * 3;

				colors[colorIndex + 0] = color.r;
				colors[colorIndex + 1] = color.g;
				colors[colorIndex + 2] = color.b;

				index++;
			}
		}

		return {
			key,
			resolution,
			rowSize,
			heights,
			landMasks,
			continents,
			mountainMasks,
			colors,
		};
	}

	private getTerrainColor(
		sphereNormal: THREE.Vector3,
		sample: CachedTerrainSampleData,
	): THREE.Color {
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

		const color = this.getClimateLandColor(
			climate,
			height,
		);

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
		climate: ReturnType<typeof getClimateSample>,
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

		const savanna =
			      this.smoothstep(0.50, 0.82, aridity) *
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

	private getSphereNormal(
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
			)
			.normalize();
	}

	private getPatchKey(
		face: CubeFace,
		bounds: PatchBounds,
		resolution: number,
	): string {
		return [
			this.vectorKey(face.normal),
			this.vectorKey(face.up),
			this.vectorKey(face.right),
			this.numberKey(bounds.x),
			this.numberKey(bounds.y),
			this.numberKey(bounds.size),
			resolution,
		].join('|');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${this.numberKey(vector.x)},${this.numberKey(vector.y)},${this.numberKey(vector.z)}`;
	}

	private numberKey(value: number): string {
		return value.toFixed(8);
	}

	private touch(key: string): void {
		this.tick++;
		this.usage.set(key, this.tick);
	}

	private evictIfNeeded(): void {
		if (this.grids.size <= this.maxEntries) {
			return;
		}

		const entries = [...this.usage.entries()]
			.sort((a, b) => a[1] - b[1]);

		const removeCount = Math.ceil(this.maxEntries * 0.15);

		for (let i = 0; i < removeCount && i < entries.length; i++) {
			const key = entries[i][0];

			this.grids.delete(key);
			this.usage.delete(key);
		}
	}

	private smoothstep(edge0: number, edge1: number, value: number): number {
		const x = this.clamp01((value - edge0) / (edge1 - edge0));

		return x * x * (3 - 2 * x);
	}

	private clamp01(value: number): number {
		return Math.max(0, Math.min(1, value));
	}
}
