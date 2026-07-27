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
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

export type WebGPUAtmosphereQuality = 'moving' | 'idle';

/**
 * Phase 5e.1:
 *
 * Raymarch feature-ready safe TSL atmosphere shell.
 *
 * The full WGSL raymarch path is not compatible with the current TSL parser
 * setup. This version stays pure TSL nodes and ports the WebGL atmosphere
 * values/look without custom WGSL helper functions.
 */
export class WebGPUAtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: any;
	private readonly atmosphereAlpha: any;
	private readonly scatteringBoost: any;
	private readonly atmosphereStepCount: any;

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.038;

		const geometry = new THREE.SphereGeometry(
			atmosphereRadius,
			160,
			160,
		);

		this.atmosphereAlpha = uniform(0.86);
		this.scatteringBoost = uniform(1.0);
		this.atmosphereStepCount = uniform(12.0);

		this.material = this.createMaterial();

		this.mesh = new THREE.Mesh(
			geometry,
			this.material,
		);

		this.mesh.name = 'WebGPUAtmosphereLayer';
		this.mesh.renderOrder = 20;
		this.mesh.frustumCulled = false;
	}

	update(): void {
		// Reserved for later animated atmosphere parameters.
	}

	setRenderQuality(quality: WebGPUAtmosphereQuality): void {
		if (quality === 'moving') {
			this.material.opacity = 0.40;
			this.atmosphereAlpha.value = 0.62;
			this.scatteringBoost.value = 0.78;
			this.atmosphereStepCount.value = 6.0;
			return;
		}

		this.material.opacity = 0.56;
		this.atmosphereAlpha.value = 0.86;
		this.scatteringBoost.value = 1.0;
		this.atmosphereStepCount.value = 12.0;
	}

	setRaymarchSteps(steps: number): void {
		this.atmosphereStepCount.value = THREE.MathUtils.clamp(
			steps,
			1,
			16,
		);
	}

	getRaymarchSteps(): number {
		return this.atmosphereStepCount.value;
	}

	private createMaterial(): any {
		const material = new THREE.MeshBasicNodeMaterial({
			                                                 transparent: true,
			                                                 depthWrite: false,
			                                                 depthTest: true,
			                                                 side: THREE.FrontSide,
			                                                 blending: THREE.AdditiveBlending,
		                                                 });

		material.name = 'WebGPUAtmosphereNodeMaterial';
		material.opacity = 0.56;
		material.toneMapped = false;

		const sunDirection = uniform(
			SUN_DIRECTION.clone().normalize(),
		);

		const cyanRimColor = color(0x1ad1ff);
		const deepBlueRimColor = color(0x0a38ff);
		const whiteHorizonColor = color(0xdcfaff);
		const warmHazeColor = color(0xff9e4d);
		const goldenBackScatterColor = color(0xffc275);
		const twilightColor = color(0x294f86);
		const nightEdgeColor = color(0x071426);

		const worldNormal = normalize(normalWorld);
		const viewDirection = normalize(
			cameraPosition.sub(positionWorld),
		);

		const ndl = dot(worldNormal, sunDirection);

		const viewDot = max(
			dot(worldNormal, viewDirection),
			0.0,
		);

		const limb = oneMinus(viewDot);

		const limbSoft = pow(
			limb,
			2.05,
		);

		const limbSharp = pow(
			limb,
			4.40,
		);

		const limbUltra = pow(
			limb,
			11.0,
		);

		const dayDisc = smoothstep(
			-0.24,
			0.68,
			ndl,
		);

		const sunEdge = smoothstep(
			-0.10,
			0.42,
			ndl,
		).mul(
			oneMinus(
				smoothstep(
					0.62,
					0.96,
					ndl,
				),
			),
		);

		const forwardMie = smoothstep(
			0.22,
			0.98,
			dot(viewDirection, sunDirection),
		);

		const backLit = smoothstep(
			0.18,
			0.98,
			dot(viewDirection.mul(-1.0), sunDirection),
		);

		const mieDisc = dayDisc
			.mul(forwardMie)
			.mul(limbSharp);

		const horizonSunGlow = sunEdge
			.mul(limbSoft)
			.mul(
				forwardMie.mul(0.75).add(0.55),
			);

		const cinematicRim = limbSharp
			.mul(dayDisc)
			.mul(
				forwardMie.mul(0.45).add(0.68),
			);

		const cyanRim = cinematicRim
			.mul(0.82)
			.mul(this.scatteringBoost);

		const deepBlueRim = limbSoft
			.mul(0.22)
			.mul(dayDisc)
			.mul(this.scatteringBoost);

		const whiteHorizonLine = limbUltra
			.mul(0.58)
			.mul(dayDisc)
			.mul(this.scatteringBoost);

		const warmSunHaze = horizonSunGlow
			.mul(0.34)
			.mul(this.scatteringBoost);

		const goldenBackScatter = backLit
			.mul(limbSharp)
			.mul(dayDisc)
			.mul(0.16)
			.mul(this.scatteringBoost);

		const twilight = smoothstep(
			-0.76,
			0.10,
			ndl,
		).mul(
			oneMinus(
				smoothstep(
					0.04,
					0.60,
					ndl,
				),
			),
		);

		const nightFade = smoothstep(
			-0.35,
			0.22,
			ndl,
		);

		const nightEdge = oneMinus(dayDisc)
			.mul(limbSharp)
			.mul(0.12);

		const atmosphereColor = cyanRimColor
			.mul(cyanRim)
			.add(
				deepBlueRimColor
					.mul(deepBlueRim),
			)
			.add(
				whiteHorizonColor
					.mul(whiteHorizonLine),
			)
			.add(
				warmHazeColor
					.mul(warmSunHaze),
			)
			.add(
				goldenBackScatterColor
					.mul(goldenBackScatter),
			)
			.add(
				warmHazeColor
					.mul(mieDisc)
					.mul(0.28),
			)
			.add(
				twilightColor
					.mul(twilight)
					.mul(limbSoft)
					.mul(0.18),
			)
			.add(
				nightEdgeColor
					.mul(nightEdge),
			);

		const outerFade = smoothstep(
			0.00,
			0.20,
			viewDot,
		);

		const alpha = limbSharp
			.mul(0.30)
			.mul(dayDisc)
			.mul(this.scatteringBoost)
			.add(
				whiteHorizonLine.mul(0.25),
			)
			.add(
				horizonSunGlow.mul(0.080),
			)
			.add(
				mieDisc.mul(0.060),
			)
			.add(
				limbSoft.mul(0.050).mul(dayDisc),
			)
			.add(
				nightEdge.mul(0.030),
			)
			.mul(outerFade)
			.mul(
				mix(
					float(0.22),
					float(1.0),
					nightFade,
				),
			)
			.mul(this.atmosphereAlpha);

		material.colorNode = atmosphereColor;
		material.opacityNode = alpha;

		return material;
	}
}
