import * as THREE from 'three/webgpu';

import {
	cameraPosition,
	positionWorld,
	uniform,
	wgslFn,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

export type WebGPUAtmosphereQuality = 'moving' | 'idle';

/**
 * Phase 5e.2:
 *
 * Raymarched WebGPU atmosphere.
 *
 * Important TSL parser rule:
 * The entry function must be the first WGSL function in the wgslFn string.
 * Helper functions are placed after atmosphere_raymarch().
 */
export class WebGPUAtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: any;

	private readonly sunIntensity: any;
	private readonly atmosphereAlpha: any;
	private readonly scatteringBoost: any;
	private readonly atmosphereStepCount: any;

	private currentRenderQuality: WebGPUAtmosphereQuality = 'idle';

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.038;

		const geometry = new THREE.SphereGeometry(
			atmosphereRadius,
			160,
			160,
		);

		this.sunIntensity = uniform(46.0);
		this.atmosphereAlpha = uniform(0.86);
		this.scatteringBoost = uniform(1.0);
		this.atmosphereStepCount = uniform(12.0);

		this.material = this.createMaterial(
			radius,
			atmosphereRadius,
		);

		this.mesh = new THREE.Mesh(
			geometry,
			this.material,
		);

		this.mesh.name = 'WebGPUAtmosphereRaymarchLayer';
		this.mesh.renderOrder = 20;
		this.mesh.frustumCulled = false;
	}

	update(): void {
		// Static for now.
	}

	setRenderQuality(quality: WebGPUAtmosphereQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.sunIntensity.value = 34.0;
			this.atmosphereAlpha.value = 0.62;
			this.scatteringBoost.value = 0.78;
			this.atmosphereStepCount.value = 6.0;
			this.material.opacity = 0.42;
			return;
		}

		this.sunIntensity.value = 46.0;
		this.atmosphereAlpha.value = 0.86;
		this.scatteringBoost.value = 1.0;
		this.atmosphereStepCount.value = 12.0;
		this.material.opacity = 0.58;
	}

	setRaymarchSteps(steps: number): void {
		this.atmosphereStepCount.value = THREE.MathUtils.clamp(
			steps,
			1,
			12,
		);
	}

	getRaymarchSteps(): number {
		return this.atmosphereStepCount.value;
	}

	private createMaterial(
		planetRadiusValue: number,
		atmosphereRadiusValue: number,
	): any {
		const material = new THREE.MeshBasicNodeMaterial({
			                                                 transparent: true,
			                                                 depthWrite: false,
			                                                 depthTest: true,
			                                                 side: THREE.FrontSide,
			                                                 blending: THREE.AdditiveBlending,
		                                                 });

		material.name = 'WebGPUAtmosphereRaymarchNodeMaterial';
		material.opacity = 0.58;
		material.toneMapped = false;

		const sunDirection = uniform(
			SUN_DIRECTION.clone().normalize(),
		);

		const planetRadius = uniform(planetRadiusValue);
		const atmosphereRadius = uniform(atmosphereRadiusValue);
		const rayleighStrength = uniform(1.36);
		const mieStrength = uniform(0.62);
		const mieG = uniform(0.82);

		const atmosphereRaymarch = wgslFn(`
fn atmosphere_raymarch(
	surfacePosition: vec3<f32>,
	camPos: vec3<f32>,
	sunDirInput: vec3<f32>,
	planetRadius: f32,
	atmosphereRadius: f32,
	sunIntensity: f32,
	rayleighStrength: f32,
	mieStrength: f32,
	mieG: f32,
	atmosphereAlpha: f32,
	scatteringBoost: f32,
	atmosphereStepCount: f32
) -> vec4<f32> {
	let rayOrigin = camPos;
	let rayDirection = normalize(surfacePosition - camPos);
	let sunDirection = normalize(sunDirInput);

	var tNear = atmosphere_sphere_near(
		rayOrigin,
		rayDirection,
		atmosphereRadius
	);

	var tFar = atmosphere_sphere_far(
		rayOrigin,
		rayDirection,
		atmosphereRadius
	);

	if (tFar < 0.0) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	tNear = max(tNear, 0.0);

	let tPlanet = atmosphere_sphere_near(
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

	let rayLength = tFar - tNear;
	let steps = max(1.0, atmosphereStepCount);
	let stepLength = rayLength / steps;
	let atmosphereHeight = atmosphereRadius - planetRadius;

	var samplePoint =
		rayOrigin +
		rayDirection *
		(tNear + stepLength * 0.5);

	var viewDepth = vec2<f32>(0.0, 0.0);

	var rayleighSum = vec3<f32>(0.0, 0.0, 0.0);
	var mieSum = vec3<f32>(0.0, 0.0, 0.0);

	let betaRayleigh =
		vec3<f32>(5.602, 9.473, 19.643) *
		0.0029 *
		rayleighStrength *
		scatteringBoost;

	let betaMie =
		vec3<f32>(0.0034, 0.0034, 0.0034) *
		mieStrength *
		scatteringBoost;

	for (var i = 0; i < 12; i = i + 1) {
		if (f32(i) >= steps) {
			break;
		}

		let h01 = atmosphere_height01(
			samplePoint,
			planetRadius,
			atmosphereRadius
		);

		let localRayleigh = atmosphere_rayleigh_density(h01);
		let localMie = atmosphere_mie_density(h01);

		viewDepth.x = viewDepth.x +
			localRayleigh *
			stepLength /
			atmosphereHeight;

		viewDepth.y = viewDepth.y +
			localMie *
			stepLength /
			atmosphereHeight;

		let tSun = atmosphere_sphere_far(
			samplePoint,
			sunDirection,
			atmosphereRadius
		);

		let tSunPlanet = atmosphere_sphere_near(
			samplePoint,
			sunDirection,
			planetRadius
		);

		if (tSun > 0.0 && tSunPlanet < 0.0) {
			let sunDepth = atmosphere_optical_depth(
				samplePoint,
				sunDirection,
				tSun,
				planetRadius,
				atmosphereRadius
			);

			let extinction = exp(
				-(
					betaRayleigh *
					(viewDepth.x + sunDepth.x) *
					3.35 +

					betaMie *
					(viewDepth.y + sunDepth.y) *
					2.65
				)
			);

			rayleighSum = rayleighSum +
				extinction *
				localRayleigh *
				stepLength /
				atmosphereHeight;

			mieSum = mieSum +
				extinction *
				localMie *
				stepLength /
				atmosphereHeight;
		}

		samplePoint = samplePoint + rayDirection * stepLength;
	}

	let mu = dot(rayDirection, sunDirection);

	let phaseRayleigh = atmosphere_rayleigh_phase(mu);
	let phaseMie = atmosphere_hg_phase(mu, mieG);

	var color =
		sunIntensity *
		(
			rayleighSum *
			betaRayleigh *
			phaseRayleigh +

			mieSum *
			betaMie *
			phaseMie
		);

	let normal = normalize(surfacePosition);
	let viewDirection = normalize(camPos - surfacePosition);

	let viewDot = clamp(dot(normal, viewDirection), 0.0, 1.0);
	let limb = 1.0 - viewDot;

	let limbSoft = pow(limb, 2.05);
	let limbSharp = pow(limb, 4.4);
	let limbUltra = pow(limb, 11.0);

	let sunDot = dot(normal, sunDirection);

	let dayDisc = smoothstep(-0.24, 0.68, sunDot);

	let sunEdge =
		smoothstep(-0.10, 0.42, sunDot) *
		(1.0 - smoothstep(0.62, 0.96, sunDot));

	let forwardMie =
		smoothstep(
			0.22,
			0.98,
			dot(viewDirection, sunDirection)
		);

	let backLit =
		smoothstep(
			0.18,
			0.98,
			dot(-viewDirection, sunDirection)
		);

	let mieDisc =
		dayDisc *
		forwardMie *
		limbSharp;

	let horizonSunGlow =
		sunEdge *
		limbSoft *
		(0.55 + forwardMie * 0.75);

	let cinematicRim =
		limbSharp *
		dayDisc *
		(0.68 + forwardMie * 0.45);

	color = color +
		vec3<f32>(0.10, 0.82, 1.0) *
		cinematicRim *
		0.82 *
		scatteringBoost;

	color = color +
		vec3<f32>(0.04, 0.22, 1.0) *
		limbSoft *
		0.26 *
		dayDisc *
		scatteringBoost;

	let whiteHorizonLine =
		vec3<f32>(0.86, 0.98, 1.0) *
		limbUltra *
		0.64 *
		dayDisc *
		scatteringBoost;

	color = color + whiteHorizonLine;

	color = color +
		vec3<f32>(1.0, 0.62, 0.30) *
		horizonSunGlow *
		mieStrength *
		0.38 *
		scatteringBoost;

	color = color +
		vec3<f32>(1.0, 0.76, 0.46) *
		backLit *
		limbSharp *
		dayDisc *
		mieStrength *
		0.16 *
		scatteringBoost;

	color = color +
		vec3<f32>(1.0, 0.82, 0.56) *
		mieDisc *
		mieStrength *
		scatteringBoost *
		0.28;

	let luminance = dot(
		color,
		vec3<f32>(0.2126, 0.7152, 0.0722)
	);

	let outerFade =
		smoothstep(0.00, 0.20, viewDot);

	let nightFade =
		smoothstep(-0.35, 0.22, sunDot);

	var alpha =
		luminance *
		atmosphereAlpha *
		0.92 +

		limbSharp *
		0.30 *
		dayDisc *
		scatteringBoost +

		whiteHorizonLine.r *
		0.25 +

		horizonSunGlow *
		0.080 +

		mieDisc *
		0.060;

	alpha = alpha * outerFade;
	alpha = alpha * mix(0.22, 1.0, nightFade);

	alpha = clamp(alpha, 0.0, 0.62);

	if (alpha < 0.003) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	return vec4<f32>(
		color,
		alpha
	);
}

fn atmosphere_sphere_near(
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

fn atmosphere_sphere_far(
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

fn atmosphere_rayleigh_phase(mu: f32) -> f32 {
	return 3.0 / (16.0 * 3.141592653589793) * (1.0 + mu * mu);
}

fn atmosphere_hg_phase(mu: f32, g: f32) -> f32 {
	let g2 = g * g;

	let denominator = pow(
		max(0.0001, 1.0 + g2 - 2.0 * g * mu),
		1.5
	);

	return (1.0 / (4.0 * 3.141592653589793)) *
		((1.0 - g2) / denominator);
}

fn atmosphere_height01(
	position: vec3<f32>,
	planetRadius: f32,
	atmosphereRadius: f32
) -> f32 {
	let height = length(position) - planetRadius;
	let atmosphereHeight = atmosphereRadius - planetRadius;

	return clamp(height / atmosphereHeight, 0.0, 1.0);
}

fn atmosphere_rayleigh_density(height01: f32) -> f32 {
	return exp(-height01 / 0.22);
}

fn atmosphere_mie_density(height01: f32) -> f32 {
	return exp(-height01 / 0.080);
}

fn atmosphere_optical_depth(
	rayOrigin: vec3<f32>,
	rayDirection: vec3<f32>,
	rayLength: f32,
	planetRadius: f32,
	atmosphereRadius: f32
) -> vec2<f32> {
	let stepLength = rayLength / 3.0;
	let atmosphereHeight = atmosphereRadius - planetRadius;

	var samplePoint =
		rayOrigin +
		rayDirection *
		stepLength *
		0.5;

	var depth = vec2<f32>(0.0, 0.0);

	for (var i = 0; i < 3; i = i + 1) {
		let h01 = atmosphere_height01(
			samplePoint,
			planetRadius,
			atmosphereRadius
		);

		depth.x = depth.x + atmosphere_rayleigh_density(h01);
		depth.y = depth.y + atmosphere_mie_density(h01);

		samplePoint = samplePoint + rayDirection * stepLength;
	}

	return depth * stepLength / atmosphereHeight;
}
		`);

		const atmosphereResult = atmosphereRaymarch({
			                                            surfacePosition: positionWorld,
			                                            camPos: cameraPosition,
			                                            sunDirInput: sunDirection,
			                                            planetRadius,
			                                            atmosphereRadius,
			                                            sunIntensity: this.sunIntensity,
			                                            rayleighStrength,
			                                            mieStrength,
			                                            mieG,
			                                            atmosphereAlpha: this.atmosphereAlpha,
			                                            scatteringBoost: this.scatteringBoost,
			                                            atmosphereStepCount: this.atmosphereStepCount,
		                                            });

		material.colorNode = atmosphereResult.rgb;
		material.opacityNode = atmosphereResult.a;

		return material;
	}
}
