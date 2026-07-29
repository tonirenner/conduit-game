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
		if (this.terrainSeedConfig.profile === 'ice') {
			return this.getIceTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'oceanic') {
			return this.getOceanicTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'barren') {
			return this.getBarrenTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'rocky') {
			return this.getRockyTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'desert') {
			return this.getDesertTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'lava') {
			return this.getLavaTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'carbon') {
			return this.getCarbonTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'metallic') {
			return this.getMetallicTerrainColor(sample);
		}

		if (this.terrainSeedConfig.profile === 'toxic') {
			return this.getToxicTerrainColor(sample);
		}

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

	private getToxicTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const chemicalBasin = 1 - this.smoothstep(
			0.34,
			0.72,
			land,
		);

		const highland = this.smoothstep(
			0.02,
			0.20,
			height + mountain * 0.065,
		);

		const stain = this.smoothstep(
			0.30,
			0.82,
			mountain + Math.abs(land - 0.54) * 0.54,
		);

		const milkyLowland = new THREE.Color(0x6f9489);
		const chemicalGrey = new THREE.Color(0xa7b6a9);
		const sulfurCrust = new THREE.Color(0xc7bd88);
		const rustHighland = new THREE.Color(0x9a5d36);
		const darkSludge = new THREE.Color(0x24322e);

		const color = milkyLowland.clone().lerp(
			chemicalGrey,
			chemicalBasin * 0.62,
		);

		color.lerp(
			sulfurCrust,
			chemicalBasin * stain * 0.30,
		);

		color.lerp(
			rustHighland,
			highland * 0.42,
		);

		color.lerp(
			rustHighland,
			stain * highland * 0.18,
		);

		color.lerp(
			darkSludge,
			chemicalBasin * 0.16,
		);

		return color;
	}

	private getOceanicTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const land = sample.landMask;
		const height = sample.height;

		const deepWater = new THREE.Color(0x093456);
		const midWater = new THREE.Color(0x0e6383);
		const shallowWater = new THREE.Color(0x158faa);
		const coastalWater = new THREE.Color(0x42bfc6);
		const islandGreen = new THREE.Color(0x2f6a45);
		const highIsland = new THREE.Color(0x8ca05a);

		if (land < 0.36) {
			return deepWater.clone().lerp(
				midWater,
				this.smoothstep(0.00, 0.36, land),
			);
		}

		if (land < 0.52) {
			return midWater.clone().lerp(
				shallowWater,
				this.smoothstep(0.36, 0.52, land),
			);
		}

		if (land < 0.72) {
			return shallowWater.clone().lerp(
				coastalWater,
				this.smoothstep(0.52, 0.72, land),
			);
		}

		const color = islandGreen.clone().lerp(
			highIsland,
			this.smoothstep(0.00, 0.18, height),
		);

		return coastalWater.clone().lerp(
			color,
			this.smoothstep(0.72, 0.94, land),
		);
	}

	private getLavaTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const mountain = sample.mountainMask;

		const fissure = this.smoothstep(
			0.62,
			1.02,
			mountain + height * 1.45,
		);

		const hotspot = this.smoothstep(
			0.82,
			1.14,
			mountain + height * 2.25,
		);

		const basalt = new THREE.Color(0x050403);
		const warmBasalt = new THREE.Color(0x1a100b);
		const lavaRed = new THREE.Color(0xd93a10);
		const lavaOrange = new THREE.Color(0xff9a2f);
		const lavaYellow = new THREE.Color(0xffd96a);

		const color = basalt.clone().lerp(
			warmBasalt,
			this.smoothstep(0.00, 0.30, height + mountain * 0.05),
		);

		color.lerp(
			lavaRed,
			fissure * 0.38,
		);

		color.lerp(
			lavaOrange,
			hotspot * 0.48,
		);

		color.lerp(
			lavaYellow,
			hotspot * fissure * 0.28,
		);

		return color;
	}

	private getMetallicTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const basin = 1 - this.smoothstep(
			0.36,
			0.74,
			land,
		);

		const relief = this.smoothstep(
			0.00,
			0.22,
			height + mountain * 0.09,
		);

		const ridge = this.smoothstep(
			0.34,
			0.90,
			mountain + height * 1.70,
		);

		const darkIron = new THREE.Color(0x1a1e21);
		const ironGrey = new THREE.Color(0x555a5d);
		const brightRidge = new THREE.Color(0xb3b2aa);
		const goldOxide = new THREE.Color(0xb59a55);
		const coldBasin = new THREE.Color(0x0e1114);

		const color = darkIron.clone().lerp(
			ironGrey,
			relief * 0.82,
		);

		color.lerp(
			brightRidge,
			ridge * 0.42,
		);

		color.lerp(
			goldOxide,
			ridge * relief * 0.20,
		);

		color.lerp(
			coldBasin,
			basin * 0.16,
		);

		return color;
	}

	private getCarbonTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const basin = 1 - this.smoothstep(
			0.34,
			0.72,
			land,
		);

		const relief = this.smoothstep(
			0.00,
			0.24,
			height + mountain * 0.085,
		);

		const vein = this.smoothstep(
			0.38,
			0.88,
			mountain + height * 1.65,
		);

		const graphite = new THREE.Color(0x151516);
		const carbonDust = new THREE.Color(0x39332e);
		const warmRidge = new THREE.Color(0x7e7368);
		const paleVein = new THREE.Color(0xb4aa9e);
		const blackBasin = new THREE.Color(0x0b0b0c);

		const color = graphite.clone().lerp(
			carbonDust,
			relief * 0.78,
		);

		color.lerp(
			warmRidge,
			vein * 0.34,
		);

		color.lerp(
			paleVein,
			vein * relief * 0.22,
		);

		color.lerp(
			blackBasin,
			basin * 0.14,
		);

		return color;
	}

	private getDesertTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const dryBasin = 1 - this.smoothstep(
			0.32,
			0.72,
			land,
		);

		const relief = this.smoothstep(
			0.00,
			0.20,
			height + mountain * 0.055,
		);

		const ridge = this.smoothstep(
			0.36,
			0.86,
			mountain + height * 1.30,
		);

		const shadowSalt = new THREE.Color(0x4a321f);
		const redSand = new THREE.Color(0x9c5e32);
		const ochre = new THREE.Color(0xd49a4f);
		const palePlateau = new THREE.Color(0xe2bf78);

		const color = redSand.clone().lerp(
			ochre,
			relief * 0.86,
		);

		color.lerp(
			palePlateau,
			ridge * 0.34,
		);

		color.lerp(
			shadowSalt,
			dryBasin * 0.20,
		);

		return color;
	}

	private getRockyTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const basin = 1 - this.smoothstep(
			0.34,
			0.70,
			land,
		);

		const relief = this.smoothstep(
			0.00,
			0.24,
			height + mountain * 0.075,
		);

		const ridge = this.smoothstep(
			0.34,
			0.88,
			mountain + height * 1.45,
		);

		const shadowBasin = new THREE.Color(0x1f1d1b);
		const basalt = new THREE.Color(0x383634);
		const rustDust = new THREE.Color(0x756451);
		const ridgeRock = new THREE.Color(0xa19076);

		const color = basalt.clone().lerp(
			rustDust,
			relief * 0.72,
		);

		color.lerp(
			ridgeRock,
			ridge * 0.38,
		);

		color.lerp(
			shadowBasin,
			basin * 0.24,
		);

		return color;
	}

	private getBarrenTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const relief = this.smoothstep(
			0.00,
			0.26,
			height + mountain * 0.08,
		);

		const basin = 1 - this.smoothstep(
			0.36,
			0.68,
			land,
		);

		const ridge = this.smoothstep(
			0.36,
			0.90,
			mountain + height * 1.55,
		);

		const lowDust = new THREE.Color(0x3a332c);
		const dryRegolith = new THREE.Color(0x7d6f5d);
		const highRock = new THREE.Color(0xb3a184);
		const basinShadow = new THREE.Color(0x24211e);

		const color = lowDust.clone().lerp(
			dryRegolith,
			relief,
		);

		color.lerp(
			highRock,
			ridge * 0.48,
		);

		color.lerp(
			basinShadow,
			basin * 0.18,
		);

		return color;
	}

	private getIceTerrainColor(
		sample: TerrainSample,
	): THREE.Color {
		const height = sample.height;
		const land = sample.landMask;
		const mountain = sample.mountainMask;

		const compressedRelief = this.smoothstep(
			0.00,
			0.18,
			height + mountain * 0.045,
		);

		const fracture = this.smoothstep(
			0.42,
			0.88,
			mountain + Math.abs(land - 0.52) * 0.62,
		);

		const blueIce = new THREE.Color(0x9fc9d8);
		const packedIce = new THREE.Color(0xe8f6fb);
		const snowCap = new THREE.Color(0xfbfdff);
		const crackBlue = new THREE.Color(0x23607c);

		const color = blueIce.clone().lerp(
			packedIce,
			compressedRelief,
		);

		color.lerp(
			snowCap,
			this.smoothstep(0.12, 0.32, height + mountain * 0.10),
		);

		color.lerp(
			crackBlue,
			fracture * 0.24,
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
			this.terrainSeedConfig.profile,
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
