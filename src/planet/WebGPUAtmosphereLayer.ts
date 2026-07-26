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
 * Phase 4h.1:
 *
 * Lightweight WebGPU/TSL atmosphere shell.
 *
 * This is not the full GLSL atmosphere port yet. It is a separate mesh layer
 * that gives the WebGPU path the missing planet-edge image language:
 * - blue atmospheric rim
 * - terminator glow
 * - subtle night-side edge
 * - low-sun warm haze
 */
export class WebGPUAtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: any;

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.032;

		const geometry = new THREE.SphereGeometry(
			atmosphereRadius,
			160,
			96,
		);

		this.material = this.createMaterial();

		this.mesh = new THREE.Mesh(
			geometry,
			this.material,
		);

		this.mesh.name = 'WebGPUAtmosphereLayer';
		this.mesh.renderOrder = 40;
		this.mesh.frustumCulled = false;
	}

	update(): void {
		// Reserved for later animated atmosphere parameters.
	}

	setRenderQuality(quality: WebGPUAtmosphereQuality): void {
		if (quality === 'moving') {
			this.material.opacity = 0.38;
			return;
		}

		this.material.opacity = 0.48;
	}

	private createMaterial(): any {
		const material = new THREE.MeshBasicNodeMaterial({
			                                                 transparent: true,
			                                                 depthWrite: false,
			                                                 depthTest: true,
			                                                 side: THREE.BackSide,
			                                                 blending: THREE.AdditiveBlending,
		                                                 });

		material.name = 'WebGPUAtmosphereNodeMaterial';
		material.opacity = 0.48;
		material.toneMapped = false;

		const sunDirection = uniform(
			SUN_DIRECTION.clone().normalize(),
		);

		const rimColor = color(0x83c8ff);
		const horizonColor = color(0xa9ddff);
		const twilightColor = color(0x315f9d);
		const warmHazeColor = color(0xffdfbd);
		const nightEdgeColor = color(0x12375f);

		const worldNormal = normalize(normalWorld);
		const viewDirection = normalize(
			cameraPosition.sub(positionWorld),
		);

		const ndl = dot(worldNormal, sunDirection);

		const viewFacing = max(
			dot(worldNormal, viewDirection),
			0.0,
		);

		const grazingView = oneMinus(viewFacing);

		const daySide = smoothstep(
			-0.20,
			0.62,
			ndl,
		);

		const rim = pow(
			grazingView,
			2.20,
		);

		const horizon = pow(
			grazingView,
			3.45,
		);

		const terminator = smoothstep(
			-0.72,
			0.12,
			ndl,
		).mul(
			oneMinus(
				smoothstep(
					0.08,
					0.70,
					ndl,
				),
			),
		);

		const lowSun = terminator.mul(horizon);

		const nightEdge = oneMinus(daySide)
			.mul(rim)
			.mul(0.34);

		const alpha = rim
			.mul(0.34)
			.add(
				horizon.mul(daySide).mul(0.62),
			)
			.add(
				terminator.mul(0.20),
			)
			.add(
				nightEdge.mul(0.22),
			);

		const atmosphereColor = rimColor
			.mul(rim)
			.mul(0.38)
			.add(
				horizonColor
					.mul(horizon)
					.mul(daySide)
					.mul(0.74),
			)
			.add(
				twilightColor
					.mul(terminator)
					.mul(0.42),
			)
			.add(
				warmHazeColor
					.mul(lowSun)
					.mul(0.24),
			)
			.add(
				nightEdgeColor
					.mul(nightEdge)
					.mul(0.32),
			);

		material.colorNode = atmosphereColor;
		material.opacityNode = alpha;

		return material;
	}
}
