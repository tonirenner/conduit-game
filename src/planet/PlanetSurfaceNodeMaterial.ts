import * as THREE from 'three/webgpu';

import {
	attribute,
	cameraPosition,
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
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

/**
 * Phase 4f.1:
 *
 * TSL relief / mountain lighting pass.
 *
 * Based on Phase 4e.3.
 *
 * Goal:
 * Keep the fake aerial perspective, but give terrain height and mountains
 * more visual weight:
 * - mountainMask influences local contrast
 * - terrainHeight adds highland / snow readability
 * - grazing light catches mountains more strongly
 * - land gets a subtle terrain-detail lift
 *
 * Still intentionally not a real procedural normal:
 * - no height-gradient normal yet
 * - no procedural noise yet
 * - no texture lookup yet
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

	const terrainHeight = attribute('terrainHeight', 'float');
	const landMask = attribute('landMask', 'float');
	const mountainMask = attribute('mountainMask', 'float');
	const waterHint = attribute('waterHint', 'float');

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
		shelfWater.mul(0.12),
	);

	baseColor = mix(
		baseColor,
		oceanCoastLightTint,
		coastWaterEdge.mul(0.18),
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
			coastWaterEdge.mul(0.15),
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
			.add(coastWaterEdge.mul(0.20))
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
				.mul(0.16),
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
