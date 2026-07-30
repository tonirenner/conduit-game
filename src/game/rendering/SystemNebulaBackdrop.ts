import * as THREE from 'three';

export type SystemNebulaBackdropOptions = {
	seed: number;
	enabled?: boolean;
};

type NebulaPalette = {
	deep: THREE.Color;
	mid: THREE.Color;
	accentA: THREE.Color;
	accentB: THREE.Color;
	dust: THREE.Color;
};

export class SystemNebulaBackdrop {
	public readonly group = new THREE.Group();

	private readonly nebulaSprites: THREE.Sprite[] = [];
	private pointCloud: THREE.Points | null = null;
	private seed: number;
	private enabled: boolean;

	constructor(options: SystemNebulaBackdropOptions) {
		this.seed = options.seed;
		this.enabled = options.enabled ?? true;
		this.group.name = 'SystemNebulaBackdrop';
		this.group.renderOrder = -700;

		if (this.enabled) {
			this.rebuild();
		}
	}

	reseed(seed: number): void {
		if (!this.enabled && this.group.children.length === 0) {
			return;
		}

		this.seed = seed;
		this.rebuild();
	}

	update(
		deltaSeconds: number,
		cameraPosition: THREE.Vector3,
	): void {
		if (!this.enabled) {
			return;
		}

		/**
		 * Keep the backdrop loosely centered around the camera so it behaves
		 * like a large system-space haze instead of an object the player can
		 * accidentally fly out of.
		 */
		this.group.position.copy(cameraPosition);
		this.group.rotation.y += deltaSeconds * 0.0025;
		this.group.rotation.x += deltaSeconds * 0.0007;

		for (let index = 0; index < this.nebulaSprites.length; index++) {
			const sprite = this.nebulaSprites[index];
			sprite.material.rotation += deltaSeconds * (0.002 + index * 0.0007);
		}
	}

	dispose(): void {
		for (const child of this.group.children.slice()) {
			this.group.remove(child);
			this.disposeObject(child);
		}

		this.nebulaSprites.length = 0;
		this.pointCloud = null;
	}

	private rebuild(): void {
		this.dispose();

		if (!this.enabled) {
			return;
		}

		const palette = this.createPalette();

		this.group.add(this.createSoftField(palette));
		this.group.add(this.createNebulaSpriteLayer(palette));
		this.pointCloud = this.createNebulaPointCloud(palette);
		this.group.add(this.pointCloud);
	}

	private createSoftField(palette: NebulaPalette): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(360, 48, 24);
		const positions = geometry.getAttribute('position');
		const colors = new Float32Array(positions.count * 3);
		const vertex = new THREE.Vector3();
		const color = new THREE.Color();

		for (let index = 0; index < positions.count; index++) {
			vertex.fromBufferAttribute(positions, index).normalize();

			const band = Math.exp(-Math.pow(vertex.y * 2.2, 2));
			const diagonal =
				      Math.sin(vertex.x * 2.1 + vertex.z * 1.6 + this.seed * 0.00001);
			const swirl =
				      Math.sin(vertex.x * 4.7 - vertex.z * 2.9 + vertex.y * 1.8);
			const nebula = THREE.MathUtils.clamp(
				band * (0.38 + diagonal * 0.20 + swirl * 0.10),
				0,
				1,
			);

			color.copy(palette.deep)
				.lerp(palette.mid, 0.18 + band * 0.22)
				.lerp(palette.accentA, nebula * 0.36)
				.lerp(palette.accentB, Math.max(0, diagonal) * band * 0.18);

			colors[index * 3] = color.r;
			colors[index * 3 + 1] = color.g;
			colors[index * 3 + 2] = color.b;
		}

		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				                            side: THREE.BackSide,
				                            vertexColors: true,
				                            transparent: true,
				                            opacity: 0.72,
				                            depthWrite: false,
				                            depthTest: false,
			                            }),
		);

		mesh.name = 'System Soft Nebula Field';
		mesh.renderOrder = -760;

		return mesh;
	}

	private createNebulaSpriteLayer(palette: NebulaPalette): THREE.Group {
		const group = new THREE.Group();
		group.name = 'System Nebula Billboards';

		const spriteCount = 11;

		for (let index = 0; index < spriteCount; index++) {
			const color =
				      index % 3 === 0
				      ? palette.accentA
				      : index % 3 === 1
				        ? palette.accentB
				        : palette.mid;

			const texture = this.createNebulaTexture(
				color,
				this.seed + index * 101,
			);

			const material = new THREE.SpriteMaterial({
				                                          map: texture,
				                                          color,
				                                          transparent: true,
				                                          opacity: 0.24 + this.hash01(index, 31) * 0.28,
				                                          depthWrite: false,
				                                          depthTest: false,
				                                          blending: THREE.AdditiveBlending,
			                                          });

			const sprite = new THREE.Sprite(material);

			const radius = 120 + this.hash01(index, 41) * 150;
			const theta = this.hash01(index, 43) * Math.PI * 2;
			const y = (this.hash01(index, 47) - 0.5) * 130;

			sprite.position.set(
				Math.cos(theta) * radius,
				y,
				Math.sin(theta) * radius,
			);

			const scaleX = 190 + this.hash01(index, 53) * 260;
			const scaleY = 82 + this.hash01(index, 59) * 160;

			sprite.scale.set(scaleX, scaleY, 1);
			material.rotation = (this.hash01(index, 61) - 0.5) * 0.9;
			sprite.renderOrder = -740;

			this.nebulaSprites.push(sprite);
			group.add(sprite);
		}

		return group;
	}

	private createNebulaPointCloud(palette: NebulaPalette): THREE.Points {
		const count = 18000;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const color = new THREE.Color();

		for (let index = 0; index < count; index++) {
			const cluster = Math.floor(this.hash01(index, 7) * 4);
			const clusterAngle = cluster * Math.PI * 0.5 + this.hash01(cluster, 13) * 0.8;
			const clusterRadius = 82 + this.hash01(cluster, 17) * 120;

			const theta = clusterAngle + (this.hash01(index, 19) - 0.5) * 1.55;
			const radial = clusterRadius + this.gaussianLike(index, 23) * 62;
			const height = this.gaussianLike(index, 29) * 46;
			const depth = this.gaussianLike(index, 37) * 92;

			positions[index * 3] =
				Math.cos(theta) * radial + Math.cos(theta + Math.PI * 0.5) * depth;
			positions[index * 3 + 1] = height;
			positions[index * 3 + 2] =
				Math.sin(theta) * radial + Math.sin(theta + Math.PI * 0.5) * depth;

			const mix = this.hash01(index, 71);

			color.copy(palette.dust)
				.lerp(palette.accentA, mix * 0.44)
				.lerp(palette.accentB, Math.max(0, mix - 0.55) * 0.38);

			const alphaLike = 0.30 + this.hash01(index, 83) * 0.52;

			colors[index * 3] = color.r * alphaLike;
			colors[index * 3 + 1] = color.g * alphaLike;
			colors[index * 3 + 2] = color.b * alphaLike;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			                                          size: 3.2,
			                                          sizeAttenuation: true,
			                                          vertexColors: true,
			                                          transparent: true,
			                                          opacity: 0.42,
			                                          depthWrite: false,
			                                          depthTest: false,
			                                          blending: THREE.AdditiveBlending,
		                                          });

		const cloud = new THREE.Points(geometry, material);
		cloud.name = 'System Volumetric Fake Nebula PointCloud';
		cloud.renderOrder = -720;

		return cloud;
	}

	private createNebulaTexture(
		color: THREE.Color,
		seed: number,
	): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		context.clearRect(0, 0, canvas.width, canvas.height);

		const red = Math.round(color.r * 255);
		const green = Math.round(color.g * 255);
		const blue = Math.round(color.b * 255);

		const gradient = context.createRadialGradient(
			canvas.width * (0.46 + this.hashSeed01(seed, 3) * 0.08),
			canvas.height * (0.46 + this.hashSeed01(seed, 5) * 0.08),
			0,
			canvas.width * 0.5,
			canvas.height * 0.5,
			canvas.width * 0.52,
		);

		gradient.addColorStop(0.00, `rgba(${red}, ${green}, ${blue}, 0.70)`);
		gradient.addColorStop(0.28, `rgba(${red}, ${green}, ${blue}, 0.28)`);
		gradient.addColorStop(0.62, `rgba(${red}, ${green}, ${blue}, 0.08)`);
		gradient.addColorStop(1.00, 'rgba(0, 0, 0, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		for (let index = 0; index < 84; index++) {
			const x = this.hashSeed01(seed, index * 3 + 11) * canvas.width;
			const y = this.hashSeed01(seed, index * 3 + 17) * canvas.height;
			const radius = 10 + this.hashSeed01(seed, index * 3 + 23) * 54;
			const alpha = 0.018 + this.hashSeed01(seed, index * 3 + 29) * 0.045;

			const puff = context.createRadialGradient(x, y, 0, x, y, radius);
			puff.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
			puff.addColorStop(1, 'rgba(255, 255, 255, 0)');

			context.fillStyle = puff;
			context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
		}

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
	}

	private createPalette(): NebulaPalette {
		const hue = this.hashSeed01(this.seed, 101);

		const deep = new THREE.Color().setHSL(
			0.55 + hue * 0.13,
			0.36,
			0.055,
		);
		const mid = new THREE.Color().setHSL(
			0.57 + hue * 0.12,
			0.42,
			0.16,
		);
		const accentA = new THREE.Color().setHSL(
			0.50 + hue * 0.20,
			0.58,
			0.38,
		);
		const accentB = new THREE.Color().setHSL(
			0.72 + hue * 0.18,
			0.46,
			0.34,
		);
		const dust = new THREE.Color().setHSL(
			0.10 + hue * 0.10,
			0.22,
			0.44,
		);

		return {
			deep,
			mid,
			accentA,
			accentB,
			dust,
		};
	}

	private gaussianLike(
		index: number,
		salt: number,
	): number {
		return (
			       this.hash01(index, salt) +
			       this.hash01(index, salt + 1) +
			       this.hash01(index, salt + 2) +
			       this.hash01(index, salt + 3) -
			       2
		       ) * 0.5;
	}

	private hash01(
		index: number,
		salt: number,
	): number {
		return this.hashSeed01(
			this.seed + index * 374761393,
			salt,
		);
	}

	private hashSeed01(
		seed: number,
		salt: number,
	): number {
		let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
		value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
		value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
		value ^= value >>> 16;

		return (value >>> 0) / 4294967295;
	}

	private disposeObject(object: THREE.Object3D): void {
		object.traverse((item) => {
			if (item instanceof THREE.Mesh || item instanceof THREE.Points) {
				item.geometry.dispose();

				const material = item.material;

				if (Array.isArray(material)) {
					for (const entry of material) {
						entry.dispose();
					}
					return;
				}

				if ('map' in material && material.map) {
					material.map.dispose();
				}

				material.dispose();
			}

			if (item instanceof THREE.Sprite) {
				const material = item.material;

				material.map?.dispose();
				material.dispose();
			}
		});
	}
}
