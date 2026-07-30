import * as THREE from 'three';

export type SystemNebulaBackdropOptions = {
	seed: number;
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

	constructor(options: SystemNebulaBackdropOptions) {
		this.seed = options.seed;
		this.group.name = 'SystemNebulaBackdrop';
		this.group.renderOrder = -700;

		this.rebuild();
	}

	reseed(seed: number): void {
		this.seed = seed;
		this.rebuild();
	}

	update(
		deltaSeconds: number,
		cameraPosition: THREE.Vector3,
	): void {
		this.group.position.copy(cameraPosition);
		this.group.rotation.y += deltaSeconds * 0.0012;
		this.group.rotation.x += deltaSeconds * 0.00035;

		for (let index = 0; index < this.nebulaSprites.length; index++) {
			const sprite = this.nebulaSprites[index];
			sprite.material.rotation += deltaSeconds * (0.0012 + index * 0.00022);
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

		const palette = this.createPalette();

		this.group.add(this.createSoftField(palette));
		this.group.add(this.createNebulaSpriteLayer(palette));
		this.group.add(this.createFarFogSheets(palette));
		this.pointCloud = this.createNebulaPointCloud(palette);
		this.group.add(this.pointCloud);
	}

	private createSoftField(palette: NebulaPalette): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(420, 48, 24);
		const positions = geometry.getAttribute('position');
		const colors = new Float32Array(positions.count * 3);
		const vertex = new THREE.Vector3();
		const color = new THREE.Color();

		for (let index = 0; index < positions.count; index++) {
			vertex.fromBufferAttribute(positions, index).normalize();

			const band = Math.exp(-Math.pow(vertex.y * 2.0, 2));
			const diagonal =
				      Math.sin(vertex.x * 2.0 + vertex.z * 1.45 + this.seed * 0.00001);
			const swirl =
				      Math.sin(vertex.x * 3.9 - vertex.z * 2.4 + vertex.y * 1.4);
			const nebula = THREE.MathUtils.clamp(
				band * (0.28 + diagonal * 0.14 + swirl * 0.08),
				0,
				1,
			);

			color.copy(palette.deep)
				.lerp(palette.mid, 0.10 + band * 0.18)
				.lerp(palette.accentA, nebula * 0.18)
				.lerp(palette.accentB, Math.max(0, diagonal) * band * 0.10);

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
				                            opacity: 0.18,
				                            depthWrite: false,
				                            depthTest: true,
			                            }),
		);

		mesh.name = 'System Soft Nebula Field';
		mesh.renderOrder = -760;

		return mesh;
	}

	private createFarFogSheets(palette: NebulaPalette): THREE.Group {
		const group = new THREE.Group();

		group.name = 'System Nebula Fog Sheets';

		const sheetCount = 4;

		for (let index = 0; index < sheetCount; index++) {
			const color =
				      index % 2 === 0
				      ? palette.mid
				      : index % 3 === 0
				        ? palette.accentB
				        : palette.accentA;

			const material = new THREE.SpriteMaterial({
				                                          map: this.createNebulaTexture(
					                                          color,
					                                          this.seed + 9000 + index * 211,
				                                          ),
				                                          color,
				                                          transparent: true,
				                                          opacity: 0.035 + this.hash01(index, 131) * 0.025,
				                                          depthWrite: false,
				                                          depthTest: true,
				                                          blending: THREE.NormalBlending,
			                                          });

			const sprite = new THREE.Sprite(material);
			const theta = this.hash01(index, 137) * Math.PI * 2;
			const radius = 220 + this.hash01(index, 139) * 110;
			const y = (this.hash01(index, 149) - 0.5) * 130;

			sprite.name = 'Fog Sheet';
			sprite.position.set(
				Math.cos(theta) * radius,
				y,
				Math.sin(theta) * radius,
			);

			sprite.scale.set(
				240 + this.hash01(index, 151) * 180,
				110 + this.hash01(index, 157) * 110,
				1,
			);

			material.rotation = (this.hash01(index, 163) - 0.5) * 1.1;
			sprite.renderOrder = -755;

			this.nebulaSprites.push(sprite);
			group.add(sprite);
		}

		return group;
	}

	private createNebulaSpriteLayer(palette: NebulaPalette): THREE.Group {
		const group = new THREE.Group();
		group.name = 'System Nebula Billboards';

		const spriteCount = 8;

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
				                                          opacity: 0.04 + this.hash01(index, 31) * 0.045,
				                                          depthWrite: false,
				                                          depthTest: true,
				                                          blending: THREE.NormalBlending,
			                                          });

			const sprite = new THREE.Sprite(material);

			const radius = 200 + this.hash01(index, 41) * 150;
			const theta = this.hash01(index, 43) * Math.PI * 2;
			const y = (this.hash01(index, 47) - 0.5) * 140;

			sprite.position.set(
				Math.cos(theta) * radius,
				y,
				Math.sin(theta) * radius,
			);

			const scaleX = 220 + this.hash01(index, 53) * 180;
			const scaleY = 90 + this.hash01(index, 59) * 100;

			sprite.scale.set(scaleX, scaleY, 1);
			material.rotation = (this.hash01(index, 61) - 0.5) * 0.75;
			sprite.renderOrder = -740;

			this.nebulaSprites.push(sprite);
			group.add(sprite);
		}

		return group;
	}

	private createNebulaPointCloud(palette: NebulaPalette): THREE.Points {
		const count = 12000;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const color = new THREE.Color();

		for (let index = 0; index < count; index++) {
			const cluster = Math.floor(this.hash01(index, 7) * 4);
			const clusterAngle = cluster * Math.PI * 0.5 + this.hash01(cluster, 13) * 0.8;
			const clusterRadius = 170 + this.hash01(cluster, 17) * 95;

			const theta = clusterAngle + (this.hash01(index, 19) - 0.5) * 1.6;
			const radial = clusterRadius + this.gaussianLike(index, 23) * 54;
			const height = this.gaussianLike(index, 29) * 70;
			const depth = this.gaussianLike(index, 37) * 82;

			positions[index * 3] =
				Math.cos(theta) * radial + Math.cos(theta + Math.PI * 0.5) * depth;
			positions[index * 3 + 1] = height;
			positions[index * 3 + 2] =
				Math.sin(theta) * radial + Math.sin(theta + Math.PI * 0.5) * depth;

			const mix = this.hash01(index, 71);

			color.copy(palette.dust)
				.lerp(palette.accentA, mix * 0.22)
				.lerp(palette.accentB, Math.max(0, mix - 0.55) * 0.18);

			const alphaLike = 0.16 + this.hash01(index, 83) * 0.24;

			colors[index * 3] = color.r * alphaLike;
			colors[index * 3 + 1] = color.g * alphaLike;
			colors[index * 3 + 2] = color.b * alphaLike;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			                                          size: 2.4,
			                                          sizeAttenuation: true,
			                                          vertexColors: true,
			                                          transparent: true,
			                                          opacity: 0.12,
			                                          depthWrite: false,
			                                          depthTest: true,
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

		gradient.addColorStop(0.00, `rgba(${red}, ${green}, ${blue}, 0.32)`);
		gradient.addColorStop(0.28, `rgba(${red}, ${green}, ${blue}, 0.14)`);
		gradient.addColorStop(0.62, `rgba(${red}, ${green}, ${blue}, 0.04)`);
		gradient.addColorStop(1.00, 'rgba(0, 0, 0, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		for (let index = 0; index < 54; index++) {
			const x = this.hashSeed01(seed, index * 3 + 11) * canvas.width;
			const y = this.hashSeed01(seed, index * 3 + 17) * canvas.height;
			const radius = 8 + this.hashSeed01(seed, index * 3 + 23) * 42;
			const alpha = 0.010 + this.hashSeed01(seed, index * 3 + 29) * 0.022;

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
			0.32,
			0.05,
		);
		const mid = new THREE.Color().setHSL(
			0.57 + hue * 0.12,
			0.32,
			0.12,
		);
		const accentA = new THREE.Color().setHSL(
			0.50 + hue * 0.20,
			0.42,
			0.26,
		);
		const accentB = new THREE.Color().setHSL(
			0.72 + hue * 0.18,
			0.34,
			0.24,
		);
		const dust = new THREE.Color().setHSL(
			0.10 + hue * 0.10,
			0.14,
			0.34,
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
