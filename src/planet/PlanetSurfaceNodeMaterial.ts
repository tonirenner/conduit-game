import * as THREE from 'three/webgpu';

import {
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
 * Phase 4c.3:
 *
 * TSL surface lighting balance pass.
 *
 * 4c.2 added contrast, but the night/ocean side became too heavy.
 * This version pulls the look back toward readable orbit lighting:
 * - softer shadow floor
 * - less aggressive direct contrast
 * - stronger blue twilight/edge readability
 * - less polar over-lift
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
	const warmDayTint = color(0xffefd2);
	const coolIceTint = color(0xd8ecff);

	const baseColorRaw = vertexColor().toVec3();

	/**
	 * Subtle color lift.
	 * Less aggressive than 4c.2, so the terrain does not crush into hard patches.
	 */
	const baseColor = baseColorRaw
		.mul(1.045)
		.add(
			baseColorRaw.mul(baseColorRaw).mul(0.055),
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

	const dayTintedBase = mix(
		baseColor,
		baseColor.mul(warmDayTint),
		dayWarmth,
	);

	const dayColor = dayTintedBase.mul(
		ambient.add(
			directLight.mul(1.22),
		),
	);

	/**
	 * Keep the dark side dark, but not empty.
	 */
	const nightColor = nightTint.add(
		baseColorRaw.mul(0.36),
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
				.mul(0.10),
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
				.mul(0.045),
		)
		.mul(exposure);

	material.colorNode = surfaceColor;
	material.toneMapped = false;

	return material;
}
