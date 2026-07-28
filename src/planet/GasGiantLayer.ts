import * as THREE from 'three';

export type GasGiantLayerKind = 'gas_giant' | 'ice_giant';

export type GasGiantLayerOptions = {
	kind: GasGiantLayerKind;
	radius: number;
	seed: number;
};

/**
 * Phase 7a.2b:
 *
 * Seeded procedural gas/ice giant renderer with turbulence.
 *
 * Still texture-based on purpose:
 * - low WebGPU parser risk
 * - fast iteration
 * - seeded and deterministic
 */
export class GasGiantLayer {
	public readonly group: THREE.Group;
	public readonly mesh: THREE.Mesh;

	private readonly atmosphereMesh: THREE.Mesh;
	private readonly bandTexture: THREE.CanvasTexture;
	private readonly rng: () => number;

	constructor(
		private readonly options: GasGiantLayerOptions,
	) {
		this.rng = createSeededRandom(
			options.seed ^
			(options.kind === 'ice_giant' ? 0x71ce : 0x9a5a),
		);

		this.group = new THREE.Group();
		this.group.name =
			options.kind === 'ice_giant'
			? 'IceGiantLayer'
			: 'GasGiantLayer';

		this.bandTexture = this.createBandTexture();
		this.mesh = this.createBody();
		this.atmosphereMesh = this.createAtmosphere();

		this.group.add(this.mesh);
		this.group.add(this.atmosphereMesh);
	}

	update(deltaSeconds: number): void {
		const rotationSpeed =
			      this.options.kind === 'ice_giant'
			      ? 0.00055
			      : 0.0009;

		this.group.rotation.y += deltaSeconds * rotationSpeed;

		this.bandTexture.offset.x =
			(this.bandTexture.offset.x +
			 deltaSeconds *
			 (
				 this.options.kind === 'ice_giant'
				 ? 0.000004
				 : 0.000009
			 )) % 1;
	}

	dispose(): void {
		this.bandTexture.dispose();

		this.group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) {
				return;
			}

			object.geometry.dispose();

			const material = object.material;

			if (Array.isArray(material)) {
				for (const item of material) {
					item.dispose();
				}

				return;
			}

			material.dispose();
		});
	}

	private createBody(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius,
			192,
			112,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                map: this.bandTexture,
			                                                color: 0xffffff,
			                                                roughness:
				                                                this.options.kind === 'ice_giant'
				                                                ? 0.64
				                                                : 0.78,
			                                                metalness: 0.0,
			                                                emissive:
				                                                this.options.kind === 'ice_giant'
				                                                ? new THREE.Color(0x071722)
				                                                : new THREE.Color(0x201008),
			                                                emissiveIntensity:
				                                                this.options.kind === 'ice_giant'
				                                                ? 0.26
				                                                : 0.2,
		                                                });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name =
			this.options.kind === 'ice_giant'
			? 'IceGiantBody'
			: 'GasGiantBody';

		mesh.renderOrder = 2;

		return mesh;
	}

	private createAtmosphere(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius * 1.035,
			128,
			80,
		);

		const material = new THREE.MeshBasicMaterial({
			                                             color:
				                                             this.options.kind === 'ice_giant'
				                                             ? 0x9fe7ff
				                                             : 0xffd6a0,
			                                             transparent: true,
			                                             opacity:
				                                             this.options.kind === 'ice_giant'
				                                             ? 0.12
				                                             : 0.1,
			                                             side: THREE.BackSide,
			                                             depthWrite: false,
			                                             blending: THREE.AdditiveBlending,
		                                             });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name =
			this.options.kind === 'ice_giant'
			? 'IceGiantAtmosphereShell'
			: 'GasGiantAtmosphereShell';

		mesh.renderOrder = 8;

		return mesh;
	}

	private createBandTexture(): THREE.CanvasTexture {
		const width = 2048;
		const height = 1024;

		const canvas = document.createElement('canvas');

		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Could not create gas giant texture context.');
		}

		const field = createTurbulenceField(
			width,
			height,
			this.options.seed,
			this.options.kind,
		);

		this.paintTurbulentBands(context, width, height, field);
		this.paintFineStripes(context, width, height, field);

		if (this.options.kind === 'gas_giant') {
			this.paintStorms(context, width, height, field);
			this.paintShearWisps(context, width, height, field);
		} else {
			this.paintIceHaze(context, width, height, field);
			this.paintSoftIceWisps(context, width, height, field);
		}

		const texture = new THREE.CanvasTexture(canvas);

		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.repeat.set(1, 1);
		texture.offset.set(0, 0);
		texture.needsUpdate = true;

		if ('colorSpace' in texture) {
			texture.colorSpace = THREE.SRGBColorSpace;
		}

		return texture;
	}

	private paintTurbulentBands(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		const image = context.createImageData(width, height);
		const data = image.data;

		const palette =
			      this.options.kind === 'ice_giant'
			      ? getIcePalette()
			      : getGasPalette();

		for (let y = 0; y < height; y++) {
			const v = y / height;
			const latitude = (v - 0.5) * 2;

			const bandFrequency =
				      this.options.kind === 'ice_giant'
				      ? 16.0
				      : 23.0;

			const largeWave =
				      Math.sin((v * bandFrequency + field.bandPhase) * Math.PI * 2);

			for (let x = 0; x < width; x++) {
				const u = x / width;
				const turbulence = field.sample(u, v);

				const shear =
					      Math.sin(
						      (u * Math.PI * 2 * (1.0 + Math.abs(latitude) * 2.5)) +
						      turbulence.swirl * 7.5 +
						      largeWave * 0.45,
					      );

				const bandValue =
					      0.5 +
					      0.28 * largeWave +
					      0.16 * turbulence.medium +
					      0.08 * turbulence.fine +
					      0.08 * shear;

				const paletteIndex = THREE.MathUtils.clamp(
					Math.floor(
						bandValue * (palette.length - 1),
					),
					0,
					palette.length - 1,
				);

				const nextIndex = Math.min(
					palette.length - 1,
					paletteIndex + 1,
				);

				const mixAmount =
					      THREE.MathUtils.clamp(
						      (bandValue * (palette.length - 1)) % 1,
						      0,
						      1,
					      );

				const color = palette[paletteIndex].clone().lerp(
					palette[nextIndex],
					mixAmount,
				);

				const shade =
					      1.0 +
					      0.11 * turbulence.medium +
					      0.055 * turbulence.fine;

				color.multiplyScalar(shade);

				const offset = (y * width + x) * 4;

				data[offset + 0] = THREE.MathUtils.clamp(color.r * 255, 0, 255);
				data[offset + 1] = THREE.MathUtils.clamp(color.g * 255, 0, 255);
				data[offset + 2] = THREE.MathUtils.clamp(color.b * 255, 0, 255);
				data[offset + 3] = 255;
			}
		}

		context.putImageData(image, 0, 0);
	}

	private paintFineStripes(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		const stripeCount =
			      this.options.kind === 'ice_giant'
			      ? 86
			      : 154;

		context.globalAlpha =
			this.options.kind === 'ice_giant'
			? 0.13
			: 0.17;

		for (let index = 0; index < stripeCount; index++) {
			const y = Math.floor(this.rng() * height);
			const stripeHeight =
				      1 +
				      Math.floor(
					      this.rng() *
					      (
						      this.options.kind === 'ice_giant'
						      ? 6
						      : 10
					      ),
				      );

			const phase = this.rng() * Math.PI * 2;
			const amplitude =
				      width *
				      (
					      this.options.kind === 'ice_giant'
					      ? 0.008
					      : 0.015
				      );

			context.beginPath();

			for (let x = 0; x <= width; x += 8) {
				const u = x / width;
				const v = y / height;
				const turbulence = field.sample(u, v);
				const dy =
					      Math.sin(u * Math.PI * 8 + phase) *
					      stripeHeight *
					      0.9;

				const px =
					      x +
					      Math.sin(u * Math.PI * 5 + turbulence.swirl * 3) *
					      amplitude;

				const py = y + dy;

				if (x === 0) {
					context.moveTo(px, py);
				} else {
					context.lineTo(px, py);
				}
			}

			context.strokeStyle =
				this.rng() > 0.5
				? '#ffffff'
				: '#000000';

			context.lineWidth = stripeHeight;
			context.stroke();
		}

		context.globalAlpha = 1;
	}

	private paintStorms(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		const stormCount =
			      2 +
			      Math.floor(this.rng() * 4);

		for (let index = 0; index < stormCount; index++) {
			const x = width * (0.12 + this.rng() * 0.76);
			const y = height * (0.28 + this.rng() * 0.44);
			const rx = width * (0.045 + this.rng() * 0.075);
			const ry = height * (0.018 + this.rng() * 0.042);

			this.paintSwirledStorm(
				context,
				field,
				x,
				y,
				rx,
				ry,
			);
		}
	}

	private paintSwirledStorm(
		context: CanvasRenderingContext2D,
		field: TurbulenceField,
		centerX: number,
		centerY: number,
		radiusX: number,
		radiusY: number,
	): void {
		const rings = 18;

		context.save();
		context.translate(centerX, centerY);
		context.rotate((this.rng() - 0.5) * 0.5);

		for (let ring = rings; ring >= 1; ring--) {
			const t = ring / rings;
			const rx = radiusX * t;
			const ry = radiusY * t;
			const alpha = 0.045 + (1 - t) * 0.11;
			const hue =
				      ring % 3 === 0
				      ? '255,238,205'
				      : ring % 3 === 1
				        ? '194,99,52'
				        : '88,48,36';

			context.beginPath();

			const segments = 96;

			for (let i = 0; i <= segments; i++) {
				const a = (i / segments) * Math.PI * 2;
				const swirl =
					      a +
					      (1 - t) * 2.7 +
					      Math.sin(a * 3 + field.bandPhase) * 0.18;

				const wobble =
					      1 +
					      0.12 * Math.sin(a * 5 + ring * 0.7) +
					      0.08 * Math.sin(a * 9 + this.rng() * 0.2);

				const x = Math.cos(swirl) * rx * wobble;
				const y = Math.sin(swirl) * ry * wobble;

				if (i === 0) {
					context.moveTo(x, y);
				} else {
					context.lineTo(x, y);
				}
			}

			context.fillStyle = `rgba(${hue},${alpha})`;
			context.fill();
		}

		const coreGradient = context.createRadialGradient(
			0,
			0,
			1,
			0,
			0,
			radiusX * 0.38,
		);

		coreGradient.addColorStop(0, 'rgba(255,236,204,0.72)');
		coreGradient.addColorStop(0.55, 'rgba(190,88,45,0.38)');
		coreGradient.addColorStop(1, 'rgba(80,40,28,0.0)');

		context.fillStyle = coreGradient;
		context.beginPath();
		context.ellipse(
			0,
			0,
			radiusX * 0.48,
			radiusY * 0.58,
			0,
			0,
			Math.PI * 2,
		);
		context.fill();

		context.restore();
	}

	private paintShearWisps(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		const wispCount = 42;

		context.globalAlpha = 0.18;

		for (let index = 0; index < wispCount; index++) {
			const y = height * (0.15 + this.rng() * 0.7);
			const length = width * (0.08 + this.rng() * 0.18);
			const x = width * this.rng();
			const phase = this.rng() * Math.PI * 2;

			const gradient = context.createLinearGradient(
				x,
				y,
				x + length,
				y,
			);

			gradient.addColorStop(0, 'rgba(255,255,255,0)');
			gradient.addColorStop(0.5, 'rgba(255,255,255,0.42)');
			gradient.addColorStop(1, 'rgba(255,255,255,0)');

			context.strokeStyle = gradient;
			context.lineWidth = 1 + this.rng() * 4;
			context.beginPath();

			for (let i = 0; i <= 32; i++) {
				const t = i / 32;
				const u = (x + length * t) / width;
				const v = y / height;
				const turbulence = field.sample(u, v);

				const px = x + length * t;
				const py =
					      y +
					      Math.sin(t * Math.PI * 2 + phase) * 7 +
					      turbulence.swirl * 16;

				if (i === 0) {
					context.moveTo(px, py);
				} else {
					context.lineTo(px, py);
				}
			}

			context.stroke();
		}

		context.globalAlpha = 1;
	}

	private paintIceHaze(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		const haze = context.createRadialGradient(
			width * 0.5,
			height * 0.5,
			height * 0.05,
			width * 0.5,
			height * 0.5,
			height * 0.65,
		);

		haze.addColorStop(0, 'rgba(255,255,255,0.12)');
		haze.addColorStop(0.55, 'rgba(120,210,255,0.08)');
		haze.addColorStop(1, 'rgba(0,0,0,0.0)');

		context.fillStyle = haze;
		context.fillRect(0, 0, width, height);
	}

	private paintSoftIceWisps(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		field: TurbulenceField,
	): void {
		context.globalAlpha = 0.16;
		context.strokeStyle = 'rgba(255,255,255,0.55)';

		for (let index = 0; index < 36; index++) {
			const y = height * (0.12 + this.rng() * 0.76);
			const length = width * (0.1 + this.rng() * 0.28);
			const x = width * this.rng();

			context.lineWidth = 1 + this.rng() * 5;
			context.beginPath();

			for (let i = 0; i <= 36; i++) {
				const t = i / 36;
				const u = (x + length * t) / width;
				const v = y / height;
				const turbulence = field.sample(u, v);

				const px = x + length * t;
				const py =
					      y +
					      turbulence.swirl * 20 +
					      Math.sin(t * Math.PI * 3) * 6;

				if (i === 0) {
					context.moveTo(px, py);
				} else {
					context.lineTo(px, py);
				}
			}

			context.stroke();
		}

		context.globalAlpha = 1;
	}
}

type TurbulenceSample = {
	medium: number;
	fine: number;
	swirl: number;
};

type TurbulenceField = {
	bandPhase: number;
	sample(u: number, v: number): TurbulenceSample;
};

function createTurbulenceField(
	width: number,
	height: number,
	seed: number,
	kind: GasGiantLayerKind,
): TurbulenceField {
	const rng = createSeededRandom(
		(seed ^ 0x7f4a7c15) >>> 0,
	);

	const bandPhase = rng() * 10;
	const offsetA = rng() * 1000;
	const offsetB = rng() * 1000;
	const offsetC = rng() * 1000;

	return {
		bandPhase,
		sample(u: number, v: number): TurbulenceSample {
			const latitude = (v - 0.5) * 2;
			const shearStrength =
				      kind === 'ice_giant'
				      ? 0.10
				      : 0.19;

			const shearedU =
				      u +
				      Math.sin(v * Math.PI * 8 + bandPhase) *
				      shearStrength +
				      latitude *
				      0.06;

			const medium =
				      fbm2(
					      shearedU * 7.0 + offsetA,
					      v * 24.0 + offsetB,
					      4,
				      ) * 2 - 1;

			const fine =
				      fbm2(
					      shearedU * 22.0 + offsetB,
					      v * 74.0 + offsetC,
					      3,
				      ) * 2 - 1;

			const swirl =
				      fbm2(
					      shearedU * 5.2 + medium * 0.35 + offsetC,
					      v * 18.0 + fine * 0.22 + offsetA,
					      4,
				      ) * 2 - 1;

			return {
				medium,
				fine,
				swirl,
			};
		},
	};
}

function getGasPalette(): THREE.Color[] {
	return [
		new THREE.Color(0x2d170f),
		new THREE.Color(0x5f3722),
		new THREE.Color(0x8e5d38),
		new THREE.Color(0xbd8450),
		new THREE.Color(0xe1b16f),
		new THREE.Color(0xf5d9a4),
		new THREE.Color(0xb65d37),
		new THREE.Color(0x4d2b20),
	];
}

function getIcePalette(): THREE.Color[] {
	return [
		new THREE.Color(0x092132),
		new THREE.Color(0x184c67),
		new THREE.Color(0x327fa3),
		new THREE.Color(0x62b0d2),
		new THREE.Color(0xa4dced),
		new THREE.Color(0xd8f6ff),
		new THREE.Color(0x5d96bd),
	];
}

function fbm2(x: number, y: number, octaves: number): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		value += valueNoise2(
		         x * frequency,
		         y * frequency,
		) * amplitude;

		normalizer += amplitude;
		amplitude *= 0.5;
		frequency *= 2.03;
	}

	return value / normalizer;
}

function valueNoise2(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);

	const fx = smoothstep(x - ix);
	const fy = smoothstep(y - iy);

	const a = hash2(ix, iy);
	const b = hash2(ix + 1, iy);
	const c = hash2(ix, iy + 1);
	const d = hash2(ix + 1, iy + 1);

	const ab = THREE.MathUtils.lerp(a, b, fx);
	const cd = THREE.MathUtils.lerp(c, d, fx);

	return THREE.MathUtils.lerp(ab, cd, fy);
}

function hash2(x: number, y: number): number {
	let n =
		    Math.imul(x, 374761393) ^
		    Math.imul(y, 668265263);

	n = (n ^ (n >>> 13)) >>> 0;
	n = Math.imul(n, 1274126177) >>> 0;

	return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
	return t * t * (3 - 2 * t);
}

function createSeededRandom(seed: number): () => number {
	let value = seed >>> 0;

	return () => {
		value += 0x6d2b79f5;

		let mixed = value;

		mixed = Math.imul(
			mixed ^ (mixed >>> 15),
			mixed | 1,
		);

		mixed ^= mixed + Math.imul(
			mixed ^ (mixed >>> 7),
			mixed | 61,
		);

		return (
			((mixed ^ (mixed >>> 14)) >>> 0) /
			4294967296
		);
	};
}
