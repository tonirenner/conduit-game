import * as THREE from 'three';

import {
	DEFAULT_TERRAIN_SEED_CONFIG,
	getTerrainSample,
	type TerrainSample,
	type TerrainSeedConfig,
} from '../utils/noise';

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

export class TerrainHeightCache {
	private readonly grids = new Map<string, TerrainHeightGrid>();
	private readonly usage = new Map<string, number>();

	private tick = 0;

	constructor(
		private readonly maxEntries = 1800,
		private readonly terrainSeedConfig: TerrainSeedConfig =
		DEFAULT_TERRAIN_SEED_CONFIG,
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
		return getTerrainSample(
			normal,
			this.terrainSeedConfig,
		);
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

				const sample = getTerrainSample(
					sphereNormal,
					this.terrainSeedConfig,
				);

				heights[index] = sample.height;
				landMasks[index] = sample.landMask;
				continents[index] = sample.continent;
				mountainMasks[index] = sample.mountainMask;

				const color = this.getTerrainColor(sample);
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
		sample: TerrainSample,
	): THREE.Color {
		const land = sample.landMask;
		const height = sample.height;

		const deepWater = new THREE.Color(0x071f2f);
		const midWater = new THREE.Color(0x0c3545);
		const shallowWater = new THREE.Color(0x155463);
		const coastalWater = new THREE.Color(0x1d6a70);
		const wetCoast = new THREE.Color(0x56614d);

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

		const lowLand = new THREE.Color(0x315d35);
		const grass = new THREE.Color(0x3f6d3b);
		const hills = new THREE.Color(0x596842);
		const dryHills = new THREE.Color(0x716a4e);
		const rock = new THREE.Color(0x69675b);
		const snow = new THREE.Color(0xaeb2a7);

		const color = lowLand.clone();

		color.lerp(
			grass,
			this.smoothstep(0.00, 0.035, height),
		);

		color.lerp(
			hills,
			this.smoothstep(0.035, 0.080, height),
		);

		color.lerp(
			dryHills,
			this.smoothstep(0.080, 0.135, height),
		);

		color.lerp(
			rock,
			this.smoothstep(0.135, 0.205, height),
		);

		color.lerp(
			snow,
			this.smoothstep(0.205, 0.310, height),
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
			this.terrainSeedConfig.seed,
		].join('|');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${this.numberKey(vector.x)},${this.numberKey(vector.y)},${this.numberKey(vector.z)}`;
	}

	private numberKey(value: number): string {
		return value.toFixed(8);
	}

	private smoothstep(
		edge0: number,
		edge1: number,
		value: number,
	): number {
		const x = Math.max(
			0,
			Math.min(
				1,
				(value - edge0) / (edge1 - edge0),
			),
		);

		return x * x * (3 - 2 * x);
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
}
