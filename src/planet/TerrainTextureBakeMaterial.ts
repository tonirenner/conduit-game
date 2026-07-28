import * as THREE from 'three/webgpu';

import {
	uniform,
	uv,
	wgslFn,
} from 'three/tsl';

import type {
	CubeFace,
} from './TerrainSource';

export type TerrainTextureBakeMaterialHandle = {
	material: any;
	setFace(face: CubeFace): void;
	setTerrainSeed(seed: number): void;
};

export function createTerrainTextureBakeMaterial(
	maxEncodedHeight = 0.42,
): TerrainTextureBakeMaterialHandle {
	const material = new THREE.MeshBasicNodeMaterial({
		                                                 depthWrite: false,
		                                                 depthTest: false,
		                                                 transparent: false,
	                                                 });

	material.name = 'TerrainTextureBakeMaterial';
	material.toneMapped = false;

	const faceNormal = uniform(new THREE.Vector3(1, 0, 0));
	const faceUp = uniform(new THREE.Vector3(0, 1, 0));
	const faceRight = uniform(new THREE.Vector3(0, 0, -1));
	const encodedHeightMax = uniform(maxEncodedHeight);
	const terrainSeedOffset = uniform(new THREE.Vector3(0, 0, 0));

	const bakeTerrainData = wgslFn(`
fn bake_terrain_data(
	uvInput: vec2<f32>,
	faceNormal: vec3<f32>,
	faceUp: vec3<f32>,
	faceRight: vec3<f32>,
	maxEncodedHeight: f32,
	terrainSeedOffset: vec3<f32>
) -> vec4<f32> {
	let cubeX = uvInput.x * 2.0 - 1.0;
	let cubeY = uvInput.y * 2.0 - 1.0;

	let normal = normalize(
		faceNormal +
		faceRight * cubeX +
		faceUp * cubeY
	);

	let terrain = bake_terrain_sample(
		normal,
		terrainSeedOffset
	);

	let encodedHeight =
		clamp(
			terrain.x / maxEncodedHeight,
			0.0,
			1.0
		);

	return vec4<f32>(
		encodedHeight,
		terrain.y,
		terrain.w,
		terrain.z
	);
}

fn bake_terrain_sample(
	normalInput: vec3<f32>,
	terrainSeedOffset: vec3<f32>
) -> vec4<f32> {
	let normal = normalize(
		normalInput +
		terrainSeedOffset * 0.215
	);

	let continentBase =
		bake_fbm(
			normal * 1.25,
			6
		);

	let coastNoise =
		(
			bake_fbm(
				normal * 2.4,
				5
			) - 0.5
		) * 0.045;

	let continent =
		continentBase +
		coastNoise;

	let landMask =
		smoothstep(
			0.525,
			0.585,
			continent
		);

	let highlands =
		max(
			0.0,
			continent - 0.54
		);

	let mountainMask =
		smoothstep(
			0.62,
			0.78,
			continent
		) *
		landMask;

	let ridgeLarge =
		bake_ridged_fbm(
			normal * 3.8,
			5
		);

	let ridgeMedium =
		bake_ridged_fbm(
			normal * 8.5,
			5
		);

	let ridgeFine =
		bake_ridged_fbm(
			normal * 18.0,
			4
		);

	let mountainChains =
		smoothstep(
			0.46,
			0.84,
			ridgeLarge
		) *
		(
			ridgeMedium * 0.72 +
			ridgeFine * 0.28
		);

	let sharpPeaks =
		pow(
			clamp(
				mountainChains,
				0.0,
				1.0
			),
			1.75
		);

	let mountains =
		sharpPeaks *
		mountainMask;

	let foothills =
		smoothstep(
			0.48,
			0.74,
			ridgeLarge
		) *
		mountainMask *
		0.45;

	let detail =
		(
			bake_fbm(
				normal * 24.0,
				4
			) - 0.5
		) *
		0.010 *
		landMask;

	let height =
		landMask * 0.006 +
		highlands * 0.095 +
		foothills * 0.055 +
		mountains * 0.165 +
		detail;

	return vec4<f32>(
		max(0.0, height),
		landMask,
		continent,
		mountainMask
	);
}

fn bake_hash3(p_input: vec3<f32>) -> f32 {
	return fract(
		sin(
			dot(
				p_input,
				vec3<f32>(127.1, 311.7, 74.7)
			)
		) *
		43758.5453123
	);
}

fn bake_noise3d(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);

	f = f * f * (3.0 - 2.0 * f);

	let v000 = bake_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let v100 = bake_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let v010 = bake_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let v110 = bake_hash3(i + vec3<f32>(1.0, 1.0, 0.0));

	let v001 = bake_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let v101 = bake_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let v011 = bake_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let v111 = bake_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let x00 = mix(v000, v100, f.x);
	let x10 = mix(v010, v110, f.x);
	let x01 = mix(v001, v101, f.x);
	let x11 = mix(v011, v111, f.x);

	let y0 = mix(x00, x10, f.y);
	let y1 = mix(x01, x11, f.y);

	return mix(y0, y1, f.z);
}

fn bake_fbm(
	p_input: vec3<f32>,
	octaves: i32
) -> f32 {
	var value = 0.0;
	var amplitude = 0.5;
	var frequency = 1.0;
	var normalizer = 0.0;

	for (var i = 0; i < 6; i = i + 1) {
		if (i >= octaves) {
			break;
		}

		value =
			value +
			amplitude *
			bake_noise3d(
				p_input *
				frequency
			);

		normalizer =
			normalizer +
			amplitude;

		frequency =
			frequency *
			2.0;

		amplitude =
			amplitude *
			0.5;
	}

	return value / normalizer;
}

fn bake_ridged_fbm(
	p_input: vec3<f32>,
	octaves: i32
) -> f32 {
	var value = 0.0;
	var amplitude = 0.52;
	var frequency = 1.0;
	var normalizer = 0.0;

	for (var i = 0; i < 5; i = i + 1) {
		if (i >= octaves) {
			break;
		}

		let n =
			bake_noise3d(
				p_input *
				frequency
			);

		let ridge =
			1.0 -
			abs(
				n * 2.0 -
				1.0
			);

		let sharpened =
			ridge *
			ridge;

		value =
			value +
			sharpened *
			amplitude;

		normalizer =
			normalizer +
			amplitude;

		frequency =
			frequency *
			2.15;

		amplitude =
			amplitude *
			0.48;
	}

	return value / normalizer;
}
	`);

	const bakedData = bakeTerrainData({
		                                  uvInput: uv(),
		                                  faceNormal,
		                                  faceUp,
		                                  faceRight,
		                                  maxEncodedHeight: encodedHeightMax,
		                                  terrainSeedOffset,
	                                  });

	material.colorNode = bakedData.rgb;
	material.opacityNode = bakedData.a;

	return {
		material,
		setFace(face: CubeFace): void {
			faceNormal.value.copy(face.normal);
			faceUp.value.copy(face.up);
			faceRight.value.copy(face.right);
		},

		setTerrainSeed(seed: number): void {
			let state = Math.floor(seed) >>> 0;

			if (state === 0) {
				state = 1;
			}

			const nextRandom = (): number => {
				state += 0x6d2b79f5;

				let t = state;

				t = Math.imul(
					t ^ (t >>> 15),
					t | 1,
				);

				t ^= t + Math.imul(
					t ^ (t >>> 7),
					t | 61,
				);

				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};

			terrainSeedOffset.value.set(
				nextRandom() * 2 - 1,
				nextRandom() * 2 - 1,
				nextRandom() * 2 - 1,
			).multiplyScalar(240.0);
		},
	};
}
