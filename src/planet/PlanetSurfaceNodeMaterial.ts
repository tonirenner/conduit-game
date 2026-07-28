import * as THREE from 'three/webgpu';

import {
	attribute,
	cameraPosition,
	float,
	color,
	dot,
	max,
	mix,
	normalize,
	normalWorld,
	oneMinus,
	positionWorld,
	pow,
	smoothstep,
	uniform,
	vertexColor,
	texture,
	wgslFn,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

import type { TerrainTextureSet } from './TerrainTextureSet';
import type { SurfaceRenderProfile } from './rendering/SurfaceRenderProfile';

/**
 * Phase 6c.1:
 *
 * Surface palette mapping + terrain seed offset.
 *
 * Based on Phase 4k.4b.
 *
 * Change:
 * - coast/water masks move closer to the WebGL reference path
 * - landMask is now driven primarily by proceduralTerrainSample
 * - waterHint is derived directly from landMask like WebGL
 * - extra shoreline softening is reduced
 *
 * Goal:
 * Stop fighting the coast with cosmetic blur and bring WebGPU material
 * behavior closer to the WebGL ShaderMaterial reference.
 */
export function createPlanetSurfaceNodeMaterial(
	planetRadius: number,
	terrainTextureSet: TerrainTextureSet | null = null,
): any {
	const material = new THREE.MeshBasicNodeMaterial({
		                                                 vertexColors: true,
		                                                 transparent: false,
		                                                 depthWrite: true,
		                                                 depthTest: true,
	                                                 });

	material.name = 'PlanetSurfaceNodeMaterial';

	const sunDirection = uniform(
		SUN_DIRECTION.clone().normalize(),
	);

	const ambient = uniform(0.40);
	const exposure = uniform(1.34);
	const terminatorSoftness = uniform(0.92);
	const bakedTerrainBlend = uniform(
		terrainTextureSet ? 1.0 : 0.0,
	);

	const surfaceRaymarchStrength = uniform(0.0);
	const surfaceRaymarchSteps = uniform(0.0);

	/**
	 * Phase 6c.1:
	 *
	 * These profile uniforms are intentionally conservative.
	 * They let PlanetDefinition/SurfaceRenderProfile reach the material
	 * without forcing a full visual rewrite yet.
	 */
	const profileOceanLevel = uniform(0.0);
	const profileMountainScale = uniform(1.0);
	const profileTerrainRoughness = uniform(1.0);
	const profileWaterInfluence = uniform(0.0);
	const profileIceInfluence = uniform(0.0);
	const profileLavaInfluence = uniform(0.0);
	const profileToxicInfluence = uniform(0.0);
	const profileMetalInfluence = uniform(0.0);

	const paletteOceanic = uniform(0.0);
	const paletteIce = uniform(0.0);
	const paletteDesert = uniform(0.0);
	const paletteLava = uniform(0.0);
	const paletteToxic = uniform(0.0);
	const paletteMetallic = uniform(0.0);
	const paletteCarbon = uniform(0.0);
	const paletteEarthlike = uniform(0.0);
	const paletteRocky = uniform(1.0);

	const initialForcedLavaSurface =
		      typeof window !== 'undefined' &&
		      new URLSearchParams(window.location.search).get('surface') === 'lava'
		      ? 1.0
		      : 0.0;

	const forcedLavaSurface = uniform(initialForcedLavaSurface);
	const terrainSeedOffset = uniform(new THREE.Vector3(0, 0, 0));

	const nightTint = color(0x061426);
	const twilightTint = color(0x285f96);
	const rimTint = color(0xa8d8ff);
	const fakeAtmosphereTint = color(0x7fc2ff);
	const horizonHazeTint = color(0x9ed4ff);
	const lowSunHazeTint = color(0xffe6c2);

	const oceanFresnelTint = color(0x2b8eb6);
	const oceanDeepTint = color(0x061d2a);
	const oceanNightTint = color(0x061426);
	const oceanShelfTint = color(0x0c586b);
	const oceanLightTint = color(0x4aa5bb);
	const oceanSpecularTint = color(0xfff3d8);
	const oceanCoastLightTint = color(0x1d6a70);

	const coastTint = color(0x56614d);
	const warmDayTint = color(0xffffff);
	const mountainTint = color(0x69675b);
	const mountainLightTint = color(0xaea89a);
	const highlandTint = color(0x716a4e);
	const coolIceTint = color(0xaeb2a7);

	const terrainHeightAttribute = attribute('terrainHeight', 'float');
	const landMaskAttribute = attribute('landMask', 'float');
	const mountainMaskAttribute = attribute('mountainMask', 'float');
	const terrainDataUv = attribute('terrainDataUv', 'vec2');
	const sphereNormal = normalize(attribute('sphereNormal', 'vec3'));

	const proceduralTerrainSample = wgslFn(`
fn procedural_terrain_sample(
	normalInput: vec3<f32>,
	terrainSeedOffset: vec3<f32>
) -> vec4<f32> {
	let normal = normalize(
		normalInput +
		terrainSeedOffset * 0.215
	);

	let continentBase = terrain_fbm(
		normal * 1.25,
		6
	);

	let coastNoise =
		(terrain_fbm(
			normal * 2.4,
			5
		) - 0.5) * 0.045;

	let continent = continentBase + coastNoise;

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
		) * landMask;

	let ridgeLarge = terrain_ridged_fbm(
		normal * 3.8,
		5
	);

	let ridgeMedium = terrain_ridged_fbm(
		normal * 8.5,
		5
	);

	let ridgeFine = terrain_ridged_fbm(
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
		(terrain_fbm(
			normal * 24.0,
			4
		) - 0.5) *
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

fn terrain_hash3(p_input: vec3<f32>) -> f32 {
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

fn terrain_noise3d(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);

	f = f * f * (3.0 - 2.0 * f);

	let v000 = terrain_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let v100 = terrain_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let v010 = terrain_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let v110 = terrain_hash3(i + vec3<f32>(1.0, 1.0, 0.0));

	let v001 = terrain_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let v101 = terrain_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let v011 = terrain_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let v111 = terrain_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let x00 = mix(v000, v100, f.x);
	let x10 = mix(v010, v110, f.x);
	let x01 = mix(v001, v101, f.x);
	let x11 = mix(v011, v111, f.x);

	let y0 = mix(x00, x10, f.y);
	let y1 = mix(x01, x11, f.y);

	return mix(y0, y1, f.z);
}

fn terrain_fbm(
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

		value = value +
			amplitude *
			terrain_noise3d(
				p_input * frequency
			);

		normalizer = normalizer + amplitude;
		frequency = frequency * 2.0;
		amplitude = amplitude * 0.5;
	}

	return value / normalizer;
}

fn terrain_ridged_fbm(
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

		let n = terrain_noise3d(
			p_input * frequency
		);

		let ridge =
			1.0 -
			abs(n * 2.0 - 1.0);

		let sharpened =
			ridge * ridge;

		value = value +
			sharpened *
			amplitude;

		normalizer = normalizer + amplitude;

		frequency = frequency * 2.15;
		amplitude = amplitude * 0.48;
	}

	return value / normalizer;
}
	`);


	const proceduralSurfaceDetail = wgslFn(`
fn procedural_surface_detail(
	normalInput: vec3<f32>,
	landMaskInput: f32,
	waterHintInput: f32,
	terrainHeightInput: f32,
	mountainMaskInput: f32
) -> vec4<f32> {
	let normal = normalize(normalInput);

	let largeDetail =
		detail_fbm(normal * 9.0 + vec3<f32>(11.2, 4.7, 8.1));

	let mediumDetail =
		detail_fbm(normal * 22.0 + vec3<f32>(3.4, 19.1, 7.6));

	let fineDetail =
		detail_fbm(normal * 54.0 + vec3<f32>(41.0, 5.3, 13.7));

	let combinedDetail =
		largeDetail * 0.52 +
		mediumDetail * 0.32 +
		fineDetail * 0.16 -
		0.5;

	let bathymetryLarge =
		detail_fbm(normal * 1.65 + vec3<f32>(2.7, 11.3, 6.8));

	let bathymetryMedium =
		detail_fbm(normal * 4.25 + vec3<f32>(18.4, 3.2, 29.7));

	let oceanBasin =
		waterHintInput *
		(1.0 - smoothstep(0.22, 0.62, landMaskInput)) *
		smoothstep(0.38, 0.82, bathymetryLarge);

	let oceanShelf =
		waterHintInput *
		smoothstep(0.34, 0.70, landMaskInput) *
		(1.0 - smoothstep(0.76, 0.96, landMaskInput));

	let oceanVariation =
		bathymetryLarge * 0.70 +
		bathymetryMedium * 0.30 -
		0.5;

	let coastMask =
		1.0 -
		smoothstep(
			0.035,
			0.235,
			abs(landMaskInput - 0.55)
		);

	let shallowWater =
		waterHintInput *
		smoothstep(0.28, 0.72, landMaskInput);

	let deepWater =
		waterHintInput *
		(1.0 - smoothstep(0.18, 0.48, landMaskInput));

	let landOnlyMask =
		smoothstep(0.58, 0.76, landMaskInput);

	let mountainDetailMask =
		smoothstep(0.07, 0.20, terrainHeightInput) *
		landOnlyMask *
		smoothstep(0.12, 0.82, mountainMaskInput);

	let vegetationPattern =
		smoothstep(0.38, 0.74, largeDetail) *
		(1.0 - mountainDetailMask) *
		landOnlyMask;

	let dryPattern =
		smoothstep(0.58, 0.86, mediumDetail) *
		landOnlyMask *
		(1.0 - coastMask) *
		(1.0 - mountainDetailMask * 0.45);

	let waterDepthTint = vec3<f32>(0.010, 0.052, 0.092);
	let waterBasinTint = vec3<f32>(0.004, 0.032, 0.065);
	let shallowTint = vec3<f32>(0.052, 0.185, 0.205);
	let shelfTint = vec3<f32>(0.040, 0.135, 0.165);
	let coastDetailTint = vec3<f32>(0.205, 0.295, 0.240);
	let vegetationTint = vec3<f32>(0.105, 0.245, 0.110);
	let dryTint = vec3<f32>(0.330, 0.275, 0.155);
	let rockTint = vec3<f32>(0.360, 0.350, 0.310);

	var detailColor = vec3<f32>(0.0, 0.0, 0.0);

	detailColor = mix(
		detailColor,
		waterDepthTint,
		deepWater * (0.060 + largeDetail * 0.045)
	);

	detailColor = mix(
		detailColor,
		waterBasinTint,
		oceanBasin * 0.135
	);

	detailColor = mix(
		detailColor,
		shelfTint,
		oceanShelf * 0.042
	);

	detailColor = mix(
		detailColor,
		shallowTint,
		shallowWater * (0.028 + mediumDetail * 0.034)
	);

	detailColor = mix(
		detailColor,
		coastDetailTint,
		clamp(coastMask, 0.0, 1.0) * 0.045
	);

	detailColor = mix(
		detailColor,
		vegetationTint,
		vegetationPattern * 0.105
	);

	detailColor = mix(
		detailColor,
		dryTint,
		dryPattern * 0.085
	);

	detailColor = mix(
		detailColor,
		rockTint,
		mountainDetailMask * (0.13 + fineDetail * 0.085)
	);

	detailColor = detailColor +
		vec3<f32>(combinedDetail * 0.040) *
		landOnlyMask;

	detailColor = detailColor +
		vec3<f32>(0.0, 0.010, 0.018) *
		oceanVariation *
		waterHintInput;

	detailColor = detailColor +
		vec3<f32>(combinedDetail * 0.010) *
		waterHintInput;

	let detailStrength =
		clamp(
			landOnlyMask * 0.74 +
			waterHintInput * 0.50,
			0.0,
			1.0
		);

	return vec4<f32>(
		detailColor,
		detailStrength
	);
}

fn detail_hash3(p_input: vec3<f32>) -> f32 {
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

fn detail_noise3d(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);

	f = f * f * (3.0 - 2.0 * f);

	let v000 = detail_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let v100 = detail_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let v010 = detail_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let v110 = detail_hash3(i + vec3<f32>(1.0, 1.0, 0.0));

	let v001 = detail_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let v101 = detail_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let v011 = detail_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let v111 = detail_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let x00 = mix(v000, v100, f.x);
	let x10 = mix(v010, v110, f.x);
	let x01 = mix(v001, v101, f.x);
	let x11 = mix(v011, v111, f.x);

	let y0 = mix(x00, x10, f.y);
	let y1 = mix(x01, x11, f.y);

	return mix(y0, y1, f.z);
}

fn detail_fbm(p_input: vec3<f32>) -> f32 {
	var p = p_input;
	var value = 0.0;
	var amplitude = 0.5;
	var frequency = 1.0;
	var normalizer = 0.0;

	for (var i = 0; i < 6; i = i + 1) {
		value = value + amplitude * detail_noise3d(p * frequency);
		normalizer = normalizer + amplitude;

		frequency = frequency * 2.0;
		amplitude = amplitude * 0.5;
	}

	return value / normalizer;
}
	`);


	/**
	 * Phase 5b.2:
	 *
	 * When a baked TerrainTextureSet is available, WebGPU samples terrain
	 * masks from the GPU-baked atlas instead of recomputing
	 * proceduralTerrainSample() per pixel.
	 *
	 * Atlas encoding:
	 * R = height / maxEncodedHeight
	 * G = landMask
	 * B = mountainMask
	 * A = continent
	 */
	/**
	 * Phase 6c.1:
	 *
	 * WebGL SurfaceMaterial parity.
	 *
	 * The WebGL shader looks better because its visual coast/color logic is
	 * fully procedural and continuous in fragment space. Therefore:
	 *
	 * - terrainSample is always calculated from sphereNormal
	 * - visual landMask comes from terrainSample.y
	 * - baked atlas may only slightly assist mountain masks
	 * - visible height stays terrainHeightAttribute for stable current geometry
	 */
	const terrainSample = proceduralTerrainSample({
		                                              normalInput: sphereNormal,
		                                              terrainSeedOffset,
	                                              });

	let terrainHeight: any = terrainHeightAttribute;
	let landMask: any = terrainSample.y;
	let mountainMask: any = terrainSample.w;

	if (terrainTextureSet) {
		const bakedTerrainData = texture(
			terrainTextureSet.getDataAtlasTexture(),
			terrainDataUv,
		);

		const bakedMaskBlend = bakedTerrainBlend.mul(0.10);

		mountainMask = mix(
			mountainMask,
			bakedTerrainData.b,
			bakedMaskBlend,
		);
	}

	const gpuVertexHeight = terrainHeightAttribute;

	/**
	 * Phase 5c.1b:
	 *
	 * WebGPU vertex displacement.
	 *
	 * TerrainPatch can now build flat sphere grids while this material
	 * moves vertices in the vertex stage from the terrainHeight attribute.
	 * The same baked atlas data is used for surface masks.
	 */
	material.positionNode = sphereNormal.mul(
		float(planetRadius).add(gpuVertexHeight),
	);

	const waterHint = oneMinus(
		smoothstep(
			0.42,
			0.76,
			landMask,
		),
	);

	const landOnly = smoothstep(
		0.58,
		0.78,
		landMask,
	);

	const shallowWater = waterHint.mul(
		smoothstep(
			0.30,
			0.76,
			landMask,
		),
	);

	const deepWater = waterHint.mul(
		oneMinus(
			smoothstep(
				0.14,
				0.54,
				landMask,
			),
		),
	);

	const shelfWater = waterHint.mul(
		smoothstep(
			0.34,
			0.70,
			landMask,
		),
	).mul(
		oneMinus(
			smoothstep(
				0.76,
				0.96,
				landMask,
			),
		),
	);

	const coastDistance = landMask.sub(0.55).abs();

	const coastMask = oneMinus(
		smoothstep(
			0.035,
			0.235,
			coastDistance,
		),
	);

	const softCoastMask = oneMinus(
		smoothstep(
			0.050,
			0.330,
			coastDistance,
		),
	);

	const coastWaterEdge = coastMask.mul(waterHint);
	const coastLandEdge = coastMask.mul(landOnly);
	const softCoastWater = softCoastMask.mul(waterHint);
	const softCoastLand = softCoastMask.mul(landOnly);

	const highland = smoothstep(
		0.055,
		0.19,
		terrainHeight,
	).mul(landOnly);

	const heightSnow = smoothstep(
		0.18,
		0.30,
		terrainHeight,
	).mul(landOnly);

	const mountainMaterial = smoothstep(
		0.18,
		0.82,
		mountainMask,
	).mul(landOnly);

	const mountainPeak = smoothstep(
		0.56,
		0.96,
		mountainMask,
	).mul(landOnly);

	const baseColorRaw = vertexColor().toVec3();

	/**
	 * WebGL-like getTerrainColorGL().
	 *
	 * This intentionally uses landMask/height thresholds from the WebGL
	 * ShaderMaterial instead of the newer experimental WebGPU palette.
	 */
	const deepWaterColor = color(0x071f2f);
	const midWaterColor = color(0x0c3545);
	const shallowWaterColor = color(0x155463);
	const coastalWaterColor = color(0x1d6a70);

	const wetCoastColor = color(0x56614d);
	const lowLandColor = color(0x315d35);
	const grassColor = color(0x3f6d3b);
	const hillsColor = color(0x596842);
	const dryHillsColor = color(0x716a4e);
	const rockColor = color(0x69675b);
	const snowColor = color(0xaeb2a7);

	let waterColor = mix(
		deepWaterColor,
		midWaterColor,
		smoothstep(
			0.00,
			0.30,
			landMask,
		),
	);

	waterColor = mix(
		waterColor,
		shallowWaterColor,
		smoothstep(
			0.30,
			0.43,
			landMask,
		),
	);

	waterColor = mix(
		waterColor,
		coastalWaterColor,
		smoothstep(
			0.43,
			0.54,
			landMask,
		),
	);

	let lowCoastLandColor = mix(
		coastalWaterColor,
		wetCoastColor,
		smoothstep(
			0.54,
			0.62,
			landMask,
		),
	);

	lowCoastLandColor = mix(
		lowCoastLandColor,
		lowLandColor,
		smoothstep(
			0.62,
			0.72,
			landMask,
		),
	);

	let heightLandColor = mix(
		lowLandColor,
		grassColor,
		smoothstep(
			0.00,
			0.035,
			terrainHeight,
		),
	);

	heightLandColor = mix(
		heightLandColor,
		hillsColor,
		smoothstep(
			0.035,
			0.080,
			terrainHeight,
		),
	);

	heightLandColor = mix(
		heightLandColor,
		dryHillsColor,
		smoothstep(
			0.080,
			0.135,
			terrainHeight,
		),
	);

	heightLandColor = mix(
		heightLandColor,
		rockColor,
		smoothstep(
			0.135,
			0.205,
			terrainHeight,
		),
	);

	heightLandColor = mix(
		heightLandColor,
		snowColor,
		smoothstep(
			0.205,
			0.310,
			terrainHeight,
		),
	);

	let landColor = mix(
		lowCoastLandColor,
		heightLandColor,
		smoothstep(
			0.70,
			0.82,
			landMask,
		),
	);

	const polar = smoothstep(
		0.74,
		0.98,
		sphereNormal.y.abs(),
	);

	landColor = mix(
		landColor,
		color(0x7d8674),
		polar.mul(0.16),
	);

	let proceduralColor = mix(
		waterColor,
		landColor,
		smoothstep(
			0.54,
			0.72,
			landMask,
		),
	);

	let paletteColor = proceduralColor;

	const desertLand = mix(
		color(0x7c6030),
		color(0xcaa45f),
		smoothstep(
			0.02,
			0.18,
			terrainHeight,
		),
	);

	const desertWater = mix(
		color(0x071f2f),
		color(0x18414d),
		waterHint,
	);

	const desertColor = mix(
		desertWater,
		desertLand,
		smoothstep(
			0.50,
			0.70,
			landMask,
		),
	);

	const iceLand = mix(
		color(0x8798a0),
		color(0xe5f1f4),
		smoothstep(
			0.01,
			0.22,
			terrainHeight.add(polar.mul(0.12)),
		),
	);

	const iceWater = mix(
		color(0x092235),
		color(0x2f6678),
		smoothstep(
			0.15,
			0.62,
			landMask,
		),
	);

	const iceColor = mix(
		iceWater,
		iceLand,
		smoothstep(
			0.46,
			0.68,
			landMask,
		),
	);

	const oceanicLand = mix(
		color(0x274f34),
		color(0x6d8050),
		smoothstep(
			0.02,
			0.18,
			terrainHeight,
		),
	);

	const oceanicWater = mix(
		color(0x041a2f),
		color(0x0f6b86),
		smoothstep(
			0.18,
			0.62,
			landMask,
		),
	);

	const oceanicColor = mix(
		oceanicWater,
		oceanicLand,
		smoothstep(
			0.72,
			0.88,
			landMask,
		),
	);

	const rockyLand = mix(
		color(0x34362f),
		color(0x77705e),
		smoothstep(
			0.00,
			0.22,
			terrainHeight,
		),
	);

	const rockyWater = mix(
		color(0x071722),
		color(0x0b3844),
		waterHint,
	);

	const rockyColor = mix(
		rockyWater,
		rockyLand,
		smoothstep(
			0.50,
			0.74,
			landMask,
		),
	);

	const lavaSurfaceStrength = max(
		forcedLavaSurface,
		max(
			paletteLava,
			profileLavaInfluence,
		),
	);

	const lavaLandMask = mix(
		landOnly,
		float(1.0),
		forcedLavaSurface,
	);

	/*
	 * Clean lava stand:
	 *
	 * This is intentionally simple and visible:
	 * - surface=lava forces the entire surface into basalt/lava mode
	 * - no Planet.ts dependency required
	 * - no overlay required
	 */
	const lavaCracks = smoothstep(
		0.50,
		0.88,
		mountainMask
			.add(terrainHeight.mul(2.0))
			.add(profileLavaInfluence.mul(0.25))
			.add(forcedLavaSurface.mul(0.45)),
	).mul(lavaLandMask);

	const lavaHotspots = smoothstep(
		0.70,
		0.96,
		mountainMask
			.add(terrainHeight.mul(3.0))
			.add(forcedLavaSurface.mul(0.30)),
	).mul(lavaLandMask);

	const basaltColor = mix(
		color(0x050403),
		color(0x241812),
		smoothstep(
			0.00,
			0.24,
			terrainHeight.add(mountainMask.mul(0.06)),
		),
	);

	const lavaGlowColor = mix(
		color(0xff3308),
		color(0xffd66a),
		smoothstep(
			0.18,
			0.95,
			lavaCracks.add(lavaHotspots.mul(0.75)),
		),
	);

	const lavaGlow = lavaGlowColor.mul(
		lavaCracks.mul(0.70).add(
			lavaHotspots.mul(1.10),
		),
	);

	const lavaColor = basaltColor.add(lavaGlow);

	const toxicLand = mix(
		color(0x445033),
		color(0x9aa85a),
		smoothstep(
			0.00,
			0.18,
			terrainHeight,
		),
	);

	const toxicWater = mix(
		color(0x101c16),
		color(0x566b2f),
		smoothstep(
			0.10,
			0.70,
			landMask,
		),
	);

	const toxicColor = mix(
		toxicWater,
		toxicLand,
		smoothstep(
			0.48,
			0.72,
			landMask,
		),
	);

	const metallicLand = mix(
		color(0x34393d),
		color(0x8a8d87),
		smoothstep(
			0.00,
			0.24,
			terrainHeight,
		),
	);

	const metallicColor = mix(
		color(0x07131a),
		metallicLand,
		smoothstep(
			0.46,
			0.72,
			landMask,
		),
	);

	const carbonLand = mix(
		color(0x15120f),
		color(0x41342a),
		smoothstep(
			0.00,
			0.22,
			terrainHeight,
		),
	);

	const carbonColor = mix(
		color(0x05080b),
		carbonLand,
		smoothstep(
			0.48,
			0.72,
			landMask,
		),
	);

	paletteColor = mix(
		paletteColor,
		rockyColor,
		paletteRocky.mul(0.55),
	);

	paletteColor = mix(
		paletteColor,
		oceanicColor,
		paletteOceanic.mul(0.75),
	);

	paletteColor = mix(
		paletteColor,
		iceColor,
		paletteIce.mul(0.86).add(profileIceInfluence.mul(0.18)),
	);

	paletteColor = mix(
		paletteColor,
		desertColor,
		paletteDesert.mul(0.82),
	);

	paletteColor = mix(
		paletteColor,
		lavaColor,
		max(
			forcedLavaSurface,
			paletteLava.mul(0.92).add(profileLavaInfluence.mul(0.24)),
		),
	);

	paletteColor = mix(
		paletteColor,
		toxicColor,
		paletteToxic.mul(0.78).add(profileToxicInfluence.mul(0.16)),
	);

	paletteColor = mix(
		paletteColor,
		metallicColor,
		paletteMetallic.mul(0.82).add(profileMetalInfluence.mul(0.18)),
	);

	paletteColor = mix(
		paletteColor,
		carbonColor,
		paletteCarbon.mul(0.84),
	);

	paletteColor = mix(
		paletteColor,
		proceduralColor,
		paletteEarthlike.mul(0.30),
	);

	proceduralColor = paletteColor;

	let baseColor = mix(
		baseColorRaw,
		proceduralColor,
		float(0.72),
	);

	/**
	 * Similar to WebGL adjustSaturation(..., 0.82).
	 */
	const luminance = baseColor.r
		.mul(0.2126)
		.add(baseColor.g.mul(0.7152))
		.add(baseColor.b.mul(0.0722));

	baseColor = mix(
		luminance.toVec3(),
		baseColor,
		float(0.82),
	);

	baseColor = mix(
		baseColor,
		oceanDeepTint,
		waterHint.mul(0.16),
	);

	const worldNormal = normalize(normalWorld);
	const viewDirection = normalize(
		cameraPosition.sub(positionWorld),
	);

	const detailResult = proceduralSurfaceDetail({
		                                             normalInput: sphereNormal,
		                                             landMaskInput: landMask,
		                                             waterHintInput: waterHint,
		                                             terrainHeightInput: terrainHeight,
		                                             mountainMaskInput: mountainMask,
	                                             });

	baseColor = baseColor.add(
		detailResult.rgb.mul(detailResult.a).mul(
			oneMinus(forcedLavaSurface.mul(0.75)),
		),
	);

	const ndl = dot(worldNormal, sunDirection);

	const day = smoothstep(
		terminatorSoftness.mul(-1.0),
		terminatorSoftness,
		ndl,
	);

	const directLight = pow(
		max(ndl, 0.0),
		0.62,
	);

	const surfaceOcclusion = surfaceRaymarchOcclusion({
		                                                  normalInput: sphereNormal,
		                                                  sunDirInput: sunDirection,
		                                                  terrainSeedOffset,
		                                                  steps: surfaceRaymarchSteps,
		                                                  strength: surfaceRaymarchStrength,
	                                                  });

	const lowAngleLight = smoothstep(
		-0.10,
		0.42,
		ndl,
	).mul(
		oneMinus(
			smoothstep(
				0.48,
				0.92,
				ndl,
			),
		),
	);

	const dayWarmth = smoothstep(
		0.08,
		0.86,
		ndl,
	).mul(0.035);

	const mountainContrast = mountainMaterial
		.mul(
			smoothstep(
				0.08,
				0.92,
				ndl,
			),
		)
		.mul(0.19);

	const mountainGrazingLift = mountainPeak
		.mul(lowAngleLight)
		.mul(0.34);

	const highlandLight = highland
		.mul(day)
		.mul(0.055);

	const waterDayLift = shallowWater
		.mul(0.10)
		.add(
			shelfWater.mul(0.08),
		)
		.add(
			coastWaterEdge.mul(0.055),
		);

	const dayTintedBase = mix(
		baseColor,
		baseColor.mul(warmDayTint),
		float(0.0),
	);

	const dayColor = dayTintedBase.mul(
		ambient.add(
			directLight
				.mul(surfaceOcclusion)
				.mul(1.12)
				.add(mountainContrast)
				.add(mountainGrazingLift)
				.add(highlandLight)
				.add(waterDayLift),
		),
	);

	const nightColor = nightTint
		.add(
			baseColor.mul(0.20),
		)
		.add(
			mountainLightTint.mul(mountainPeak).mul(0.020),
		)
		.add(
			oceanNightTint.mul(deepWater).mul(0.090),
		)
		.add(
			oceanShelfTint.mul(shallowWater).mul(0.125),
		)
		.add(
			oceanCoastLightTint.mul(softCoastWater).mul(0.026),
		);

	let surfaceColor = mix(
		nightColor,
		dayColor,
		day,
	);

	const viewFacing = max(
		dot(worldNormal, viewDirection),
		0.0,
	);

	const grazingView = oneMinus(viewFacing);

	const fresnel = pow(
		grazingView,
		2.05,
	);

	const waterFresnel = fresnel.mul(
		waterHint
			.mul(0.42)
			.add(shelfWater.mul(0.10))
			.add(coastWaterEdge.mul(0.060))
			.add(0.045),
	);

	const halfDirection = normalize(
		sunDirection.add(viewDirection),
	);

	const specDot = max(
		dot(worldNormal, halfDirection),
		0.0,
	);

	const tightSpecular = pow(
		specDot,
		96.0,
	).mul(waterHint).mul(day).mul(0.18);

	const broadSpecular = pow(
		specDot,
		18.0,
	).mul(waterHint).mul(day).mul(0.075);

	const mountainRim = pow(
		grazingView,
		1.28,
	).mul(mountainPeak).mul(day);

	const coastSurf = coastWaterEdge.mul(
		smoothstep(
			-0.12,
			0.72,
			ndl,
		),
	);

	const rim = pow(
		grazingView,
		1.70,
	).mul(
		smoothstep(
			-0.12,
			0.78,
			ndl,
		),
	);

	const horizon = pow(
		grazingView,
		1.58,
	);

	const atmosphereEdge = pow(
		grazingView,
		2.70,
	).mul(
		smoothstep(
			-0.36,
			0.76,
			ndl,
		),
	);

	const dayHaze = horizon.mul(
		smoothstep(
			-0.22,
			0.80,
			ndl,
		),
	);

	const nightHaze = horizon.mul(
		oneMinus(day),
	).mul(0.40);

	const twilight = smoothstep(
		-0.92,
		0.22,
		ndl,
	).mul(
		oneMinus(
			smoothstep(
				0.08,
				0.72,
				ndl,
			),
		),
	);

	const lowSunHaze = horizon.mul(twilight).mul(0.36);

	const polarLift = smoothstep(
		0.76,
		0.985,
		max(worldNormal.y, worldNormal.y.mul(-1.0)),
	).mul(day);

	surfaceColor = surfaceColor
		.add(
			oceanFresnelTint
				.mul(waterFresnel)
				.mul(day.mul(0.84).add(0.16)),
		)
		.add(
			oceanSpecularTint
				.mul(tightSpecular),
		)
		.add(
			oceanLightTint
				.mul(broadSpecular),
		)
		.add(
			oceanCoastLightTint
				.mul(coastSurf)
				.mul(0.020),
		)
		.add(
			oceanLightTint
				.mul(softCoastWater)
				.mul(day.mul(0.55).add(0.08))
				.mul(0.006),
		)
		.add(
			coastTint
				.mul(coastLandEdge)
				.mul(day)
				.mul(0.012),
		)
		.add(
			highlandTint
				.mul(softCoastLand)
				.mul(day)
				.mul(0.006),
		)
		.add(
			coastTint
				.mul(softCoastMask)
				.mul(day.mul(0.45).add(0.04))
				.mul(0.004),
		)
		.add(
			mountainLightTint
				.mul(mountainRim)
				.mul(0.12),
		)
		.add(
			mountainLightTint
				.mul(mountainGrazingLift)
				.mul(day)
				.mul(0.16),
		)
		.add(
			rimTint
				.mul(rim)
				.mul(0.12),
		)
		.add(
			fakeAtmosphereTint
				.mul(atmosphereEdge)
				.mul(0.10),
		)
		.add(
			horizonHazeTint
				.mul(dayHaze)
				.mul(0.070),
		)
		.add(
			fakeAtmosphereTint
				.mul(nightHaze)
				.mul(0.060),
		)
		.add(
			lowSunHazeTint
				.mul(lowSunHaze)
				.mul(0.085),
		)
		.add(
			twilightTint
				.mul(twilight)
				.mul(0.34),
		)
		.add(
			coolIceTint
				.mul(polarLift)
				.mul(0.030),
		)
		.add(
			coolIceTint
				.mul(heightSnow)
				.mul(day)
				.mul(0.10),
		)
		.add(
			lavaGlowColor
				.mul(lavaCracks.mul(1.35).add(lavaHotspots.mul(1.75)))
				.mul(lavaSurfaceStrength)
				.mul(oneMinus(day).mul(1.05).add(day.mul(0.42))),
		)
		.mul(exposure);

	material.colorNode = surfaceColor;
	material.toneMapped = false;

	/**
	 * Debug / comparison hook.
	 *
	 * 1.0 = baked GPU terrain atlas
	 * 0.0 = legacy proceduralTerrainSample fallback
	 */
	(material as any).setTerrainSeed = (seed: number): void => {
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
	};

	(material as any).setForcedLavaSurface = (enabled: boolean): void => {
		forcedLavaSurface.value = enabled ? 1.0 : 0.0;
	};

	(material as any).setSurfaceProfile = (
		profile: SurfaceRenderProfile,
	): void => {
		profileOceanLevel.value = profile.oceanLevel;
		profileMountainScale.value = profile.mountainScale;
		profileTerrainRoughness.value = profile.terrainRoughness;
		profileWaterInfluence.value = profile.waterInfluence;
		profileIceInfluence.value = profile.iceInfluence;
		profileLavaInfluence.value = profile.lavaInfluence;
		profileToxicInfluence.value = profile.toxicInfluence;
		profileMetalInfluence.value = profile.metalInfluence;

		paletteOceanic.value = profile.palette === 'oceanic' ? 1.0 : 0.0;
		paletteIce.value = profile.palette === 'ice' ? 1.0 : 0.0;
		paletteDesert.value = profile.palette === 'desert' ? 1.0 : 0.0;
		paletteLava.value = profile.palette === 'lava' ? 1.0 : 0.0;
		paletteToxic.value = profile.palette === 'toxic' ? 1.0 : 0.0;
		paletteMetallic.value = profile.palette === 'metallic' ? 1.0 : 0.0;
		paletteCarbon.value = profile.palette === 'carbon' ? 1.0 : 0.0;
		paletteEarthlike.value = profile.palette === 'earthlike' ? 1.0 : 0.0;
		paletteRocky.value = profile.palette === 'rocky' ? 1.0 : 0.0;

		surfaceRaymarchStrength.value = profile.raymarchOcclusionStrength;
	};

	(material as any).getSurfaceProfileStats = () => ({
		oceanLevel: profileOceanLevel.value,
		mountainScale: profileMountainScale.value,
		terrainRoughness: profileTerrainRoughness.value,
		waterInfluence: profileWaterInfluence.value,
		iceInfluence: profileIceInfluence.value,
		lavaInfluence: profileLavaInfluence.value,
		toxicInfluence: profileToxicInfluence.value,
		metalInfluence: profileMetalInfluence.value,
		paletteOceanic: paletteOceanic.value,
		paletteIce: paletteIce.value,
		paletteDesert: paletteDesert.value,
		paletteLava: paletteLava.value,
		paletteToxic: paletteToxic.value,
		paletteMetallic: paletteMetallic.value,
		paletteCarbon: paletteCarbon.value,
		paletteEarthlike: paletteEarthlike.value,
		paletteRocky: paletteRocky.value,
		forcedLavaSurface: forcedLavaSurface.value,
		terrainSeedOffset: terrainSeedOffset.value.clone(),
		raymarchOcclusionStrength: surfaceRaymarchStrength.value,
	});

	(material as any).setRaymarchedSurfaceEnabled = (enabled: boolean): void => {
		if (!enabled) {
			surfaceRaymarchStrength.value = 0.0;
			return;
		}

		if (surfaceRaymarchStrength.value <= 0.001) {
			surfaceRaymarchStrength.value = 0.42;
		}
	};

	(material as any).setSurfaceRaymarchSteps = (steps: number): void => {
		surfaceRaymarchSteps.value = Math.max(
			0,
			Math.min(6, steps),
		);
	};

	(material as any).getSurfaceRaymarchSteps = (): number => {
		return surfaceRaymarchSteps.value;
	};

	(material as any).setBakedTerrainBlend = (value: number): void => {
		bakedTerrainBlend.value = Math.max(
			0,
			Math.min(1, value),
		);
	};

	(material as any).getBakedTerrainBlend = (): number => {
		return bakedTerrainBlend.value;
	};

	return material;
}

/**
 * Surface raymarch occlusion.
 *
 * This is not a full path tracer. It raymarches along the light tangent
 * over the procedural terrain field and adds cheap terrain self-shadowing.
 *
 * Default strength is 0.0 and gets enabled by Planet feature flags.
 */
const surfaceRaymarchOcclusion = wgslFn(`
fn surface_raymarch_occlusion(
	normalInput: vec3<f32>,
	sunDirInput: vec3<f32>,
	terrainSeedOffset: vec3<f32>,
	steps: f32,
	strength: f32
) -> f32 {
	if (strength <= 0.001 || steps < 1.0) {
		return 1.0;
	}

	let n = normalize(normalInput);
	let sunDir = normalize(sunDirInput);

	let ndl = dot(n, sunDir);

	if (ndl <= 0.02) {
		return 1.0;
	}

	let tangent = normalize(
		sunDir -
		n * ndl +
		vec3<f32>(0.0001, 0.0, 0.0)
	);

	let baseHeight = surface_height(
		n,
		terrainSeedOffset
	);

	var visibility = 1.0;

	for (var i = 1; i <= 6; i = i + 1) {
		if (f32(i) > steps) {
			break;
		}

		let t = f32(i) * 0.0105;

		let sampleNormal = normalize(
			n +
			tangent * t
		);

		let sampleHeight = surface_height(
			sampleNormal,
			terrainSeedOffset
		);

		let expectedHeight =
			baseHeight +
			t * 0.065;

		let blocker = smoothstep(
			0.010,
			0.055,
			sampleHeight - expectedHeight
		);

		visibility = min(
			visibility,
			1.0 - blocker * 0.34
		);
	}

	return mix(
		1.0,
		visibility,
		clamp(strength, 0.0, 1.0)
	);
}

fn surface_hash3(p: vec3<f32>) -> f32 {
	return fract(
		sin(
			p.x * 127.1 +
			p.y * 311.7 +
			p.z * 74.7
		) *
		43758.5453123
	);
}

fn surface_noise(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);

	f = f * f * (3.0 - 2.0 * f);

	let v000 = surface_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let v100 = surface_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let v010 = surface_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let v110 = surface_hash3(i + vec3<f32>(1.0, 1.0, 0.0));

	let v001 = surface_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let v101 = surface_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let v011 = surface_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let v111 = surface_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let x00 = mix(v000, v100, f.x);
	let x10 = mix(v010, v110, f.x);
	let x01 = mix(v001, v101, f.x);
	let x11 = mix(v011, v111, f.x);

	let y0 = mix(x00, x10, f.y);
	let y1 = mix(x01, x11, f.y);

	return mix(y0, y1, f.z);
}

fn surface_fbm(p_input: vec3<f32>) -> f32 {
	var p = p_input;
	var value = 0.0;
	var amplitude = 0.5;
	var frequency = 1.0;
	var normalizer = 0.0;

	for (var i = 0; i < 6; i = i + 1) {
		value = value + surface_noise(p * frequency) * amplitude;
		normalizer = normalizer + amplitude;

		frequency = frequency * 2.0;
		amplitude = amplitude * 0.5;
	}

	return value / normalizer;
}

fn surface_ridged_fbm(p_input: vec3<f32>) -> f32 {
	var p = p_input;
	var value = 0.0;
	var amplitude = 0.52;
	var frequency = 1.0;
	var normalizer = 0.0;

	for (var i = 0; i < 5; i = i + 1) {
		let noiseValue = surface_noise(p * frequency);
		let ridge = 1.0 - abs(noiseValue * 2.0 - 1.0);
		let sharpened = ridge * ridge;

		value = value + sharpened * amplitude;
		normalizer = normalizer + amplitude;

		frequency = frequency * 2.15;
		amplitude = amplitude * 0.48;
	}

	return value / normalizer;
}

fn surface_height(
	normalInput: vec3<f32>,
	terrainSeedOffset: vec3<f32>
) -> f32 {
	let normal = normalize(
		normalInput +
		terrainSeedOffset * 0.215
	);

	let continentBase = surface_fbm(normal * 1.25);

	let coastNoise =
		(surface_fbm(normal * 2.4) - 0.5) *
		0.045;

	let continent = continentBase + coastNoise;

	let landMask = smoothstep(
		0.525,
		0.585,
		continent
	);

	let highlands = max(0.0, continent - 0.54);

	let mountainMask =
		smoothstep(0.62, 0.78, continent) *
		landMask;

	let ridgeLarge = surface_ridged_fbm(normal * 3.8);
	let ridgeMedium = surface_ridged_fbm(normal * 8.5);
	let ridgeFine = surface_ridged_fbm(normal * 18.0);

	let mountainChains =
		smoothstep(0.46, 0.84, ridgeLarge) *
		(
			ridgeMedium * 0.72 +
			ridgeFine * 0.28
		);

	let sharpPeaks = pow(
		clamp(mountainChains, 0.0, 1.0),
		1.75
	);

	let mountains =
		sharpPeaks *
		mountainMask;

	let foothills =
		smoothstep(0.48, 0.74, ridgeLarge) *
		mountainMask *
		0.45;

	let detail =
		(surface_fbm(normal * 24.0) - 0.5) *
		0.010 *
		landMask;

	let height =
		landMask * 0.006 +
		highlands * 0.095 +
		foothills * 0.055 +
		mountains * 0.165 +
		detail;

	return max(0.0, height);
}
	`);
