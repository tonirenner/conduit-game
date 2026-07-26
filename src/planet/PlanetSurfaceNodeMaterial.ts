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
	wgslFn,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

/**
 * Phase 4k.3b:
 *
 * Per-pixel terrain/coast material sampling, hybrid tuned.
 *
 * Based on Phase 4k.2.
 *
 * Change:
 * - terrain sample is rebuilt in WGSL from local `sphereNormal`
 * - landMask / waterHint / mountainMask are blended more conservatively
 * - vertex attributes remain dominant enough to stay aligned with geometry
 *
 * Goal:
 * Keep the smoother WebGPU coast material, but reduce the cyan shelf halo
 * and the visible mismatch between shader coast and mesh coast.
 */
export function createPlanetSurfaceNodeMaterial(): any {
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

	const ambient = uniform(0.52);
	const exposure = uniform(1.38);
	const terminatorSoftness = uniform(1.24);

	const nightTint = color(0x0b2035);
	const twilightTint = color(0x285f96);
	const rimTint = color(0xa8d8ff);
	const fakeAtmosphereTint = color(0x7fc2ff);
	const horizonHazeTint = color(0x9ed4ff);
	const lowSunHazeTint = color(0xffe6c2);

	const oceanFresnelTint = color(0x49c3dc);
	const oceanDeepTint = color(0x071f2f);
	const oceanNightTint = color(0x071b2b);
	const oceanShelfTint = color(0x155463);
	const oceanLightTint = color(0x4aa5bb);
	const oceanSpecularTint = color(0xfff3d8);
	const oceanCoastLightTint = color(0x58b8ad);

	const coastTint = color(0x587b61);
	const warmDayTint = color(0xffefd2);
	const mountainTint = color(0x6f685b);
	const mountainLightTint = color(0xb9ad91);
	const highlandTint = color(0x8a8065);
	const coolIceTint = color(0xd8ecff);

	const terrainHeightAttribute = attribute('terrainHeight', 'float');
	const landMaskAttribute = attribute('landMask', 'float');
	const mountainMaskAttribute = attribute('mountainMask', 'float');
	const waterHintAttribute = attribute('waterHint', 'float');
	const sphereNormal = normalize(attribute('sphereNormal', 'vec3'));

	const proceduralTerrainSample = wgslFn(`
fn procedural_terrain_sample(
	normalInput: vec3<f32>
) -> vec4<f32> {
	let normal = normalize(normalInput);

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


	const terrainSample = proceduralTerrainSample({
		                                              normalInput: sphereNormal,
	                                              });

	/**
	 * Phase 4k.3b:
	 *
	 * Material masks are now mostly sampled per pixel from the same terrain
	 * logic that generates the mesh. Geometry still uses the cached vertex
	 * data, but coast/water shading no longer depends purely on vertex
	 * interpolation.
	 */
	const terrainHeight = mix(
		terrainHeightAttribute,
		terrainSample.x,
		float(0.25),
	);

	const landMask = mix(
		landMaskAttribute,
		terrainSample.y,
		float(0.52),
	);

	const mountainMask = mix(
		mountainMaskAttribute,
		terrainSample.w,
		float(0.45),
	);

	const waterHint = mix(
		waterHintAttribute,
		oneMinus(
			smoothstep(
				0.42,
				0.76,
				landMask,
			),
		),
		float(0.58),
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

	const coastMask = oneMinus(
		smoothstep(
			0.030,
			0.235,
			landMask.sub(0.55).abs(),
		),
	);

	const coastWaterEdge = coastMask.mul(waterHint);
	const coastLandEdge = coastMask.mul(landOnly);

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

	let baseColor = baseColorRaw
		.mul(1.045)
		.add(
			baseColorRaw.mul(baseColorRaw).mul(0.055),
		);

	baseColor = mix(
		baseColor,
		oceanDeepTint,
		deepWater.mul(0.32),
	);

	baseColor = mix(
		baseColor,
		oceanShelfTint,
		shallowWater.mul(0.38),
	);

	baseColor = mix(
		baseColor,
		oceanLightTint,
		shelfWater.mul(0.095),
	);

	baseColor = mix(
		baseColor,
		oceanCoastLightTint,
		coastWaterEdge.mul(0.135),
	);

	baseColor = mix(
		baseColor,
		coastTint,
		coastLandEdge.mul(0.085),
	);

	baseColor = mix(
		baseColor,
		highlandTint,
		highland.mul(0.09),
	);

	baseColor = mix(
		baseColor,
		mountainTint,
		mountainMaterial.mul(0.15),
	);

	baseColor = mix(
		baseColor,
		mountainLightTint,
		mountainPeak.mul(0.10),
	);

	baseColor = mix(
		baseColor,
		coolIceTint,
		heightSnow.mul(0.23),
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
		detailResult.rgb.mul(detailResult.a),
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
			coastWaterEdge.mul(0.115),
		);

	const dayTintedBase = mix(
		baseColor,
		baseColor.mul(warmDayTint),
		dayWarmth,
	);

	const dayColor = dayTintedBase.mul(
		ambient.add(
			directLight
				.mul(1.22)
				.add(mountainContrast)
				.add(mountainGrazingLift)
				.add(highlandLight)
				.add(waterDayLift),
		),
	);

	const nightColor = nightTint
		.add(
			baseColorRaw.mul(0.38),
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
			oceanCoastLightTint.mul(coastWaterEdge).mul(0.070),
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
			.add(coastWaterEdge.mul(0.15))
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
				.mul(0.115),
		)
		.add(
			coastTint
				.mul(coastLandEdge)
				.mul(day)
				.mul(0.070),
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
				.mul(0.18),
		)
		.add(
			horizonHazeTint
				.mul(dayHaze)
				.mul(0.115),
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
		.mul(exposure);

	material.colorNode = surfaceColor;
	material.toneMapped = false;

	return material;
}
