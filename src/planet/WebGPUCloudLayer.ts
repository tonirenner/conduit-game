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
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

export type WebGPUCloudQuality = 'moving' | 'idle';

/**
 * Phase 4i.4:
 *
 * Multi-shell cloud tuning pass.
 *
 * 4i.3 proved the multi-shell approach, but coverage/opacity were too high
 * and the clouds looked like broad grey bands.
 *
 * This version:
 * - raises coverage thresholds
 * - lowers opacity
 * - lowers core alpha
 * - makes upper wisps subtler
 * - keeps the multi-shell volume impression
 * - leaves more planet/ocean visible
 */
export class WebGPUCloudLayer {
	public readonly group: THREE.Group;
	public readonly mesh: THREE.Mesh;

	private readonly lowerShell: THREE.Mesh;
	private readonly mainShell: THREE.Mesh;
	private readonly upperShell: THREE.Mesh;

	private readonly lowerMaterial: any;
	private readonly mainMaterial: any;
	private readonly upperMaterial: any;

	constructor(radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'WebGPUCloudLayer';

		this.lowerMaterial = this.createMaterial({
			                                         name: 'WebGPUCloudLowerMaterial',
			                                         opacity: 0.20,
			                                         densityStrength: 0.18,
			                                         coreStrength: 0.035,
			                                         edgeStrength: 0.030,
			                                         shadowWeight: 0.78,
			                                         lightWeight: 0.48,
			                                         wispWeight: 0.025,
			                                         edgeLiftWeight: 0.030,
		                                         });

		this.mainMaterial = this.createMaterial({
			                                        name: 'WebGPUCloudMainMaterial',
			                                        opacity: 0.34,
			                                        densityStrength: 0.24,
			                                        coreStrength: 0.075,
			                                        edgeStrength: 0.060,
			                                        shadowWeight: 0.58,
			                                        lightWeight: 0.70,
			                                        wispWeight: 0.060,
			                                        edgeLiftWeight: 0.050,
		                                        });

		this.upperMaterial = this.createMaterial({
			                                         name: 'WebGPUCloudUpperMaterial',
			                                         opacity: 0.22,
			                                         densityStrength: 0.105,
			                                         coreStrength: 0.035,
			                                         edgeStrength: 0.080,
			                                         shadowWeight: 0.28,
			                                         lightWeight: 0.88,
			                                         wispWeight: 0.135,
			                                         edgeLiftWeight: 0.080,
		                                         });

		this.lowerShell = this.createShell(
			radius * 1.017,
			this.lowerMaterial,
			0.00,
			0,
		);

		this.mainShell = this.createShell(
			radius * 1.023,
			this.mainMaterial,
			0.37,
			1,
		);

		this.upperShell = this.createShell(
			radius * 1.031,
			this.upperMaterial,
			0.71,
			2,
		);

		this.mesh = this.mainShell;

		this.group.add(this.lowerShell);
		this.group.add(this.mainShell);
		this.group.add(this.upperShell);
	}

	update(deltaSeconds: number): void {
		this.lowerShell.rotation.y += deltaSeconds * 0.0020;
		this.mainShell.rotation.y += deltaSeconds * 0.0034;
		this.upperShell.rotation.y += deltaSeconds * 0.0048;

		this.lowerShell.rotation.x += deltaSeconds * 0.00020;
		this.upperShell.rotation.x -= deltaSeconds * 0.00030;
	}

	setRenderQuality(quality: WebGPUCloudQuality): void {
		if (quality === 'moving') {
			this.lowerMaterial.opacity = 0.15;
			this.mainMaterial.opacity = 0.25;
			this.upperMaterial.opacity = 0.16;
			return;
		}

		this.lowerMaterial.opacity = 0.20;
		this.mainMaterial.opacity = 0.34;
		this.upperMaterial.opacity = 0.22;
	}

	private createShell(
		radius: number,
		material: any,
		seedOffset: number,
		layerIndex: number,
	): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			radius,
			224,
			112,
		);

		this.addCloudAttributes(
			geometry,
			seedOffset,
			layerIndex,
		);

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name = `WebGPUCloudShell${layerIndex}`;
		mesh.renderOrder = 30 + layerIndex;
		mesh.frustumCulled = false;

		return mesh;
	}

	private createMaterial(options: {
		name: string;
		opacity: number;
		densityStrength: number;
		coreStrength: number;
		edgeStrength: number;
		shadowWeight: number;
		lightWeight: number;
		wispWeight: number;
		edgeLiftWeight: number;
	}): any {
		const material = new THREE.MeshBasicNodeMaterial({
			                                                 transparent: true,
			                                                 depthWrite: false,
			                                                 depthTest: true,
			                                                 side: THREE.FrontSide,
			                                                 blending: THREE.NormalBlending,
		                                                 });

		material.name = options.name;
		material.opacity = options.opacity;
		material.toneMapped = false;

		const cloudDensity = attribute('cloudDensity', 'float');
		const cloudDetail = attribute('cloudDetail', 'float');
		const cloudEdge = attribute('cloudEdge', 'float');
		const cloudLight = attribute('cloudLight', 'float');

		const sunDirection = uniform(
			SUN_DIRECTION.clone().normalize(),
		);

		const cloudShadowColor = color(0x5b666d);
		const cloudMidColor = color(0xc1cbc8);
		const cloudTopColor = color(0xf0f2ec);
		const warmCloudColor = color(0xffead0);
		const twilightCloudColor = color(0x8fb8da);

		const worldNormal = normalize(normalWorld);
		const viewDirection = normalize(
			cameraPosition.sub(positionWorld),
		);

		const ndl = dot(worldNormal, sunDirection);

		const day = smoothstep(
			-0.30,
			0.72,
			ndl,
		);

		const twilight = smoothstep(
			-0.78,
			0.18,
			ndl,
		).mul(
			oneMinus(
				smoothstep(
					0.06,
					0.70,
					ndl,
				),
			),
		);

		const viewFacing = max(
			dot(worldNormal, viewDirection),
			0.0,
		);

		const grazingView = oneMinus(viewFacing);

		const edgeLift = pow(
			grazingView,
			1.45,
		);

		const directLight = pow(
			max(ndl, 0.0),
			0.52,
		);

		const warmLight = smoothstep(
			0.02,
			0.58,
			ndl,
		).mul(
			oneMinus(
				smoothstep(
					0.55,
					0.96,
					ndl,
				),
			),
		);

		const cloudCore = smoothstep(
			0.44,
			0.94,
			cloudDensity,
		);

		const softEdge = cloudEdge.mul(
			oneMinus(cloudCore).mul(0.60).add(0.40),
		);

		const wisp = cloudDetail.mul(softEdge);

		const volumeLight = cloudLight
			.mul(options.lightWeight)
			.add(directLight.mul(0.36))
			.add(edgeLift.mul(options.edgeLiftWeight));

		let cloudColor = mix(
			cloudShadowColor,
			cloudMidColor,
			cloudLight.mul(options.lightWeight).add(0.08),
		);

		cloudColor = mix(
			cloudColor,
			cloudTopColor,
			cloudCore.mul(volumeLight).mul(0.72),
		);

		cloudColor = mix(
			cloudColor,
			cloudTopColor,
			wisp.mul(options.wispWeight),
		);

		cloudColor = mix(
			cloudColor,
			warmCloudColor,
			warmLight.mul(0.14).mul(day),
		).add(
			twilightCloudColor.mul(twilight).mul(0.08),
		);

		const alpha = cloudDensity
			.mul(options.densityStrength)
			.add(cloudCore.mul(options.coreStrength))
			.add(softEdge.mul(options.edgeStrength))
			.mul(
				day.mul(0.70)
					.add(twilight.mul(0.18))
					.add(edgeLift.mul(0.065))
					.add(0.055),
			);

		material.colorNode = cloudColor;
		material.opacityNode = alpha;

		return material;
	}

	private addCloudAttributes(
		geometry: THREE.SphereGeometry,
		seedOffset: number,
		layerIndex: number,
	): void {
		const positionAttribute = geometry.getAttribute('position');

		const cloudDensity: number[] = [];
		const cloudDetail: number[] = [];
		const cloudEdge: number[] = [];
		const cloudLight: number[] = [];

		for (let i = 0; i < positionAttribute.count; i++) {
			const normal = new THREE.Vector3(
				positionAttribute.getX(i),
				positionAttribute.getY(i),
				positionAttribute.getZ(i),
			).normalize();

			const sample = this.getCloudSample(
				normal,
				seedOffset,
				layerIndex,
			);

			cloudDensity.push(sample.density);
			cloudDetail.push(sample.detail);
			cloudEdge.push(sample.edge);
			cloudLight.push(sample.light);
		}

		geometry.setAttribute(
			'cloudDensity',
			new THREE.Float32BufferAttribute(cloudDensity, 1),
		);

		geometry.setAttribute(
			'cloudDetail',
			new THREE.Float32BufferAttribute(cloudDetail, 1),
		);

		geometry.setAttribute(
			'cloudEdge',
			new THREE.Float32BufferAttribute(cloudEdge, 1),
		);

		geometry.setAttribute(
			'cloudLight',
			new THREE.Float32BufferAttribute(cloudLight, 1),
		);
	}

	private getCloudSample(
		normal: THREE.Vector3,
		seedOffset: number,
		layerIndex: number,
	): {
		density: number;
		detail: number;
		edge: number;
		light: number;
	} {
		const seed = new THREE.Vector3(
			2.4 + seedOffset * 13.1,
			5.1 + seedOffset * 7.7,
			1.7 + seedOffset * 17.3,
		);

		const scaleModifier =
			      layerIndex === 0
			      ? 0.86
			      : layerIndex === 1
			        ? 1.00
			        : 1.30;

		const large = this.fbm(
			normal
				.clone()
				.multiplyScalar(1.08 * scaleModifier)
				.add(seed),
			6,
		);

		const medium = this.fbm(
			normal
				.clone()
				.multiplyScalar(3.20 * scaleModifier)
				.add(seed.clone().multiplyScalar(1.7)),
			5,
		);

		const detail = this.fbm(
			normal
				.clone()
				.multiplyScalar(9.40 * scaleModifier)
				.add(seed.clone().multiplyScalar(2.3)),
			4,
		);

		const fine = this.fbm(
			normal
				.clone()
				.multiplyScalar(21.0 * scaleModifier)
				.add(seed.clone().multiplyScalar(3.1)),
			3,
		);

		const latitudeBands =
			      Math.sin(normal.y * 7.0 + large * 4.2 + seedOffset) * 0.045 +
			      Math.sin(normal.y * 13.0 + medium * 2.4) * 0.030;

		const swirl =
			      Math.sin((normal.x + normal.z) * 5.4 + medium * 4.0 + seedOffset) * 0.038;

		const field =
			      large * 0.53 +
			      medium * 0.30 +
			      detail * 0.13 +
			      fine * 0.04 +
			      latitudeBands +
			      swirl;

		const threshold =
			      layerIndex === 0
			      ? 0.52
			      : layerIndex === 1
			        ? 0.56
			        : 0.64;

		const broadCoverage = THREE.MathUtils.smoothstep(
			field,
			threshold,
			threshold + 0.24,
		);

		const breakup = THREE.MathUtils.smoothstep(
			medium * 0.72 + detail * 0.28,
			0.40,
			0.78,
		);

		const wisps = THREE.MathUtils.smoothstep(
			detail * 0.70 + fine * 0.30,
			0.50,
			0.86,
		);

		const polarFade = 1.0 - THREE.MathUtils.smoothstep(
			Math.abs(normal.y),
			0.82,
			0.99,
		) * 0.32;

		const layerDensity =
			      layerIndex === 0
			      ? 0.50
			      : layerIndex === 1
			        ? 0.78
			        : 0.34;

		const density = THREE.MathUtils.clamp(
			broadCoverage *
			(0.46 + breakup * 0.38 + wisps * 0.16) *
			polarFade *
			layerDensity,
			0.0,
			1.0,
		);

		const edge = THREE.MathUtils.clamp(
			THREE.MathUtils.smoothstep(density, 0.04, 0.40) *
			(1.0 - THREE.MathUtils.smoothstep(density, 0.62, 0.94)),
			0.0,
			1.0,
		);

		const light = THREE.MathUtils.clamp(
			0.46 +
			breakup * 0.25 +
			wisps * 0.18 -
			broadCoverage * 0.08 +
			fine * 0.10 +
			(layerIndex === 2 ? 0.08 : 0.0),
			0.0,
			1.0,
		);

		return {
			density,
			detail: THREE.MathUtils.clamp(detail, 0.0, 1.0),
			edge,
			light,
		};
	}

	private fbm(
		point: THREE.Vector3,
		octaves: number,
	): number {
		let value = 0;
		let amplitude = 0.5;
		let frequency = 1.0;
		let normalizer = 0;

		for (let i = 0; i < octaves; i++) {
			value += this.valueNoise3D(
			         point.x * frequency,
			         point.y * frequency,
			         point.z * frequency,
			) * amplitude;

			normalizer += amplitude;
			amplitude *= 0.5;
			frequency *= 2.03;
		}

		return value / normalizer;
	}

	private valueNoise3D(
		x: number,
		y: number,
		z: number,
	): number {
		const ix = Math.floor(x);
		const iy = Math.floor(y);
		const iz = Math.floor(z);

		const fx = this.smooth(x - ix);
		const fy = this.smooth(y - iy);
		const fz = this.smooth(z - iz);

		const v000 = this.hash3(ix, iy, iz);
		const v100 = this.hash3(ix + 1, iy, iz);
		const v010 = this.hash3(ix, iy + 1, iz);
		const v110 = this.hash3(ix + 1, iy + 1, iz);

		const v001 = this.hash3(ix, iy, iz + 1);
		const v101 = this.hash3(ix + 1, iy, iz + 1);
		const v011 = this.hash3(ix, iy + 1, iz + 1);
		const v111 = this.hash3(ix + 1, iy + 1, iz + 1);

		const x00 = THREE.MathUtils.lerp(v000, v100, fx);
		const x10 = THREE.MathUtils.lerp(v010, v110, fx);
		const x01 = THREE.MathUtils.lerp(v001, v101, fx);
		const x11 = THREE.MathUtils.lerp(v011, v111, fx);

		const y0 = THREE.MathUtils.lerp(x00, x10, fy);
		const y1 = THREE.MathUtils.lerp(x01, x11, fy);

		return THREE.MathUtils.lerp(y0, y1, fz);
	}

	private smooth(value: number): number {
		return value * value * (3.0 - 2.0 * value);
	}

	private hash3(
		x: number,
		y: number,
		z: number,
	): number {
		const value = Math.sin(
			x * 127.1 +
			y * 311.7 +
			z * 74.7,
		) * 43758.5453123;

		return value - Math.floor(value);
	}
}
