import * as THREE from 'three';

import {
	getTerrainSample,
	type TerrainSample,
} from './terrain/noise';

import { getClimateSample } from './climate/Climate';

import type {
	CubeFace,
} from './TerrainSource';

export type TerrainDataCacheOptions = {
	/**
	 * Texture/data resolution per cube face.
	 *
	 * 1024 is a good first balance:
	 * - much finer than patch geometry
	 * - still acceptable memory
	 * - avoids global mesh-resolution increase
	 */
	faceResolution: number;

	/**
	 * Height is stored as Uint16 normalized by this value.
	 *
	 * Current terrain heights are usually below ~0.32.
	 * Keeping this slightly higher gives safe headroom.
	 */
	maxEncodedHeight: number;
};

export type TerrainDataSample = TerrainSample & {
	color: THREE.Color;
};

type TerrainFaceData = {
	key: string;
	face: CubeFace;
	resolution: number;

	heights: Uint16Array;
	landMasks: Uint16Array;
	continents: Uint16Array;
	mountainMasks: Uint16Array;

	colors: Uint8Array;
};

const DEFAULT_OPTIONS: TerrainDataCacheOptions = {
	faceResolution: 1024,
	maxEncodedHeight: 0.42,
};

export class TerrainDataCache {
	private readonly faces = new Map<string, TerrainFaceData>();
	private readonly options: TerrainDataCacheOptions;

	constructor(options: Partial<TerrainDataCacheOptions> = {}) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};
	}

	getFaceCount(): number {
		return this.faces.size;
	}

	clear(): void {
		this.faces.clear();
	}

	sampleFace(
		face: CubeFace,
		cubeX: number,
		cubeY: number,
	): TerrainDataSample {
		const faceData = this.getOrBakeFace(face);

		return this.sampleFaceData(
			faceData,
			cubeX,
			cubeY,
		);
	}

	sampleNormal(normal: THREE.Vector3): TerrainSample {
		const direction = normal.clone().normalize();
		const face = this.getFaceForNormal(direction);

		const faceDot = direction.dot(face.normal);

		if (Math.abs(faceDot) < 0.000001) {
			return getTerrainSample(direction);
		}

		const cubePoint = direction
			.clone()
			.multiplyScalar(1.0 / faceDot);

		const local = cubePoint.sub(face.normal);

		const cubeX = local.dot(face.right);
		const cubeY = local.dot(face.up);

		const sample = this.sampleFace(
			face,
			cubeX,
			cubeY,
		);

		return {
			height: sample.height,
			landMask: sample.landMask,
			continent: sample.continent,
			mountainMask: sample.mountainMask,
		};
	}

	private getOrBakeFace(face: CubeFace): TerrainFaceData {
		const key = this.getFaceKey(face);
		const existing = this.faces.get(key);

		if (existing) {
			return existing;
		}

		const faceData = this.bakeFace(
			key,
			face,
		);

		this.faces.set(key, faceData);

		return faceData;
	}

	private bakeFace(
		key: string,
		face: CubeFace,
	): TerrainFaceData {
		const resolution = this.options.faceResolution;
		const texelCount = resolution * resolution;

		const heights = new Uint16Array(texelCount);
		const landMasks = new Uint16Array(texelCount);
		const continents = new Uint16Array(texelCount);
		const mountainMasks = new Uint16Array(texelCount);

		const colors = new Uint8Array(texelCount * 3);

		let index = 0;

		for (let y = 0; y < resolution; y++) {
			const v = resolution <= 1
			          ? 0
			          : y / (resolution - 1);

			const cubeY = v * 2.0 - 1.0;

			for (let x = 0; x < resolution; x++) {
				const u = resolution <= 1
				          ? 0
				          : x / (resolution - 1);

				const cubeX = u * 2.0 - 1.0;

				const sphereNormal = this.getSphereNormal(
					face,
					cubeX,
					cubeY,
				);

				const sample = getTerrainSample(sphereNormal);

				heights[index] = this.encodeHeight(sample.height);
				landMasks[index] = this.encode01(sample.landMask);
				continents[index] = this.encode01(sample.continent);
				mountainMasks[index] = this.encode01(sample.mountainMask);

				const color = this.getTerrainColor(
					sphereNormal,
					sample,
				);

				const colorIndex = index * 3;

				colors[colorIndex + 0] = this.encodeColor(color.r);
				colors[colorIndex + 1] = this.encodeColor(color.g);
				colors[colorIndex + 2] = this.encodeColor(color.b);

				index++;
			}
		}

		return {
			key,
			face: {
				normal: face.normal.clone(),
				up: face.up.clone(),
				right: face.right.clone(),
			},
			resolution,
			heights,
			landMasks,
			continents,
			mountainMasks,
			colors,
		};
	}

	private sampleFaceData(
		faceData: TerrainFaceData,
		cubeX: number,
		cubeY: number,
	): TerrainDataSample {
		const resolution = faceData.resolution;

		const u = THREE.MathUtils.clamp(
			(cubeX + 1.0) * 0.5,
			0,
			1,
		);

		const v = THREE.MathUtils.clamp(
			(cubeY + 1.0) * 0.5,
			0,
			1,
		);

		const px = u * (resolution - 1);
		const py = v * (resolution - 1);

		const x0 = Math.floor(px);
		const y0 = Math.floor(py);

		const x1 = Math.min(
			resolution - 1,
			x0 + 1,
		);

		const y1 = Math.min(
			resolution - 1,
			y0 + 1,
		);

		const tx = px - x0;
		const ty = py - y0;

		const i00 = x0 + y0 * resolution;
		const i10 = x1 + y0 * resolution;
		const i01 = x0 + y1 * resolution;
		const i11 = x1 + y1 * resolution;

		const height = this.decodeHeight(
			this.sampleUint16(
				faceData.heights,
				i00,
				i10,
				i01,
				i11,
				tx,
				ty,
			),
		);

		const landMask = this.decode01(
			this.sampleUint16(
				faceData.landMasks,
				i00,
				i10,
				i01,
				i11,
				tx,
				ty,
			),
		);

		const continent = this.decode01(
			this.sampleUint16(
				faceData.continents,
				i00,
				i10,
				i01,
				i11,
				tx,
				ty,
			),
		);

		const mountainMask = this.decode01(
			this.sampleUint16(
				faceData.mountainMasks,
				i00,
				i10,
				i01,
				i11,
				tx,
				ty,
			),
		);

		const color = this.sampleColor(
			faceData.colors,
			i00,
			i10,
			i01,
			i11,
			tx,
			ty,
		);

		return {
			height,
			landMask,
			continent,
			mountainMask,
			color,
		};
	}

	private sampleUint16(
		buffer: Uint16Array,
		i00: number,
		i10: number,
		i01: number,
		i11: number,
		tx: number,
		ty: number,
	): number {
		const a = THREE.MathUtils.lerp(
			buffer[i00],
			buffer[i10],
			tx,
		);

		const b = THREE.MathUtils.lerp(
			buffer[i01],
			buffer[i11],
			tx,
		);

		return THREE.MathUtils.lerp(
			a,
			b,
			ty,
		);
	}

	private sampleColor(
		buffer: Uint8Array,
		i00: number,
		i10: number,
		i01: number,
		i11: number,
		tx: number,
		ty: number,
	): THREE.Color {
		const color = new THREE.Color();

		color.r = this.sampleUint8Channel(
			buffer,
			i00,
			i10,
			i01,
			i11,
			tx,
			ty,
			0,
		);

		color.g = this.sampleUint8Channel(
			buffer,
			i00,
			i10,
			i01,
			i11,
			tx,
			ty,
			1,
		);

		color.b = this.sampleUint8Channel(
			buffer,
			i00,
			i10,
			i01,
			i11,
			tx,
			ty,
			2,
		);

		return color;
	}

	private sampleUint8Channel(
		buffer: Uint8Array,
		i00: number,
		i10: number,
		i01: number,
		i11: number,
		tx: number,
		ty: number,
		channel: number,
	): number {
		const c00 = buffer[i00 * 3 + channel];
		const c10 = buffer[i10 * 3 + channel];
		const c01 = buffer[i01 * 3 + channel];
		const c11 = buffer[i11 * 3 + channel];

		const a = THREE.MathUtils.lerp(c00, c10, tx);
		const b = THREE.MathUtils.lerp(c01, c11, tx);

		return THREE.MathUtils.lerp(a, b, ty) / 255.0;
	}

	private getTerrainColor(
		sphereNormal: THREE.Vector3,
		sample: TerrainSample,
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

	private getFaceForNormal(normal: THREE.Vector3): CubeFace {
		const ax = Math.abs(normal.x);
		const ay = Math.abs(normal.y);
		const az = Math.abs(normal.z);

		if (ax >= ay && ax >= az) {
			return normal.x >= 0
			       ? {
					normal: new THREE.Vector3(1, 0, 0),
					up: new THREE.Vector3(0, 1, 0),
					right: new THREE.Vector3(0, 0, -1),
				}
			       : {
					normal: new THREE.Vector3(-1, 0, 0),
					up: new THREE.Vector3(0, 1, 0),
					right: new THREE.Vector3(0, 0, 1),
				};
		}

		if (ay >= ax && ay >= az) {
			return normal.y >= 0
			       ? {
					normal: new THREE.Vector3(0, 1, 0),
					up: new THREE.Vector3(0, 0, 1),
					right: new THREE.Vector3(-1, 0, 0),
				}
			       : {
					normal: new THREE.Vector3(0, -1, 0),
					up: new THREE.Vector3(0, 0, -1),
					right: new THREE.Vector3(-1, 0, 0),
				};
		}

		return normal.z >= 0
		       ? {
				normal: new THREE.Vector3(0, 0, 1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(1, 0, 0),
			}
		       : {
				normal: new THREE.Vector3(0, 0, -1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(-1, 0, 0),
			};
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

	private getFaceKey(face: CubeFace): string {
		return [
			this.vectorKey(face.normal),
			this.vectorKey(face.up),
			this.vectorKey(face.right),
		].join('|');
	}

	private vectorKey(vector: THREE.Vector3): string {
		return `${this.numberKey(vector.x)},${this.numberKey(vector.y)},${this.numberKey(vector.z)}`;
	}

	private numberKey(value: number): string {
		return value.toFixed(8);
	}

	private encodeHeight(value: number): number {
		return Math.round(
			this.clamp01(value / this.options.maxEncodedHeight) *
			65535,
		);
	}

	private decodeHeight(value: number): number {
		return value / 65535.0 * this.options.maxEncodedHeight;
	}

	private encode01(value: number): number {
		return Math.round(
			this.clamp01(value) *
			65535,
		);
	}

	private decode01(value: number): number {
		return value / 65535.0;
	}

	private encodeColor(value: number): number {
		return Math.round(
			this.clamp01(value) *
			255,
		);
	}

	private smoothstep(edge0: number, edge1: number, value: number): number {
		const x = this.clamp01((value - edge0) / (edge1 - edge0));

		return x * x * (3 - 2 * x);
	}

	private clamp01(value: number): number {
		return Math.max(0, Math.min(1, value));
	}
}
