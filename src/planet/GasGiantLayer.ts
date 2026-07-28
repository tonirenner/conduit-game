import * as THREE from 'three';

export type GasGiantLayerKind = 'gas_giant' | 'ice_giant';

export type GasGiantLayerOptions = {
	kind: GasGiantLayerKind;
	radius: number;
	seed: number;
};

/**
 * Phase 7a.2:
 *
 * Seeded procedural gas/ice giant renderer.
 *
 * No terrain.
 * No bake.
 * Texture-based bands for WebGPU/WebGL compatibility.
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
		const width = 1536;
		const height = 768;
		const canvas = document.createElement('canvas');

		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Could not create gas giant texture context.');
		}

		this.paintBaseBands(context, width, height);
		this.paintFineStripes(context, width, height);

		if (this.options.kind === 'gas_giant') {
			this.paintStorms(context, width, height);
		} else {
			this.paintIceHaze(context, width, height);
		}

		const texture = new THREE.CanvasTexture(canvas);

		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.repeat.set(1, 1);
		texture.offset.set(0, 0);
		texture.needsUpdate = true;

		texture.colorSpace = THREE.SRGBColorSpace;

		return texture;
	}

	private paintBaseBands(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		let y = 0;

		while (y < height) {
			const normalizedY = y / height;
			const latitude = Math.abs(normalizedY - 0.5) * 2;
			const bandHeight = 18 + this.rng() * 54 + latitude * 30;
			const palette =
				      this.options.kind === 'ice_giant'
				      ? getIcePalette()
				      : getGasPalette();

			const colorA = palette[Math.floor(this.rng() * palette.length)];
			const colorB = palette[Math.floor(this.rng() * palette.length)];
			const gradient = context.createLinearGradient(0, y, 0, y + bandHeight);

			gradient.addColorStop(0, colorA);
			gradient.addColorStop(0.5, mixHex(colorA, colorB, 0.42));
			gradient.addColorStop(1, colorB);

			context.fillStyle = gradient;
			context.fillRect(0, y, width, Math.ceil(bandHeight) + 1);

			y += bandHeight;
		}
	}

	private paintFineStripes(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		const stripeCount = this.options.kind === 'ice_giant' ? 72 : 128;

		context.globalAlpha = this.options.kind === 'ice_giant' ? 0.12 : 0.18;

		for (let index = 0; index < stripeCount; index++) {
			const y = Math.floor(this.rng() * height);
			const stripeHeight =
				      1 +
				      Math.floor(
					      this.rng() *
					      (this.options.kind === 'ice_giant' ? 7 : 11),
				      );

			context.fillStyle = this.rng() > 0.5 ? '#ffffff' : '#000000';
			context.fillRect(0, y, width, stripeHeight);
		}

		context.globalAlpha = 1;
	}

	private paintStorms(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		const stormCount = 2 + Math.floor(this.rng() * 4);

		for (let index = 0; index < stormCount; index++) {
			const x = width * (0.12 + this.rng() * 0.76);
			const y = height * (0.25 + this.rng() * 0.5);
			const rx = width * (0.035 + this.rng() * 0.07);
			const ry = height * (0.018 + this.rng() * 0.045);

			context.save();
			context.translate(x, y);
			context.rotate((this.rng() - 0.5) * 0.5);

			const gradient = context.createRadialGradient(0, 0, 1, 0, 0, rx);

			gradient.addColorStop(0, 'rgba(255,238,205,0.88)');
			gradient.addColorStop(0.42, 'rgba(194,99,52,0.72)');
			gradient.addColorStop(0.82, 'rgba(73,39,31,0.28)');
			gradient.addColorStop(1, 'rgba(73,39,31,0.0)');

			context.fillStyle = gradient;
			context.beginPath();
			context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
			context.fill();
			context.restore();
		}
	}

	private paintIceHaze(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
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
}

function getGasPalette(): string[] {
	return [
		'#3a2115',
		'#6d4228',
		'#9a6a42',
		'#c8985f',
		'#e6c894',
		'#f1d9aa',
		'#9b5133',
		'#4f2d22',
	];
}

function getIcePalette(): string[] {
	return [
		'#102b3a',
		'#1f5d7a',
		'#3c8cb0',
		'#70b9d9',
		'#a9def2',
		'#d8f4ff',
		'#5a93bf',
	];
}

function mixHex(a: string, b: string, t: number): string {
	const ca = parseHex(a);
	const cb = parseHex(b);
	const r = Math.round(THREE.MathUtils.lerp(ca.r, cb.r, t));
	const g = Math.round(THREE.MathUtils.lerp(ca.g, cb.g, t));
	const bl = Math.round(THREE.MathUtils.lerp(ca.b, cb.b, t));

	return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(value: string): { r: number; g: number; b: number } {
	const hex = value.replace('#', '');

	return {
		r: Number.parseInt(hex.slice(0, 2), 16),
		g: Number.parseInt(hex.slice(2, 4), 16),
		b: Number.parseInt(hex.slice(4, 6), 16),
	};
}

function createSeededRandom(seed: number): () => number {
	let value = seed >>> 0;

	return () => {
		value += 0x6d2b79f5;
		let mixed = value;

		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}
