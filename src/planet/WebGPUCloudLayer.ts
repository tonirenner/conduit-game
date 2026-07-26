import * as THREE from 'three/webgpu';

import {
	cameraPosition,
	positionWorld,
	uniform,
	wgslFn,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

export type WebGPUCloudQuality = 'moving' | 'idle';

/**
 * Phase 4j.1d:
 *
 * WebGPU Cloud Raymarch Prototype, brighter cloud tops.
 *
 * This replaces the multi-shell approximation with a real raymarch through
 * an inner/outer cloud shell, closer to the existing WebGL CloudLayer.
 *
 * Prototype choices:
 * - 8 samples instead of WebGL's 16
 * - simpler density than WebGL climate/weather model
 * - WGSL function via TSL wgslFn
 * - no texture dependency
 * - no separate compute pass yet
 */
export class WebGPUCloudLayer {
	public readonly group: THREE.Group;
	public readonly mesh: THREE.Mesh;

	private readonly material: any;

	constructor(radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'WebGPUCloudRaymarchLayer';

		const innerRadius = radius * 1.018;
		const outerRadius = radius * 1.064;

		const geometry = new THREE.SphereGeometry(
			outerRadius,
			128,
			96,
		);

		this.material = this.createMaterial(
			radius,
			innerRadius,
			outerRadius,
		);

		this.mesh = new THREE.Mesh(
			geometry,
			this.material,
		);

		this.mesh.name = 'WebGPUCloudRaymarchShell';
		this.mesh.renderOrder = 30;
		this.mesh.frustumCulled = false;

		this.group.add(this.mesh);
	}

	update(deltaSeconds: number): void {
		/**
		 * Cheap weather drift for now.
		 * Later we can pass real time into the WGSL function.
		 */
		this.mesh.rotation.y += deltaSeconds * 0.0032;
		this.mesh.rotation.x += deltaSeconds * 0.00025;
	}

	setRenderQuality(quality: WebGPUCloudQuality): void {
		if (quality === 'moving') {
			this.material.opacity = 0.52;
			return;
		}

		this.material.opacity = 0.70;
	}

	private createMaterial(
		planetRadiusValue: number,
		innerRadiusValue: number,
		outerRadiusValue: number,
	): any {
		const material = new THREE.MeshBasicNodeMaterial({
			                                                 transparent: true,
			                                                 depthWrite: false,
			                                                 depthTest: true,
			                                                 side: THREE.FrontSide,
			                                                 blending: THREE.NormalBlending,
		                                                 });

		material.name = 'WebGPUCloudRaymarchNodeMaterial';
		material.opacity = 0.70;
		material.toneMapped = false;

		const sunDirection = uniform(
			SUN_DIRECTION.clone().normalize(),
		);

		const planetRadius = uniform(planetRadiusValue);
		const innerRadius = uniform(innerRadiusValue);
		const outerRadius = uniform(outerRadiusValue);

		const cloudRaymarch = wgslFn(`
fn cloud_raymarch(
	surfacePosition: vec3<f32>,
	camPos: vec3<f32>,
	sunDir: vec3<f32>,
	planetRadius: f32,
	innerRadius: f32,
	outerRadius: f32
) -> vec4<f32> {
	let rayOrigin = camPos;
	let rayDirection = normalize(surfacePosition - camPos);

	var tNear = cloud_sphere_near(
		rayOrigin,
		rayDirection,
		outerRadius
	);

	var tFar = cloud_sphere_far(
		rayOrigin,
		rayDirection,
		outerRadius
	);

	if (tNear < 0.0 || tFar < 0.0) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	tNear = max(tNear, 0.0);

	let tPlanet = cloud_sphere_near(
		rayOrigin,
		rayDirection,
		planetRadius
	);

	if (tPlanet > 0.0) {
		tFar = min(tFar, tPlanet);
	}

	if (tFar <= tNear) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	let steps = 8.0;
	let thickness = tFar - tNear;
	let stepSize = thickness / steps;

	var alpha = 0.0;
	var cloudColorAccum = vec3<f32>(0.0, 0.0, 0.0);

	for (var i = 0; i < 8; i = i + 1) {
		let t = tNear + stepSize * (f32(i) + 0.5);
		let p = rayOrigin + rayDirection * t;
		let r = length(p);

		if (r < innerRadius || r > outerRadius) {
			continue;
		}

		let d = cloud_density(
			p,
			innerRadius,
			outerRadius
		) * 1.46;

		if (d <= 0.012) {
			continue;
		}

		let n = normalize(p);
		let sunDot = dot(n, normalize(sunDir));

		let dayLight = smoothstep(-0.22, 0.70, sunDot);
		let directLight = pow(max(sunDot, 0.0), 0.54);

		let viewFacing = clamp(dot(n, -rayDirection), 0.0, 1.0);
		let limbFade = smoothstep(0.012, 0.22, viewFacing);

		let shadowColor = vec3<f32>(0.68, 0.71, 0.74);
		let midColor = vec3<f32>(1.0, 1.0, 0.990);
		let sunColor = vec3<f32>(1.0, 0.998, 0.940);

		var sampleColor = mix(
			shadowColor,
			midColor,
			dayLight
		);

		sampleColor = mix(
			sampleColor,
			sunColor,
			directLight * 1.22
		);

		let forwardLight =
			smoothstep(0.28, 0.98, dot(-rayDirection, normalize(sunDir)));

		sampleColor = sampleColor +
			vec3<f32>(1.0, 0.84, 0.60) *
			forwardLight *
			dayLight *
			0.155;

		let silverLining =
			pow(1.0 - viewFacing, 2.4) *
			dayLight *
			smoothstep(-0.08, 0.72, sunDot);

		sampleColor = sampleColor +
			vec3<f32>(0.82, 0.94, 1.0) *
			silverLining *
			0.090;

		sampleColor = sampleColor * 1.34;

		var sampleAlpha =
			1.0 - exp(-d * stepSize * 1.02);

		sampleAlpha = sampleAlpha * mix(0.36, 1.0, dayLight);
		sampleAlpha = sampleAlpha * mix(0.62, 1.0, limbFade);
		sampleAlpha = sampleAlpha * (1.0 - alpha);

		cloudColorAccum = cloudColorAccum + sampleColor * sampleAlpha;
		alpha = alpha + sampleAlpha;

		if (alpha > 0.92) {
			break;
		}
	}

	let frontPoint = rayOrigin + rayDirection * tNear;
	let frontNormal = normalize(frontPoint);

	let limb = abs(dot(frontNormal, -rayDirection));
	let finalLimbFade = smoothstep(0.010, 0.145, limb);

	alpha = alpha * mix(0.55, 1.0, finalLimbFade);
	cloudColorAccum = cloudColorAccum * mix(0.84, 1.0, finalLimbFade);

	alpha = clamp(alpha * 0.66, 0.0, 0.64);

	if (alpha < 0.018) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	return vec4<f32>(
		cloudColorAccum,
		alpha
	);
}

fn cloud_hash3(p_input: vec3<f32>) -> f32 {
	var p = fract(p_input * 0.3183099 + vec3<f32>(0.1, 0.2, 0.3));
	p = p * 17.0;

	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

fn cloud_noise(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);

	f = f * f * (3.0 - 2.0 * f);

	let n000 = cloud_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let n100 = cloud_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let n010 = cloud_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let n110 = cloud_hash3(i + vec3<f32>(1.0, 1.0, 0.0));

	let n001 = cloud_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let n101 = cloud_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let n011 = cloud_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let n111 = cloud_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let nx00 = mix(n000, n100, f.x);
	let nx10 = mix(n010, n110, f.x);
	let nx01 = mix(n001, n101, f.x);
	let nx11 = mix(n011, n111, f.x);

	let nxy0 = mix(nx00, nx10, f.y);
	let nxy1 = mix(nx01, nx11, f.y);

	return mix(nxy0, nxy1, f.z);
}

fn cloud_fbm(p_input: vec3<f32>) -> f32 {
	var p = p_input;
	var value = 0.0;
	var amplitude = 0.5;
	var normalizer = 0.0;

	for (var i = 0; i < 4; i = i + 1) {
		value = value + cloud_noise(p) * amplitude;
		normalizer = normalizer + amplitude;

		p = p * 2.03;
		amplitude = amplitude * 0.5;
	}

	return value / normalizer;
}

fn cloud_fbm_low(p_input: vec3<f32>) -> f32 {
	var p = p_input;
	var value = 0.0;
	var amplitude = 0.5;
	var normalizer = 0.0;

	for (var i = 0; i < 3; i = i + 1) {
		value = value + cloud_noise(p) * amplitude;
		normalizer = normalizer + amplitude;

		p = p * 2.03;
		amplitude = amplitude * 0.5;
	}

	return value / normalizer;
}

fn cloud_sphere_near(
	rayOrigin: vec3<f32>,
	rayDirection: vec3<f32>,
	radius: f32
) -> f32 {
	let b = dot(rayOrigin, rayDirection);
	let c = dot(rayOrigin, rayOrigin) - radius * radius;
	let h = b * b - c;

	if (h < 0.0) {
		return -1.0;
	}

	return -b - sqrt(h);
}

fn cloud_sphere_far(
	rayOrigin: vec3<f32>,
	rayDirection: vec3<f32>,
	radius: f32
) -> f32 {
	let b = dot(rayOrigin, rayDirection);
	let c = dot(rayOrigin, rayOrigin) - radius * radius;
	let h = b * b - c;

	if (h < 0.0) {
		return -1.0;
	}

	return -b + sqrt(h);
}

fn cloud_density(
	position: vec3<f32>,
	innerRadius: f32,
	outerRadius: f32
) -> f32 {
	let radius = length(position);
	let shell =
		smoothstep(innerRadius, innerRadius + 0.020, radius) *
		(1.0 - smoothstep(outerRadius - 0.026, outerRadius, radius));

	let normal = normalize(position);

	let latitude = asin(clamp(normal.y, -1.0, 1.0));

	let large = cloud_fbm(normal * 1.45 + vec3<f32>(2.4, 5.1, 1.7));
	let medium = cloud_fbm(normal * 4.40 + vec3<f32>(7.3, 1.9, 4.6));
	let detail = cloud_fbm_low(normal * 7.20 + vec3<f32>(17.0, 3.0, 11.0));

	let bandNoise = cloud_fbm_low(normal * 2.0 + vec3<f32>(1.5, 8.0, 2.0)) - 0.5;

	var bands =
		0.5 +
		0.5 *
		sin(
			latitude * 8.4 +
			bandNoise * 5.2
		);

	bands = smoothstep(0.38, 0.92, bands);

	let streaks =
		pow(
			clamp(
				1.0 - abs(detail - 0.5) * 2.0,
				0.0,
				1.0
			),
			1.35
		);

	var d =
		large * 0.32 +
		medium * 0.36 +
		bands * 0.13 +
		streaks * 0.19;

	d = smoothstep(0.555, 0.745, d);
	d = pow(d, 1.46);

	return d * shell;
}


		`);

		const cloudResult = cloudRaymarch({
			                                  surfacePosition: positionWorld,
			                                  camPos: cameraPosition,
			                                  sunDir: sunDirection,
			                                  planetRadius,
			                                  innerRadius,
			                                  outerRadius,
		                                  });

		material.colorNode = cloudResult.rgb;
		material.opacityNode = cloudResult.a;

		return material;
	}
}
