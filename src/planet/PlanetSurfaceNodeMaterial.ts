import * as THREE from 'three/webgpu';

import {
	attribute,
	cameraPosition,
	color,
	dot,
	float,
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
 * Phase 4d.2:
 *
 * TSL material-data pass.
 *
 * Reads custom TerrainPatch BufferGeometry attributes:
 * - terrainHeight
 * - landMask
 * - mountainMask
 * - waterHint
 *
 * Goal:
 * Keep the 4c.3 lighting balance, but finally separate material behavior:
 * - water gets deeper tint + fresnel
 * - coasts get a subtle edge lift
 * - mountains get slightly more light contrast
 * - high terrain gets a cooler snow/ice lift
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

	const ambient = uniform(0.50);
	const exposure = uniform(1.34);
	const terminatorSoftness = uniform(1.18);

	const nightTint = color(0x0b2035);
	const twilightTint = color(0x245c92);
	const rimTint = color(0x9fd2ff);
	const fakeAtmosphereTint = color(0x78bdff);
	const oceanFresnelTint = color(0x3ab4d0);
	const oceanDeepTint = color(0x051827);
	const oceanShelfTint = color(0x0b4054);
	const coastTint = color(0x4f755c);
	const warmDayTint = color(0xffefd2);
	const mountainTint = color(0x776f5f);
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
			0.32,
			0.74,
			landMask,
		),
	);

	const deepWater = waterHint.mul(
		oneMinus(
			smoothstep(
				0.16,
				0.52,
				landMask,
			),
		),
	);

	const coastMask = oneMinus(
		smoothstep(
			0.035,
			0.22,
			landMask.sub(0.55).abs(),
		),
	);

	const heightSnow = smoothstep(
		0.18,
		0.30,
		terrainHeight,
	).mul(landOnly);

	const mountainMaterial = smoothstep(
		0.22,
		0.82,
		mountainMask,
	).mul(landOnly);

	const baseColorRaw = vertexColor().toVec3();

	/**
	 * Subtle color lift.
	 * Less aggressive than 4c.2, so the terrain does not crush into hard patches.
	 */
	let baseColor = baseColorRaw
		.mul(1.045)
		.add(
			baseColorRaw.mul(baseColorRaw).mul(0.055),
		);

	baseColor = mix(
		baseColor,
		oceanDeepTint,
		deepWater.mul(0.48),
	);

	baseColor = mix(
		baseColor,
		oceanShelfTint,
		shallowWater.mul(0.22),
	);

	baseColor = mix(
		baseColor,
		coastTint,
		coastMask.mul(0.075),
	);

	baseColor = mix(
		baseColor,
		mountainTint,
		mountainMaterial.mul(0.10),
	);

	baseColor = mix(
		baseColor,
		coolIceTint,
		heightSnow.mul(0.20),
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

	const dayWarmth = smoothstep(
		0.08,
		0.86,
		ndl,
	).mul(0.035);

	const mountainContrast = mountainMaterial.mul(
		smoothstep(
			0.10,
			0.90,
			ndl,
		).mul(0.16),
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
				.add(mountainContrast),
		),
	);

	/**
	 * Keep the dark side dark, but not empty.
	 * Water stays darker than land, but not fully crushed.
	 */
	const nightColor = nightTint
		.add(
			baseColorRaw.mul(0.36),
		)
		.add(
			oceanShelfTint.mul(shallowWater).mul(0.045),
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

	const fresnel = pow(
		oneMinus(viewFacing),
		2.35,
	);

	const rim = pow(
		oneMinus(viewFacing),
		1.70,
	).mul(
		smoothstep(
			-0.12,
			0.78,
			ndl,
		),
	);

	const atmosphereEdge = pow(
		oneMinus(viewFacing),
		3.35,
	).mul(
		smoothstep(
			-0.28,
			0.70,
			ndl,
		),
	);

	const twilight = smoothstep(
		-0.92,
		0.18,
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

	const polarLift = smoothstep(
		0.76,
		0.985,
		max(worldNormal.y, worldNormal.y.mul(-1.0)),
	).mul(day);

	surfaceColor = surfaceColor
		.add(
			oceanFresnelTint
				.mul(fresnel)
				.mul(day)
				.mul(waterHint.mul(0.22).add(0.035)),
		)
		.add(
			coastTint
				.mul(coastMask)
				.mul(day)
				.mul(0.055),
		)
		.add(
			rimTint
				.mul(rim)
				.mul(0.15),
		)
		.add(
			fakeAtmosphereTint
				.mul(atmosphereEdge)
				.mul(0.095),
		)
		.add(
			twilightTint
				.mul(twilight)
				.mul(0.30),
		)
		.add(
			coolIceTint
				.mul(polarLift)
				.mul(0.035),
		)
		.add(
			coolIceTint
				.mul(heightSnow)
				.mul(day)
				.mul(0.09),
		)
		.mul(exposure);

	material.colorNode = surfaceColor;
	material.toneMapped = false;

	return material;
}
