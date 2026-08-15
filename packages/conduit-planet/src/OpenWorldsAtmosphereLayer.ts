import * as THREE from 'three/webgpu';

import {
	cameraPosition,
	positionWorld,
	uniform,
	wgslFn,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';
import { createAtmosphereLayerProfile } from './rendering/AtmosphereVisualProfile';

export type OpenWorldsAtmosphereQuality = 'moving' | 'idle';

/**
 * Physical WebGPU atmosphere inspired by the OpenWorlds scattering model.
 *
 * The existing Orbit -> Regional -> Surface architecture stays untouched.
 * This layer is a single reusable atmosphere representation around the planet
 * and is deliberately rendered from the sphere's back faces. That makes the
 * same raymarch valid both outside the atmosphere and after the camera enters
 * it, without swapping meshes or camera modes.
 *
 * The scattering model contains:
 * - Rayleigh scattering with wavelength-dependent coefficients
 * - Mie scattering with Cornette-Shanks style phase function
 * - altitude-dependent Rayleigh / Mie density
 * - a soft ozone-like absorption layer
 * - view-ray and sun-ray optical depth
 * - planet self-shadowing on the night side
 *
 * It is not a copy of OpenWorlds' GLSL post effect. The same physical ideas are
 * adapted to the existing Three.js WebGPU/TSL planet layer so the proven view
 * handoff and approach camera do not need to change.
 */
export class OpenWorldsAtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: any;
	private readonly sunIntensity: any;
	private readonly atmosphereAlpha: any;
	private readonly scatteringBoost: any;
	private readonly atmosphereStepCount: any;
	private readonly atmosphereTint: any;
	private readonly rayleighDensity: any;
	private readonly mieDensity: any;
	private readonly absorptionStrength: any;
	private readonly ambientStrength: any;
	private readonly mieG: any;
	private readonly sunDirection: any;
	private readonly planetWorldPosition: any;
	private readonly worldCenter = new THREE.Vector3();

	private profileSunIntensity = 38.0;
	private profileAtmosphereAlpha = 0.72;
	private profileScatteringBoost = 1.0;
	private profileOpacity = 0.58;
	private currentRenderQuality: OpenWorldsAtmosphereQuality = 'idle';

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.045;

		// The shader does the visual work. A dense 160x160 sphere only burns
		// vertex bandwidth here, so a modest shell is enough and stays smooth.
		const geometry = new THREE.SphereGeometry(atmosphereRadius, 96, 64);

		this.sunIntensity = uniform(38.0);
		this.atmosphereAlpha = uniform(0.72);
		this.scatteringBoost = uniform(1.0);
		this.atmosphereStepCount = uniform(10.0);
		this.atmosphereTint = uniform(new THREE.Color(0x8ec5ff));
		this.rayleighDensity = uniform(1.0);
		this.mieDensity = uniform(0.58);
		this.absorptionStrength = uniform(0.34);
		this.ambientStrength = uniform(0.028);
		this.mieG = uniform(0.82);
		this.sunDirection = uniform(SUN_DIRECTION.clone().normalize());
		this.planetWorldPosition = uniform(this.worldCenter.clone());

		this.material = this.createMaterial(radius, atmosphereRadius);
		this.mesh = new THREE.Mesh(geometry, this.material);
		this.mesh.name = 'WebGPUAtmospherePhysicalLayer';
		this.mesh.renderOrder = 30;
		this.mesh.frustumCulled = false;
	}

	update(): void {
		this.mesh.getWorldPosition(this.worldCenter);
		this.planetWorldPosition.value.copy(this.worldCenter);
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.sunDirection.value.copy(direction).normalize();
	}

	setAtmosphereProfile(
		density: number,
		haze: number,
		atmosphereColor = '#8ec5ff',
		atmospherePalette = '',
	): void {
		const profile = createAtmosphereLayerProfile(
			density,
			haze,
			atmosphereColor,
			atmospherePalette,
		);

		const density01 = THREE.MathUtils.clamp(density / 2.5, 0, 1);
		const haze01 = THREE.MathUtils.clamp(haze, 0, 1);
		const aerosol01 = Math.max(haze01, density01 * 0.34);

		this.atmosphereTint.value.set(profile.tint);
		this.rayleighDensity.value = THREE.MathUtils.lerp(0.52, 1.55, density01);
		this.mieDensity.value = THREE.MathUtils.lerp(0.12, 1.22, aerosol01);
		this.absorptionStrength.value = THREE.MathUtils.lerp(0.10, 0.48, density01);
		this.ambientStrength.value = THREE.MathUtils.lerp(0.012, 0.050, density01);
		this.mieG.value = THREE.MathUtils.lerp(0.76, 0.88, haze01);

		this.profileSunIntensity = profile.sunIntensity * 0.82;
		this.profileAtmosphereAlpha = profile.atmosphereAlpha;
		this.profileScatteringBoost = profile.scatteringBoost;
		this.profileOpacity = profile.opacity;

		this.applyQualityProfile();
	}

	setRenderQuality(quality: OpenWorldsAtmosphereQuality): void {
		if (quality === this.currentRenderQuality) return;
		this.currentRenderQuality = quality;
		this.applyQualityProfile();
	}

	setRaymarchSteps(steps: number): void {
		// Three light-ray samples are performed for each primary sample.
		// Twelve primary steps are already enough for a stable limb while keeping
		// the atmosphere affordable during a full-screen surface approach.
		this.atmosphereStepCount.value = THREE.MathUtils.clamp(steps, 1, 12);
	}

	getRaymarchSteps(): number {
		return this.atmosphereStepCount.value;
	}

	private applyQualityProfile(): void {
		this.sunIntensity.value = this.profileSunIntensity;
		this.atmosphereAlpha.value = this.profileAtmosphereAlpha;
		this.scatteringBoost.value = this.profileScatteringBoost;
		this.material.opacity = this.profileOpacity;

		if (this.currentRenderQuality === 'moving') {
			this.atmosphereStepCount.value = Math.min(this.atmosphereStepCount.value, 8.0);
		}
	}

	private createMaterial(
		planetRadiusValue: number,
		atmosphereRadiusValue: number,
	): any {
		const material = new THREE.MeshBasicNodeMaterial({
			transparent: true,
			depthWrite: false,
			// The atmosphere is a participating medium, not an opaque shell.
			// Disabling the depth test lets the integrated scattering haze the
			// regional/surface terrain after the camera enters the atmosphere.
			depthTest: false,
			// BackSide is intentional: from orbit it gives us the far shell exit,
			// while from inside the atmosphere it is also the visible exit surface.
			// The raymarch computes the actual near/far interval itself.
			side: THREE.BackSide,
			blending: THREE.AdditiveBlending,
		});

		material.name = 'WebGPUOpenWorldsAtmosphereNodeMaterial';
		material.opacity = 0.58;
		material.toneMapped = false;

		const planetRadius = uniform(planetRadiusValue);
		const atmosphereRadius = uniform(atmosphereRadiusValue);

		const atmosphereScattering = wgslFn(`
fn atmosphere_scattering(
	shellPosition: vec3<f32>,
	camPos: vec3<f32>,
	sunDirInput: vec3<f32>,
	planetWorldPosition: vec3<f32>,
	planetRadius: f32,
	atmosphereRadius: f32,
	sunIntensity: f32,
	atmosphereAlpha: f32,
	scatteringBoost: f32,
	atmosphereTint: vec3<f32>,
	rayleighDensity: f32,
	mieDensity: f32,
	absorptionStrength: f32,
	ambientStrength: f32,
	mieG: f32,
	atmosphereStepCount: f32
) -> vec4<f32> {
	let shellLocal = shellPosition - planetWorldPosition;
	let rayOrigin = camPos - planetWorldPosition;
	let rayDirection = normalize(shellLocal - rayOrigin);
	let sunDirection = normalize(sunDirInput);

	let atmosphereHit = atmosphere_intersections(
		rayOrigin,
		rayDirection,
		atmosphereRadius
	);

	if (atmosphereHit.y < 0.0) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	var rayStart = max(atmosphereHit.x, 0.0);
	var rayEnd = atmosphereHit.y;

	let planetHit = atmosphere_intersections(
		rayOrigin,
		rayDirection,
		planetRadius
	);

	// Looking towards the ground: stop integration at the planet surface.
	// Looking into the sky: integrate all the way to the atmosphere exit.
	if (planetHit.x > 0.0) {
		rayEnd = min(rayEnd, planetHit.x);
	}

	if (rayEnd <= rayStart) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	let atmosphereHeight = max(0.00001, atmosphereRadius - planetRadius);
	let steps = clamp(atmosphereStepCount, 1.0, 12.0);
	let stepLength = (rayEnd - rayStart) / steps;

	var samplePoint = rayOrigin + rayDirection * (rayStart + stepLength * 0.5);
	var viewDepth = vec3<f32>(0.0, 0.0, 0.0);
	var totalRayleigh = vec3<f32>(0.0, 0.0, 0.0);
	var totalMie = vec3<f32>(0.0, 0.0, 0.0);

	// OpenWorlds derives the coefficients from wavelength. These are the
	// pre-evaluated values for 680nm / 550nm / 450nm, avoiding pow() per pixel.
	let betaRayleigh =
		vec3<f32>(0.004296, 0.010038, 0.022399) *
		rayleighDensity *
		scatteringBoost;

	let betaMie =
		vec3<f32>(0.017682, 0.021132, 0.025011) *
		mieDensity *
		scatteringBoost;

	// Soft ozone-like absorption. It primarily changes the long atmospheric
	// path near the horizon and helps the sunset transition without a fake rim.
	let betaAbsorption =
		vec3<f32>(0.000650, 0.001880, 0.000085) *
		absorptionStrength;

	for (var i = 0; i < 12; i = i + 1) {
		if (f32(i) >= steps) {
			break;
		}

		let density = atmosphere_density(
			samplePoint,
			planetRadius,
			atmosphereRadius
		);

		let weightedDensity = vec3<f32>(
			density.x * rayleighDensity,
			density.y * mieDensity,
			density.z * absorptionStrength
		);

		viewDepth = viewDepth + weightedDensity * stepLength / atmosphereHeight;

		let sunPlanetHit = atmosphere_intersections(
			samplePoint,
			sunDirection,
			planetRadius
		);

		// A positive near hit means the planet blocks the sun from this sample.
		if (sunPlanetHit.x <= 0.0) {
			let sunAtmosphereHit = atmosphere_intersections(
				samplePoint,
				sunDirection,
				atmosphereRadius
			);

			if (sunAtmosphereHit.y > 0.0) {
				let lightDepth = atmosphere_light_depth(
					samplePoint,
					sunDirection,
					sunAtmosphereHit.y,
					planetRadius,
					atmosphereRadius,
					rayleighDensity,
					mieDensity,
					absorptionStrength
				);

				let attenuation = exp(
					-(
						betaRayleigh * (viewDepth.x + lightDepth.x) +
						betaMie * (viewDepth.y + lightDepth.y) +
						betaAbsorption * (viewDepth.z + lightDepth.z)
					)
				);

				totalRayleigh = totalRayleigh +
					attenuation *
					weightedDensity.x *
					stepLength / atmosphereHeight;

				totalMie = totalMie +
					attenuation *
					weightedDensity.y *
					stepLength / atmosphereHeight;
			}
		}

		samplePoint = samplePoint + rayDirection * stepLength;
	}

	let mu = dot(rayDirection, sunDirection);
	let phaseRayleigh = atmosphere_rayleigh_phase(mu);
	let phaseMie = atmosphere_mie_phase(mu, mieG);

	var scattered = sunIntensity * (
		phaseRayleigh * betaRayleigh * totalRayleigh +
		phaseMie * betaMie * totalMie
	);

	// A tiny density-driven ambient term keeps the anti-solar sky from becoming
	// an artificial hard black cut, while planet self-shadowing still dominates.
	scattered = scattered +
		atmosphereTint *
		viewDepth.x *
		ambientStrength;

	// Planet classes still own their atmosphere palette. Keep the physical
	// wavelength response, then gently bias it towards the generated profile.
	let tintAmount = clamp(0.18 + mieDensity * 0.10, 0.18, 0.38);
	scattered = scattered * mix(
		vec3<f32>(1.0, 1.0, 1.0),
		atmosphereTint,
		tintAmount
	);

	// OpenWorlds-style exponential exposure / tone mapping.
	let mappedColor = vec3<f32>(1.0, 1.0, 1.0) - exp(-max(scattered, vec3<f32>(0.0)));

	let transmittance = exp(
		-(
			betaRayleigh * viewDepth.x +
			betaMie * viewDepth.y +
			betaAbsorption * viewDepth.z
		)
	);

	let transmissionLuma = dot(
		transmittance,
		vec3<f32>(0.2126, 0.7152, 0.0722)
	);
	let scatterLuma = dot(
		mappedColor,
		vec3<f32>(0.2126, 0.7152, 0.0722)
	);

	var alpha =
		(1.0 - transmissionLuma) * atmosphereAlpha +
		scatterLuma * 0.10;

	alpha = clamp(alpha, 0.0, 0.88);

	if (alpha < 0.0015) {
		return vec4<f32>(0.0, 0.0, 0.0, 0.0);
	}

	return vec4<f32>(mappedColor, alpha);
}

fn atmosphere_intersections(
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

fn atmosphere_height01(
	position: vec3<f32>,
	planetRadius: f32,
	atmosphereRadius: f32
) -> f32 {
	let atmosphereHeight = max(0.00001, atmosphereRadius - planetRadius);
	return clamp((length(position) - planetRadius) / atmosphereHeight, 0.0, 1.0);
}

fn atmosphere_density(
	position: vec3<f32>,
	planetRadius: f32,
	atmosphereRadius: f32
) -> vec3<f32> {
	let h01 = atmosphere_height01(position, planetRadius, atmosphereRadius);
	let rayleigh = exp(-h01 / 0.22);
	let mie = exp(-h01 / 0.075);
	let absorptionDelta = (0.42 - h01) / 0.18;
	let absorption = (1.0 / (absorptionDelta * absorptionDelta + 1.0)) * rayleigh;
	return vec3<f32>(rayleigh, mie, absorption);
}

fn atmosphere_light_depth(
	rayOrigin: vec3<f32>,
	rayDirection: vec3<f32>,
	rayLength: f32,
	planetRadius: f32,
	atmosphereRadius: f32,
	rayleighDensity: f32,
	mieDensity: f32,
	absorptionStrength: f32
) -> vec3<f32> {
	let atmosphereHeight = max(0.00001, atmosphereRadius - planetRadius);
	let stepLength = rayLength / 3.0;
	var samplePoint = rayOrigin + rayDirection * stepLength * 0.5;
	var depth = vec3<f32>(0.0, 0.0, 0.0);

	for (var i = 0; i < 3; i = i + 1) {
		let density = atmosphere_density(samplePoint, planetRadius, atmosphereRadius);
		depth = depth + vec3<f32>(
			density.x * rayleighDensity,
			density.y * mieDensity,
			density.z * absorptionStrength
		);
		samplePoint = samplePoint + rayDirection * stepLength;
	}

	return depth * stepLength / atmosphereHeight;
}

fn atmosphere_rayleigh_phase(mu: f32) -> f32 {
	return 3.0 / (16.0 * 3.141592653589793) * (1.0 + mu * mu);
}

fn atmosphere_mie_phase(mu: f32, g: f32) -> f32 {
	let g2 = g * g;
	let denominator = pow(
		max(0.0001, 1.0 + g2 - 2.0 * g * mu),
		1.5
	);

	return 3.0 / (8.0 * 3.141592653589793) *
		((1.0 - g2) * (1.0 + mu * mu)) /
		((2.0 + g2) * denominator);
}
		`);

		const atmosphereResult = atmosphereScattering({
			shellPosition: positionWorld,
			camPos: cameraPosition,
			sunDirInput: this.sunDirection,
			planetWorldPosition: this.planetWorldPosition,
			planetRadius,
			atmosphereRadius,
			sunIntensity: this.sunIntensity,
			atmosphereAlpha: this.atmosphereAlpha,
			scatteringBoost: this.scatteringBoost,
			atmosphereTint: this.atmosphereTint,
			rayleighDensity: this.rayleighDensity,
			mieDensity: this.mieDensity,
			absorptionStrength: this.absorptionStrength,
			ambientStrength: this.ambientStrength,
			mieG: this.mieG,
			atmosphereStepCount: this.atmosphereStepCount,
		});

		material.colorNode = atmosphereResult.rgb;
		material.opacityNode = atmosphereResult.a;

		return material;
	}
}
