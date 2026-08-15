import * as THREE from 'three';
import {
	screenUV,
	uniform,
	wgslFn,
} from 'three/tsl';

const MAX_ATMOSPHERES = 4;

type AtmosphereMetadata = {
	enabled?: boolean;
	planetRadius?: number;
	atmosphereRadius?: number;
	density?: number;
	mieDensity?: number;
	absorption?: number;
	ambient?: number;
	mieG?: number;
	scatteringBoost?: number;
	color?: THREE.Vector3;
	sunDirection?: THREE.Vector3;
	primarySteps?: number;
};

type AtmosphereObject = THREE.Object3D & {
	userData: {
		conduitAtmosphere?: AtmosphereMetadata;
		[key: string]: unknown;
	};
};

type AtmosphereSlot = {
	center: ReturnType<typeof uniform>;
	data: ReturnType<typeof uniform>;
	color: ReturnType<typeof uniform>;
	sun: ReturnType<typeof uniform>;
	extra: ReturnType<typeof uniform>;
};

export type PlanetAtmospherePostProcessRuntime = {
	outputNode: unknown;
	update: () => void;
	getActiveCount: () => number;
};

/**
 * Depth-aware, single-pass atmosphere compositor.
 *
 * The terrain/views render normally first. This node then integrates the
 * atmosphere along the camera ray only up to the scene depth, so terrain stays
 * visible and simply receives aerial perspective. Rays that miss terrain can
 * still render the sky/limb. Up to four nearby planet atmospheres are packed
 * into fixed uniforms; inactive slots exit immediately in WGSL.
 */
export function createPlanetAtmospherePostProcess(
	scene: THREE.Scene,
	camera: THREE.PerspectiveCamera,
	sceneColor: any,
	sceneDepth: any,
): PlanetAtmospherePostProcessRuntime {
	const cameraPosition = uniform(new THREE.Vector3());
	const cameraForward = uniform(new THREE.Vector3(0, 0, -1));
	const cameraRight = uniform(new THREE.Vector3(1, 0, 0));
	const cameraUp = uniform(new THREE.Vector3(0, 1, 0));
	const cameraData = uniform(new THREE.Vector4(
		camera.near,
		camera.far,
		camera.aspect,
		THREE.MathUtils.degToRad(camera.fov * 0.5),
	));

	const slots: AtmosphereSlot[] = Array.from(
		{ length: MAX_ATMOSPHERES },
		() => ({
			center: uniform(new THREE.Vector3()),
			data: uniform(new THREE.Vector4()),
			color: uniform(new THREE.Vector3(0.56, 0.77, 1.0)),
			sun: uniform(new THREE.Vector3(1, 0, 0)),
			extra: uniform(new THREE.Vector4()),
		}),
	);

	const atmospherePost = wgslFn(`
fn conduit_atmosphere_post(
	sceneColor: vec4<f32>,
	sceneDepth: f32,
	uv: vec2<f32>,
	camPos: vec3<f32>,
	camForward: vec3<f32>,
	camRight: vec3<f32>,
	camUp: vec3<f32>,
	camData: vec4<f32>,
	p0Center: vec3<f32>, p0Data: vec4<f32>, p0Color: vec3<f32>, p0Sun: vec3<f32>, p0Extra: vec4<f32>,
	p1Center: vec3<f32>, p1Data: vec4<f32>, p1Color: vec3<f32>, p1Sun: vec3<f32>, p1Extra: vec4<f32>,
	p2Center: vec3<f32>, p2Data: vec4<f32>, p2Color: vec3<f32>, p2Sun: vec3<f32>, p2Extra: vec4<f32>,
	p3Center: vec3<f32>, p3Data: vec4<f32>, p3Color: vec3<f32>, p3Sun: vec3<f32>, p3Extra: vec4<f32>
) -> vec4<f32> {
	let ndc = uv * 2.0 - vec2<f32>(1.0, 1.0);
	let tanHalfFov = tan(camData.w);
	let rayDir = normalize(
		camForward +
		camRight * ndc.x * camData.z * tanHalfFov +
		camUp * ndc.y * tanHalfFov
	);

	var maxDist = camData.y;
	if (sceneDepth < 0.999999) {
		let nearPlane = camData.x;
		let farPlane = camData.y;
		let viewZ = (nearPlane * farPlane) /
			((farPlane - nearPlane) * sceneDepth - farPlane);
		let forwardCos = max(0.0001, dot(rayDir, camForward));
		maxDist = max(0.0, -viewZ / forwardCos);
	}

	var color = sceneColor;
	color = conduit_apply_atmosphere(color, camPos, rayDir, maxDist, p0Center, p0Data, p0Color, p0Sun, p0Extra);
	color = conduit_apply_atmosphere(color, camPos, rayDir, maxDist, p1Center, p1Data, p1Color, p1Sun, p1Extra);
	color = conduit_apply_atmosphere(color, camPos, rayDir, maxDist, p2Center, p2Data, p2Color, p2Sun, p2Extra);
	color = conduit_apply_atmosphere(color, camPos, rayDir, maxDist, p3Center, p3Data, p3Color, p3Sun, p3Extra);
	return color;
}

fn conduit_apply_atmosphere(
	inputColor: vec4<f32>,
	camPosWorld: vec3<f32>,
	rayDir: vec3<f32>,
	maxDist: f32,
	planetCenter: vec3<f32>,
	data: vec4<f32>,
	atmosphereTint: vec3<f32>,
	sunDirectionInput: vec3<f32>,
	extra: vec4<f32>
) -> vec4<f32> {
	// extra.w is the active flag.
	if (extra.w < 0.5 || data.x <= 0.0 || data.y <= data.x) {
		return inputColor;
	}

	let rayOrigin = camPosWorld - planetCenter;
	let planetRadius = data.x;
	let atmosphereRadius = data.y;
	let rayleighDensity = max(0.01, data.z);
	let mieDensity = max(0.0, data.w);
	let absorptionStrength = max(0.0, extra.x);
	let ambientStrength = max(0.0, extra.y);
	let mieG = clamp(extra.z, 0.0, 0.94);
	let sunDirection = normalize(sunDirectionInput);

	let hit = conduit_sphere_intersections(rayOrigin, rayDir, atmosphereRadius);
	if (hit.y <= 0.0) {
		return inputColor;
	}

	var rayStart = max(hit.x, 0.0);
	var rayEnd = min(hit.y, maxDist);
	if (rayEnd <= rayStart) {
		return inputColor;
	}

	// Do not integrate atmosphere behind the solid planet when the depth buffer
	// contains only the transparent background.
	let planetHit = conduit_sphere_intersections(rayOrigin, rayDir, planetRadius);
	if (planetHit.x > 0.0) {
		rayEnd = min(rayEnd, planetHit.x);
	}
	if (rayEnd <= rayStart) {
		return inputColor;
	}

	let atmosphereHeight = max(0.00001, atmosphereRadius - planetRadius);
	let stepLength = (rayEnd - rayStart) / 6.0;
	var samplePoint = rayOrigin + rayDir * (rayStart + stepLength * 0.5);
	var opticalRay = 0.0;
	var opticalMie = 0.0;
	var opticalAbs = 0.0;
	var totalRay = vec3<f32>(0.0);
	var totalMie = vec3<f32>(0.0);

	let betaRay = vec3<f32>(0.22, 0.48, 1.08) * rayleighDensity;
	let betaMie = vec3<f32>(0.20, 0.18, 0.15) * mieDensity;
	let betaAbs = vec3<f32>(0.12, 0.035, 0.012) * absorptionStrength;
	let mu = dot(rayDir, sunDirection);
	let phaseRay = conduit_rayleigh_phase(mu);
	let phaseMie = conduit_mie_phase(mu, mieG);

	for (var i = 0; i < 6; i = i + 1) {
		let h01 = clamp((length(samplePoint) - planetRadius) / atmosphereHeight, 0.0, 1.0);
		let densityRay = exp(-h01 / 0.22) * rayleighDensity;
		let densityMie = exp(-h01 / 0.075) * mieDensity;
		let ozoneDelta = (0.42 - h01) / 0.18;
		let densityAbs = (1.0 / (ozoneDelta * ozoneDelta + 1.0)) * densityRay * absorptionStrength;
		let normalizedStep = stepLength / atmosphereHeight;

		opticalRay = opticalRay + densityRay * normalizedStep;
		opticalMie = opticalMie + densityMie * normalizedStep;
		opticalAbs = opticalAbs + densityAbs * normalizedStep;

		let surfaceNormal = normalize(samplePoint);
		let sunPlanetHit = conduit_sphere_intersections(samplePoint, sunDirection, planetRadius);
		let sunBlocked = sunPlanetHit.x > 0.00001;

		if (!sunBlocked) {
			let sunUp = dot(surfaceNormal, sunDirection);
			let horizonPath = 1.0 / max(0.10, sunUp * 0.72 + 0.28);
			let lightRay = densityRay * 0.20 * horizonPath;
			let lightMie = densityMie * 0.10 * horizonPath;
			let lightAbs = densityAbs * 0.15 * horizonPath;
			let attenuation = exp(-(
				betaRay * (opticalRay + lightRay) +
				betaMie * (opticalMie + lightMie) +
				betaAbs * (opticalAbs + lightAbs)
			));

			totalRay = totalRay + attenuation * densityRay * normalizedStep;
			totalMie = totalMie + attenuation * densityMie * normalizedStep;
		}

		samplePoint = samplePoint + rayDir * stepLength;
	}

	let scatterBoost = 5.8;
	var scattered = (
		phaseRay * betaRay * totalRay * scatterBoost +
		phaseMie * betaMie * totalMie * 3.8
	);

	// Keep generated planet palettes as a weak physical bias rather than turning
	// a desert atmosphere into an orange overlay. Rayleigh wavelength response
	// still owns the sky colour.
	scattered = scattered * mix(
		vec3<f32>(1.0, 1.0, 1.0),
		max(atmosphereTint, vec3<f32>(0.15)),
		0.12
	);
	scattered = scattered + atmosphereTint * opticalRay * ambientStrength;
	let mappedScatter = vec3<f32>(1.0) - exp(-max(scattered, vec3<f32>(0.0)) * 1.35);

	let transmittance = exp(-(
		betaRay * opticalRay +
		betaMie * opticalMie +
		betaAbs * opticalAbs
	));

	let outputRgb = inputColor.rgb * transmittance + mappedScatter;
	let transmissionLuma = dot(transmittance, vec3<f32>(0.2126, 0.7152, 0.0722));
	let scatterLuma = dot(mappedScatter, vec3<f32>(0.2126, 0.7152, 0.0722));
	let atmosphereAlpha = clamp(
		(1.0 - transmissionLuma) * 1.55 + scatterLuma * 0.60,
		0.0,
		0.98
	);
	let outputAlpha = max(inputColor.a, atmosphereAlpha);

	return vec4<f32>(outputRgb, outputAlpha);
}

fn conduit_sphere_intersections(
	rayOrigin: vec3<f32>,
	rayDirection: vec3<f32>,
	radius: f32
) -> vec2<f32> {
	let b = dot(rayOrigin, rayDirection);
	let c = dot(rayOrigin, rayOrigin) - radius * radius;
	let h = b * b - c;
	if (h < 0.0) {
		return vec2<f32>(-1.0, -1.0);
	}
	let root = sqrt(h);
	return vec2<f32>(-b - root, -b + root);
}

fn conduit_rayleigh_phase(mu: f32) -> f32 {
	return 3.0 / (16.0 * 3.141592653589793) * (1.0 + mu * mu);
}

fn conduit_mie_phase(mu: f32, g: f32) -> f32 {
	let g2 = g * g;
	let denominator = pow(max(0.0001, 1.0 + g2 - 2.0 * g * mu), 1.5);
	return 3.0 / (8.0 * 3.141592653589793) *
		((1.0 - g2) * (1.0 + mu * mu)) /
		((2.0 + g2) * denominator);
}
`);

	const outputNode = atmospherePost({
		sceneColor,
		sceneDepth: sceneDepth.r,
		uv: screenUV,
		camPos: cameraPosition,
		camForward: cameraForward,
		camRight: cameraRight,
		camUp: cameraUp,
		camData: cameraData,
		p0Center: slots[0].center,
		p0Data: slots[0].data,
		p0Color: slots[0].color,
		p0Sun: slots[0].sun,
		p0Extra: slots[0].extra,
		p1Center: slots[1].center,
		p1Data: slots[1].data,
		p1Color: slots[1].color,
		p1Sun: slots[1].sun,
		p1Extra: slots[1].extra,
		p2Center: slots[2].center,
		p2Data: slots[2].data,
		p2Color: slots[2].color,
		p2Sun: slots[2].sun,
		p2Extra: slots[2].extra,
		p3Center: slots[3].center,
		p3Data: slots[3].data,
		p3Color: slots[3].color,
		p3Sun: slots[3].sun,
		p3Extra: slots[3].extra,
	});

	let atmosphereObjects: AtmosphereObject[] = [];
	let frame = 0;
	let activeCount = 0;
	const worldCenter = new THREE.Vector3();
	const forward = new THREE.Vector3();
	const right = new THREE.Vector3();
	const up = new THREE.Vector3();

	const rescan = (): void => {
		const found: AtmosphereObject[] = [];
		scene.traverse((object) => {
			if ((object as AtmosphereObject).userData?.conduitAtmosphere) {
				found.push(object as AtmosphereObject);
			}
		});
		atmosphereObjects = found;
	};

	const clearSlot = (slot: AtmosphereSlot): void => {
		(slot.data.value as THREE.Vector4).set(0, 0, 0, 0);
		(slot.extra.value as THREE.Vector4).set(0, 0, 0, 0);
	};

	const update = (): void => {
		frame++;
		if (frame === 1 || frame % 30 === 0) {
			rescan();
		}

		camera.updateMatrixWorld();
		camera.getWorldDirection(forward).normalize();
		right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
		up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

		(cameraPosition.value as THREE.Vector3).copy(camera.position);
		(cameraForward.value as THREE.Vector3).copy(forward);
		(cameraRight.value as THREE.Vector3).copy(right);
		(cameraUp.value as THREE.Vector3).copy(up);
		(cameraData.value as THREE.Vector4).set(
			camera.near,
			camera.far,
			camera.aspect,
			THREE.MathUtils.degToRad(camera.fov * 0.5),
		);

		const candidates = atmosphereObjects
			.map((object) => {
				const metadata = object.userData.conduitAtmosphere!;
				object.updateWorldMatrix(true, false);
				object.getWorldPosition(worldCenter);
				return {
					object,
					metadata,
					center: worldCenter.clone(),
					distance: worldCenter.distanceTo(camera.position) -
						(metadata.atmosphereRadius ?? 0),
				};
			})
			.filter(({ metadata }) => metadata.enabled !== false)
			.sort((a, b) => a.distance - b.distance)
			.slice(0, MAX_ATMOSPHERES);

		activeCount = candidates.length;

		for (let index = 0; index < MAX_ATMOSPHERES; index++) {
			const slot = slots[index];
			const candidate = candidates[index];

			if (!candidate) {
				clearSlot(slot);
				continue;
			}

			const { metadata, center } = candidate;
			(slot.center.value as THREE.Vector3).copy(center);
			(slot.data.value as THREE.Vector4).set(
				metadata.planetRadius ?? 0,
				metadata.atmosphereRadius ?? 0,
				metadata.density ?? 1,
				metadata.mieDensity ?? 0.35,
			);
			(slot.color.value as THREE.Vector3).copy(
				metadata.color ?? new THREE.Vector3(0.56, 0.77, 1.0),
			);
			(slot.sun.value as THREE.Vector3).copy(
				metadata.sunDirection ?? new THREE.Vector3(1, 0, 0),
			).normalize();
			(slot.extra.value as THREE.Vector4).set(
				metadata.absorption ?? 0.20,
				metadata.ambient ?? 0.035,
				metadata.mieG ?? 0.80,
				1,
			);
		}
	};

	rescan();
	update();

	return {
		outputNode,
		update,
		getActiveCount: () => activeCount,
	};
}
