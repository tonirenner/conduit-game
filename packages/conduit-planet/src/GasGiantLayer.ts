import * as THREE from 'three';
import { createMulberry32 } from './internal/DeterministicRandom';
import {
	getGasGiantVisualProfile,
	type GasGiantLayerKind,
	type GasGiantVisualProfile,
} from '@conduit/planet/rendering';

export type GasGiantLayerOptions = {
	kind: GasGiantLayerKind;
	radius: number;
	seed: number;
	gasInfluence?: number;
	enableCloudParticles?: boolean;
	rendererMode?: 'webgl' | 'webgpu';
};

type CloudParticleLayer = {
	points: THREE.Points;
	geometry: THREE.BufferGeometry;
	material: THREE.PointsMaterial;
	baseOpacity: number;
	baseSize: number;
};

type CloudVolumeShell = {
	mesh: THREE.Mesh;
	material: THREE.MeshStandardMaterial;
	texture: THREE.CanvasTexture;
	scrollX: number;
	scrollY: number;
	rotationY: number;
	rotationZ: number;
};

/**
 * Phase 7a.2d:
 *
 * Gas giant / ice giant renderer with:
 * - seeded turbulent band texture
 * - soft volumetric cloud shells
 * - particle cloud veil
 * - atmosphere shell
 *
 * Still intentionally texture/shell based.
 * This gives the visual feel of raymarched layered gas clouds without
 * moving the gas giant path into fragile WGSL/TSL yet.
 */
export class GasGiantLayer {
	public readonly group: THREE.Group;
	public readonly mesh: THREE.Mesh;

	private readonly atmosphereMesh: THREE.Mesh;
	private readonly cloudParticleLayer: CloudParticleLayer | null;
	private readonly cloudVolumeShells: CloudVolumeShell[];
	private readonly bandTexture: THREE.CanvasTexture;
	private readonly profile: GasGiantVisualProfile;
	private readonly rng: () => number;

	constructor(
		private readonly options: GasGiantLayerOptions,
	) {
		this.profile = getGasGiantVisualProfile(
			options.kind,
			options.gasInfluence ?? 1,
		);
		this.rng = createMulberry32(
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
		this.cloudVolumeShells = this.createCloudVolumeShells();
		this.cloudParticleLayer =
			options.enableCloudParticles === false
			? null
			: this.createCloudParticles();
		this.atmosphereMesh = this.createAtmosphere();

		this.group.add(this.mesh);

		for (const shell of this.cloudVolumeShells) {
			this.group.add(shell.mesh);
		}

		if (this.cloudParticleLayer) {
			this.group.add(this.cloudParticleLayer.points);
		}
		this.group.add(this.atmosphereMesh);
	}

	update(deltaSeconds: number, cameraDistance?: number): void {
		const rotationSpeed =
			      this.options.kind === 'ice_giant'
			      ? 0.00055
			      : 0.0009;

		this.group.rotation.y += deltaSeconds * rotationSpeed;

		for (const shell of this.cloudVolumeShells) {
			shell.texture.offset.x =
				(shell.texture.offset.x + deltaSeconds * shell.scrollX) % 1;

			shell.texture.offset.y =
				(shell.texture.offset.y + deltaSeconds * shell.scrollY) % 1;

			shell.mesh.rotation.y += deltaSeconds * shell.rotationY;
			shell.mesh.rotation.z += deltaSeconds * shell.rotationZ;
		}

		if (this.cloudParticleLayer) {
			this.updateCloudParticleDistanceFade(cameraDistance);

			this.cloudParticleLayer.points.rotation.y +=
				deltaSeconds *
				(
					this.options.kind === 'ice_giant'
					? 0.00028
					: 0.00045
				);

			this.cloudParticleLayer.points.rotation.z +=
				deltaSeconds * 0.00004;
		}

		this.bandTexture.offset.x =
			(this.bandTexture.offset.x +
			 deltaSeconds *
			 (
				 this.options.kind === 'ice_giant'
				 ? 0.000004
				 : 0.000009
			 )) % 1;
	}

	getDebugStats(): {
		kind: GasGiantLayerKind;
		cloudShells: number;
		cloudParticles: {
			enabled: boolean;
			count: number;
			opacity: number;
			size: number;
			farFadeStart: number;
			farFadeEnd: number;
			farOpacity: number;
			farSize: number;
		};
		atmosphere: {
			radius: number;
			opacity: number;
		};
		bands: {
			frequency: number;
			stripeCount: number;
			cloudThreshold: number;
		};
	} {
		return {
			kind: this.options.kind,
			cloudShells: this.profile.cloudShells.count,
			cloudParticles: {
				enabled: this.cloudParticleLayer !== null,
				count: this.profile.cloudParticles.count,
				opacity: this.profile.cloudParticles.opacity,
				size: this.profile.cloudParticles.size,
				farFadeStart: this.profile.cloudParticles.farFadeStart,
				farFadeEnd: this.profile.cloudParticles.farFadeEnd,
				farOpacity: this.profile.cloudParticles.farOpacity,
				farSize: this.profile.cloudParticles.farSize,
			},
			atmosphere: {
				radius: this.profile.atmosphere.radius,
				opacity: this.profile.atmosphere.opacity,
			},
			bands: {
				frequency: this.profile.bands.frequency,
				stripeCount: this.profile.bands.stripeCount,
				cloudThreshold: this.profile.bands.cloudThreshold,
			},
		};
	}

	private updateCloudParticleDistanceFade(cameraDistance?: number): void {
		if (!this.cloudParticleLayer || cameraDistance === undefined) {
			return;
		}

		const distanceRatio =
			      cameraDistance /
			      Math.max(0.0001, this.options.radius);
		const farFade = THREE.MathUtils.smoothstep(
			distanceRatio,
			this.profile.cloudParticles.farFadeStart,
			this.profile.cloudParticles.farFadeEnd,
		);
		const opacityMultiplier = THREE.MathUtils.lerp(
			1.0,
			this.profile.cloudParticles.farOpacity,
			farFade,
		);
		const sizeMultiplier = THREE.MathUtils.lerp(
			1.0,
			this.profile.cloudParticles.farSize,
			farFade,
		);

		this.cloudParticleLayer.material.opacity =
			this.cloudParticleLayer.baseOpacity * opacityMultiplier;
		this.cloudParticleLayer.material.size =
			this.cloudParticleLayer.baseSize * sizeMultiplier;
	}

	dispose(): void {
		this.bandTexture.dispose();

		for (const shell of this.cloudVolumeShells) {
			shell.texture.dispose();
			shell.mesh.geometry.dispose();
			shell.material.dispose();
		}

		this.cloudParticleLayer?.geometry.dispose();
		this.cloudParticleLayer?.material.dispose();

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
			                                                roughness: this.profile.body.roughness,
			                                                metalness: 0.0,
			                                                emissive: this.profile.body.emissive,
			                                                emissiveIntensity:
				                                                this.profile.body.emissiveIntensity *
				                                                (
					                                                this.options.rendererMode === 'webgl'
					                                                ? 2.15
					                                                : 1.0
				                                                ),
		                                                });

		if (this.options.rendererMode === 'webgl') {
			material.toneMapped = false;
		}

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

	private createCloudVolumeShells(): CloudVolumeShell[] {
		const shells: CloudVolumeShell[] = [];

		for (let index = 0; index < this.profile.cloudShells.count; index++) {
			const texture = this.createCloudVolumeTexture(index);

			const geometry = new THREE.SphereGeometry(
				this.options.radius *
				(
					this.profile.cloudShells.radiusStart +
					index * this.profile.cloudShells.radiusStep
				),
				128,
				80,
			);

			const material = new THREE.MeshStandardMaterial({
				                                                color: this.profile.cloudShells.color,
				                                                alphaMap: texture,
				                                                transparent: true,
				                                                opacity:
					                                                Math.max(
						                                                this.profile.cloudShells.opacityMin,
						                                                this.profile.cloudShells.opacityStart -
						                                                index * this.profile.cloudShells.opacityStep,
					                                                ) *
					                                                (
						                                                this.options.rendererMode === 'webgl'
						                                                ? 0.72
						                                                : 1.0
					                                                ),
				                                                depthWrite: false,
				                                                depthTest: true,
				                                                side: THREE.DoubleSide,
				                                                roughness: 1.0,
				                                                metalness: 0.0,
				                                                emissive: this.profile.cloudShells.emissive,
				                                                emissiveIntensity:
					                                                this.profile.cloudShells.emissiveIntensity,
				                                                blending: THREE.AdditiveBlending,
			                                                });

			const mesh = new THREE.Mesh(
				geometry,
				material,
			);

			mesh.name =
				this.options.kind === 'ice_giant'
				? `IceGiantCloudShell_${index}`
				: `GasGiantCloudShell_${index}`;

			mesh.renderOrder = 4 + index;
			mesh.frustumCulled = false;

			shells.push({
				            mesh,
				            material,
				            texture,
				            scrollX:
					            this.options.kind === 'ice_giant'
					            ? 0.000012 + index * 0.000004
					            : 0.000018 + index * 0.000006,
				            scrollY:
					            this.options.kind === 'ice_giant'
					            ? 0.000002 + index * 0.000001
					            : 0.000003 + index * 0.0000015,
				            rotationY:
					            this.options.kind === 'ice_giant'
					            ? 0.00008 + index * 0.00003
					            : 0.00012 + index * 0.00004,
				            rotationZ:
					            (this.options.kind === 'ice_giant'
					             ? 0.00001
					             : 0.000015) *
					            (index % 2 === 0 ? 1 : -1),
			            });
		}

		return shells;
	}

	private createCloudVolumeTexture(
		shellIndex: number,
	): THREE.CanvasTexture {
		const width = 1024;
		const height = 512;

		const canvas = document.createElement('canvas');

		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Could not create cloud volume texture context.');
		}

		const image = context.createImageData(width, height);
		const data = image.data;

		const field = createTurbulenceField(
			width,
			height,
			this.options.seed + shellIndex * 1777,
			this.options.kind,
		);

		for (let y = 0; y < height; y++) {
			const v = y / (height - 1);

			for (let x = 0; x < width; x++) {
				const u = x / (width - 1);

				const alpha = this.sampleCloudVolumeAlpha(
					u,
					v,
					shellIndex,
					field,
				);

				const value = Math.floor(alpha * 255);
				const offset = (y * width + x) * 4;

				data[offset + 0] = value;
				data[offset + 1] = value;
				data[offset + 2] = value;
				data[offset + 3] = 255;
			}
		}

		context.putImageData(image, 0, 0);

		this.paintCloudVolumeWisps(context, width, height, shellIndex, field);
		this.blendHorizontalTextureSeam(context, width, height, 40);

		return createWrappedCanvasTexture(canvas);
	}

	private sampleCloudVolumeAlpha(
		u: number,
		v: number,
		shellIndex: number,
		field: TurbulenceField,
	): number {
		const latitude = (v - 0.5) * 2;

		const turbulence = field.sample(
			(u + shellIndex * 0.037) % 1,
			v,
		);

		const bandFrequency = this.profile.bands.cloudAlphaFrequency;

		const band =
			      0.5 +
			      0.5 *
			      Math.sin(
			      v * Math.PI * bandFrequency +
			      turbulence.swirl * 2.6 +
			      shellIndex * 0.8,
			      );

		const clump = seamlessFbm2(
			wrap01(u + turbulence.medium * 0.018 + shellIndex * 0.031),
			v +
			turbulence.fine * 0.025 +
			shellIndex * 0.041,
			this.profile.bands.cloudAlphaScaleX,
			this.profile.bands.cloudAlphaScaleY,
			shellIndex * 11.7,
			4,
		);

		const wisps = seamlessFbm2(
			wrap01(u + turbulence.swirl * 0.014 + shellIndex * 0.047),
			v + turbulence.medium * 0.030 + shellIndex * 0.059,
			54.0,
			96.0,
			shellIndex * 21.3,
			3,
		);

		const equatorBoost =
			      this.options.kind === 'ice_giant'
			      ? 0.95
			      : 1.0 - Math.max(0, Math.abs(latitude) - 0.85) * 2.8;

		const raw =
			      band * 0.34 +
			      clump * 0.44 +
			      wisps * 0.22;

		const threshold = this.profile.bands.cloudThreshold;

		const softened = THREE.MathUtils.smoothstep(
			raw,
			threshold,
			0.98,
		);

		const alpha = Math.pow(
			softened,
			this.profile.bands.cloudPower,
		);

		return THREE.MathUtils.clamp(
			alpha * equatorBoost,
			0,
			1,
		);
	}

	private paintCloudVolumeWisps(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		shellIndex: number,
		field: TurbulenceField,
	): void {
		const wispCount =
			      this.options.kind === 'ice_giant'
			      ? 18
			      : 32;

		context.save();
		context.globalCompositeOperation = 'screen';
		context.globalAlpha =
			this.options.kind === 'ice_giant'
			? 0.10
			: 0.14;

		for (let index = 0; index < wispCount; index++) {
			const y = height * (0.12 + this.rng() * 0.76);
			const length = width * (0.08 + this.rng() * 0.24);
			const x = width * this.rng();
			const phase = this.rng() * Math.PI * 2;

			const gradient = context.createLinearGradient(
				x,
				y,
				x + length,
				y,
			);

			gradient.addColorStop(0, 'rgba(255,255,255,0)');
			gradient.addColorStop(0.45, 'rgba(255,255,255,0.68)');
			gradient.addColorStop(1, 'rgba(255,255,255,0)');

			context.strokeStyle = gradient;
			context.lineWidth =
				this.options.kind === 'ice_giant'
				? 3 + this.rng() * 9
				: 4 + this.rng() * 13;

			context.beginPath();

			for (let i = 0; i <= 44; i++) {
				const t = i / 44;
				const u = ((x + length * t) / width) % 1;
				const v = y / height;
				const turbulence = field.sample(u, v);

				const px = x + length * t;
				const py =
					      y +
					      Math.sin(t * Math.PI * 2 + phase) * 7 +
					      turbulence.swirl * 18 +
					      shellIndex * 2.5;

				if (i === 0) {
					context.moveTo(px, py);
				} else {
					context.lineTo(px, py);
				}
			}

			context.stroke();
		}

		context.restore();
	}

	private createCloudParticles(): CloudParticleLayer {
		const particleCount = this.profile.cloudParticles.count;

		const positions = new Float32Array(particleCount * 3);
		const colors = new Float32Array(particleCount * 3);

		const innerRadius =
			this.options.radius * this.profile.cloudParticles.innerRadius;
		const outerRadius =
			this.options.radius * this.profile.cloudParticles.outerRadius;

		const cloudBands = this.profile.cloudParticles.bands;

		for (let index = 0; index < particleCount; index++) {
			const bandIndex =
				      Math.floor(this.rng() * cloudBands);

			const bandCenter =
				      -0.74 +
				      (bandIndex / Math.max(1, cloudBands - 1)) *
				      1.48;

			const bandSpread =
				this.profile.cloudParticles.bandSpreadMin +
				this.rng() * this.profile.cloudParticles.bandSpreadRandom;

			const latitude = THREE.MathUtils.clamp(
				bandCenter +
				(this.rng() - 0.5) *
				bandSpread *
				2.0,
				-0.94,
				0.94,
			);

			const angle =
				      this.rng() * Math.PI * 2 +
				      Math.sin(latitude * 18 + this.rng() * 2) * 0.22;

			const radius =
				      THREE.MathUtils.lerp(
					      innerRadius,
					      outerRadius,
					      Math.pow(this.rng(), 1.9),
				      );

			const equatorRadius =
				      Math.sqrt(Math.max(0.001, 1 - latitude * latitude));

			const shear =
				      Math.sin(
					      angle * 3.0 +
					      latitude * 19.0 +
					      this.options.seed * 0.00001,
				      ) * 0.012;

			const y = (latitude + shear) * radius;

			const i3 = index * 3;

			positions[i3 + 0] = Math.cos(angle) * radius * equatorRadius;
			positions[i3 + 1] = y;
			positions[i3 + 2] = Math.sin(angle) * radius * equatorRadius;

			const color = this.sampleCloudParticleColor(latitude);

			colors[i3 + 0] = color.r;
			colors[i3 + 1] = color.g;
			colors[i3 + 2] = color.b;
		}

		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(positions, 3),
		);

		geometry.setAttribute(
			'color',
			new THREE.BufferAttribute(colors, 3),
		);

		const baseSize =
			this.options.radius * this.profile.cloudParticles.size;
		const baseOpacity = this.profile.cloudParticles.opacity;

		const material = new THREE.PointsMaterial({
			                                          size: baseSize,
			                                          sizeAttenuation: true,
			                                          vertexColors: true,
			                                          transparent: true,
			                                          opacity: baseOpacity,
			                                          depthWrite: false,
			                                          depthTest: true,
			                                          blending: THREE.AdditiveBlending,
		                                          });

		const points = new THREE.Points(
			geometry,
			material,
		);

		points.name =
			this.options.kind === 'ice_giant'
			? 'IceGiantCloudParticles'
			: 'GasGiantCloudParticles';

		points.renderOrder = 9;
		points.frustumCulled = false;

		return {
			points,
			geometry,
			material,
			baseOpacity,
			baseSize,
		};
	}

	private sampleCloudParticleColor(latitude: number): THREE.Color {
		if (this.options.kind === 'ice_giant') {
			const color = new THREE.Color(0xbdeeff);

			color.lerp(
				new THREE.Color(0xffffff),
				0.22 + this.rng() * 0.38,
			);

			color.multiplyScalar(
				0.65 + this.rng() * 0.28,
			);

			return color;
		}

		const warm = new THREE.Color(0xffd6a4);
		const bright = new THREE.Color(0xfff4d4);
		const reddish = new THREE.Color(0xc26b43);

		const color = warm.clone().lerp(
			this.rng() > 0.78 ? reddish : bright,
			0.18 + this.rng() * 0.42,
		);

		const equatorMask =
			      1 - Math.min(1, Math.abs(latitude));

		color.multiplyScalar(
			0.56 +
			equatorMask * 0.14 +
			this.rng() * 0.20,
		);

		return color;
	}

	private createAtmosphere(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius *
			this.profile.atmosphere.radius,
			128,
			80,
		);

		const material = new THREE.MeshBasicMaterial({
			                                             color: this.profile.atmosphere.color,
			                                             transparent: true,
			                                             opacity:
				                                             this.profile.atmosphere.opacity *
				                                             (
					                                             this.options.rendererMode === 'webgl'
					                                             ? 0.82
					                                             : 1.0
				                                             ),
			                                             side: THREE.BackSide,
			                                             depthWrite: false,
			                                             depthTest: true,
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

		mesh.renderOrder = 12;

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
			this.paintIceHaze(context, width, height);
			this.paintSoftIceWisps(context, width, height, field);
		}

		this.blendHorizontalTextureSeam(context, width, height, 72);

		return createWrappedCanvasTexture(canvas, true);
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

			const bandFrequency = this.profile.bands.frequency;

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
		const stripeCount = this.profile.bands.stripeCount;

		context.globalAlpha = this.profile.bands.stripeAlpha;

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
		height: number
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

	private blendHorizontalTextureSeam(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		blendWidth: number,
	): void {
		const seamWidth = Math.max(
			1,
			Math.min(blendWidth, Math.floor(width * 0.08)),
		);

		const source = context.getImageData(0, 0, width, height);
		const original = source.data;
		const blended = new Uint8ClampedArray(original);

		for (let y = 0; y < height; y++) {
			for (let distance = 0; distance < seamWidth; distance++) {
				const t = smoothstep(distance / Math.max(1, seamWidth - 1));
				const leftX = distance;
				const rightX = width - 1 - distance;
				const leftOffset = (y * width + leftX) * 4;
				const rightOffset = (y * width + rightX) * 4;

				for (let channel = 0; channel < 4; channel++) {
					const left = original[leftOffset + channel];
					const right = original[rightOffset + channel];
					const seamAverage = (left + right) * 0.5;

					blended[leftOffset + channel] = THREE.MathUtils.lerp(
						seamAverage,
						left,
						t,
					);
					blended[rightOffset + channel] = THREE.MathUtils.lerp(
						seamAverage,
						right,
						t,
					);
				}
			}
		}

		source.data.set(blended);
		context.putImageData(source, 0, 0);
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
	const rng = createMulberry32(
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
				      wrap01(
				      u +
				      Math.sin(v * Math.PI * 8 + bandPhase) *
				      shearStrength +
				      latitude *
				      0.06
				      );

			const medium =
				      seamlessFbm2(
					      shearedU,
					      v,
					      7.0,
					      24.0,
					      offsetA + offsetB,
					      4,
				      ) * 2 - 1;

			const fine =
				      seamlessFbm2(
					      shearedU,
					      v,
					      22.0,
					      74.0,
					      offsetB + offsetC,
					      3,
				      ) * 2 - 1;

			const swirl =
				      seamlessFbm2(
					      wrap01(shearedU + medium * 0.035),
					      v + fine * 0.022,
					      5.2,
					      18.0,
					      offsetC + offsetA,
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

function seamlessFbm2(
	u: number,
	v: number,
	scaleX: number,
	scaleY: number,
	offset: number,
	octaves: number,
): number {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let normalizer = 0;

	for (let i = 0; i < octaves; i++) {
		const angle = wrap01(u) * Math.PI * 2 * frequency;
		const ringRadius = scaleX * frequency;
		const x =
			Math.cos(angle) * ringRadius +
			offset +
			i * 37.17;
		const y =
			Math.sin(angle) * ringRadius +
			v * scaleY * frequency +
			offset * 0.37 +
			i * 19.91;

		value += valueNoise2(x, y) * amplitude;
		normalizer += amplitude;
		amplitude *= 0.5;
		frequency *= 2;
	}

	return value / normalizer;
}

function wrap01(value: number): number {
	return value - Math.floor(value);
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

function createWrappedCanvasTexture(
	canvas: HTMLCanvasElement,
	useSrgbColorSpace = false,
): THREE.CanvasTexture {
	const texture = new THREE.CanvasTexture(canvas);

	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.repeat.set(1, 1);
	texture.offset.set(0, 0);
	texture.needsUpdate = true;

	if (useSrgbColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

	return texture;
}
