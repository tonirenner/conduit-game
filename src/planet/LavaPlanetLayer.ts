import * as THREE from 'three';

export type LavaPlanetLayerOptions = {
	radius: number;
	seed: number;
};

/**
 * Phase 7c.4a:
 *
 * Lava planet renderer with tuned geometry mountains + shield volcanoes.
 *
 * Based on stable Phase 7c.2b.
 *
 * Adds:
 * - procedural mountain/ridge mask
 * - real sphere vertex displacement for mountains/ridges
 * - darker basalt highlands
 * - seeded volcano sites
 * - real shield volcano meshes on the sphere
 * - caldera rings
 * - lava lakes
 * - crack arms generated from volcanoes
 *
 * Still intentionally avoids:
 * - CubeSphere terrain path
 * - TSL shader surgery
 * - VolcanicActivityLayer overlay
 */
export class LavaPlanetLayer {
	public readonly group: THREE.Group;

	private readonly surfaceMesh: THREE.Mesh;
	private readonly glowShell: THREE.Mesh;
	private readonly volcanoGroup: THREE.Group;
	private readonly texture: THREE.CanvasTexture;
	private readonly emissiveTexture: THREE.CanvasTexture;

	constructor(
		private readonly options: LavaPlanetLayerOptions,
	) {
		this.group = new THREE.Group();
		this.group.name = 'LavaPlanetLayer';

		const textureSet = createLavaTextureSet(
			options.seed,
			2048,
			1024,
		);

		this.texture = textureSet.colorTexture;
		this.emissiveTexture = textureSet.emissiveTexture;

		this.surfaceMesh = this.createSurfaceMesh();
		this.glowShell = this.createGlowShell();
		this.volcanoGroup = this.createVolcanoGeometryLayer(
			textureSet.volcanoes,
		);

		this.group.add(this.surfaceMesh);
		this.group.add(this.volcanoGroup);
		this.group.add(this.glowShell);
	}

	update(deltaSeconds: number): void {
		this.surfaceMesh.rotation.y += deltaSeconds * 0.00008;
		this.volcanoGroup.rotation.y += deltaSeconds * 0.00008;
		this.glowShell.rotation.y -= deltaSeconds * 0.00004;
	}

	dispose(): void {
		this.surfaceMesh.geometry.dispose();
		this.glowShell.geometry.dispose();

		this.volcanoGroup.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) {
				return;
			}

			object.geometry.dispose();
			disposeMaterial(object.material);
		});

		disposeMaterial(this.surfaceMesh.material);
		disposeMaterial(this.glowShell.material);

		this.texture.dispose();
		this.emissiveTexture.dispose();
	}

	private createSurfaceMesh(): THREE.Mesh {
		const geometry = createDisplacedLavaSphereGeometry(
			this.options.radius,
			this.options.seed,
			192,
			128,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                map: this.texture,
			                                                emissiveMap: this.emissiveTexture,
			                                                emissive: new THREE.Color(0xff5a12),
			                                                emissiveIntensity: 1.42,
			                                                roughness: 0.94,
			                                                metalness: 0.03,
		                                                });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name = 'LavaPlanetSurface';
		mesh.renderOrder = 1;

		return mesh;
	}

	private createVolcanoGeometryLayer(
		volcanoes: VolcanoSite[],
	): THREE.Group {
		const group = new THREE.Group();

		group.name = 'LavaVolcanoGeometryLayer';

		for (const volcano of volcanoes) {
			const normal = texturePointToSphereNormal(
				volcano.x,
				volcano.y,
				2048,
				1024,
			);

			/*
			 * 7c.4a:
			 *
			 * Sharp cones looked like traffic cones stuck to the planet.
			 * Use low, broad shield-volcano geometry instead.
			 */
			const coneHeight =
				      this.options.radius *
				      (0.014 + volcano.intensity * 0.024);

			const baseRadius =
				      this.options.radius *
				      (0.052 + volcano.intensity * 0.052);

			const craterRadius =
				      baseRadius *
				      (0.30 + volcano.intensity * 0.10);

			const volcanoGeometry = new THREE.CylinderGeometry(
				craterRadius,
				baseRadius,
				coneHeight,
				64,
				3,
				false,
			);

			shapeShieldVolcanoGeometry(
				volcanoGeometry,
				0.52,
			);

			const volcanoMaterial = new THREE.MeshStandardMaterial({
				                                                       color: new THREE.Color(0x17110e),
				                                                       emissive: new THREE.Color(0x150503),
				                                                       emissiveIntensity: 0.08 + volcano.intensity * 0.10,
				                                                       roughness: 0.98,
				                                                       metalness: 0.02,
			                                                       });

			const volcanoMesh = new THREE.Mesh(
				volcanoGeometry,
				volcanoMaterial,
			);

			volcanoMesh.name = 'LavaShieldVolcano';
			volcanoMesh.renderOrder = 2;

			orientObjectOnSphere(
				volcanoMesh,
				normal,
				this.options.radius + coneHeight * 0.28,
			);

			volcanoMesh.rotateY(volcano.intensity * Math.PI * 0.37);

			group.add(volcanoMesh);

			const calderaRadius =
				      craterRadius * 0.82;

			const calderaGeometry = new THREE.CircleGeometry(
				calderaRadius,
				38,
			);

			const calderaMaterial = new THREE.MeshBasicMaterial({
				                                                    color: 0xff4e12,
				                                                    transparent: true,
				                                                    opacity: 0.24 + volcano.intensity * 0.18,
				                                                    depthWrite: false,
				                                                    depthTest: true,
				                                                    blending: THREE.AdditiveBlending,
				                                                    side: THREE.DoubleSide,
			                                                    });

			const caldera = new THREE.Mesh(
				calderaGeometry,
				calderaMaterial,
			);

			caldera.name = 'LavaVolcanoCalderaGlow';
			caldera.renderOrder = 4;

			orientFlatObjectOnSphere(
				caldera,
				normal,
				this.options.radius + coneHeight * 0.82,
			);

			group.add(caldera);
		}

		return group;
	}

	private createGlowShell(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius * 1.018,
			128,
			96,
		);

		const material = new THREE.MeshBasicMaterial({
			                                             color: 0xff4a14,
			                                             transparent: true,
			                                             opacity: 0.044,
			                                             side: THREE.BackSide,
			                                             depthWrite: false,
			                                             depthTest: true,
			                                             blending: THREE.AdditiveBlending,
		                                             });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name = 'LavaPlanetGlowShell';
		mesh.renderOrder = 3;

		return mesh;
	}
}

type LavaTextureSet = {
	colorTexture: THREE.CanvasTexture;
	emissiveTexture: THREE.CanvasTexture;
	volcanoes: VolcanoSite[];
};

type CrackPath = {
	points: Array<{ x: number; y: number }>;
	width: number;
	hotness: number;
};

type Hotspot = {
	x: number;
	y: number;
	radius: number;
	power: number;
};

type VolcanoSite = {
	x: number;
	y: number;
	radius: number;
	calderaRadius: number;
	intensity: number;
};

function createLavaTextureSet(
	seed: number,
	width: number,
	height: number,
): LavaTextureSet {
	const colorCanvas = document.createElement('canvas');
	const emissiveCanvas = document.createElement('canvas');

	colorCanvas.width = width;
	colorCanvas.height = height;

	emissiveCanvas.width = width;
	emissiveCanvas.height = height;

	const colorCtx = colorCanvas.getContext('2d');
	const emissiveCtx = emissiveCanvas.getContext('2d');

	if (!colorCtx || !emissiveCtx) {
		throw new Error('Could not create lava texture canvas context.');
	}

	const rng = createSeededRandom(seed ^ 0x7a1af1);

	drawBasaltBase(
		colorCtx,
		width,
		height,
		rng,
	);

	const mountainMask = createMountainMask(
		width,
		height,
		seed ^ 0x4d07a1,
	);

	drawMountainField(
		colorCtx,
		width,
		height,
		mountainMask,
	);

	emissiveCtx.fillStyle = 'rgb(0, 0, 0)';
	emissiveCtx.fillRect(0, 0, width, height);

	const volcanoes = createVolcanoes(
		rng,
		width,
		height,
		mountainMask,
	);

	drawVolcanoes(
		colorCtx,
		emissiveCtx,
		volcanoes,
	);

	const hotspots = createHotspots(
		rng,
		width,
		height,
		volcanoes,
	);

	const cracks = createCrackNetwork(
		rng,
		width,
		height,
		hotspots,
		volcanoes,
	);

	drawCrackGlow(
		colorCtx,
		emissiveCtx,
		cracks,
		width,
	);

	drawHotspots(
		colorCtx,
		emissiveCtx,
		hotspots,
	);

	drawFineLavaFilaments(
		colorCtx,
		emissiveCtx,
		rng,
		width,
		height,
	);

	const colorTexture = new THREE.CanvasTexture(colorCanvas);
	const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);

	colorTexture.name = 'GeneratedLavaColorTexture';
	emissiveTexture.name = 'GeneratedLavaEmissiveTexture';

	colorTexture.colorSpace = THREE.SRGBColorSpace;
	emissiveTexture.colorSpace = THREE.SRGBColorSpace;

	colorTexture.wrapS = THREE.ClampToEdgeWrapping;
	colorTexture.wrapT = THREE.ClampToEdgeWrapping;

	emissiveTexture.wrapS = THREE.ClampToEdgeWrapping;
	emissiveTexture.wrapT = THREE.ClampToEdgeWrapping;

	colorTexture.needsUpdate = true;
	emissiveTexture.needsUpdate = true;

	return {
		colorTexture,
		emissiveTexture,
		volcanoes,
	};
}

function drawBasaltBase(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	rng: () => number,
): void {
	const image = ctx.createImageData(
		width,
		height,
	);

	const data = image.data;

	for (let y = 0; y < height; y++) {
		const latitudeShade =
			      0.82 +
			      0.18 *
			      Math.cos(
				      ((y / height) - 0.5) * Math.PI,
			      );

		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;

			const n =
				      valueNoise2D(x * 0.006, y * 0.006, 41) * 0.58 +
				      valueNoise2D(x * 0.018, y * 0.018, 77) * 0.28 +
				      valueNoise2D(x * 0.055, y * 0.055, 131) * 0.14;

			const ash =
				      Math.pow(
					      Math.max(0, n),
					      1.55,
				      );

			const base =
				      8 +
				      ash * 31 *
				      latitudeShade;

			data[index + 0] = base * 0.95;
			data[index + 1] = base * 0.70;
			data[index + 2] = base * 0.54;
			data[index + 3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);

	ctx.globalAlpha = 0.15;

	for (let i = 0; i < 1300; i++) {
		const x = width * (0.06 + rng() * 0.88);
		const y = height * (0.04 + rng() * 0.92);
		const r = 1 + rng() * 8;

		ctx.fillStyle =
			rng() > 0.5
			? 'rgb(42, 32, 26)'
			: 'rgb(6, 5, 4)';

		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.globalAlpha = 1;
}

function createMountainMask(
	width: number,
	height: number,
	seed: number,
): Float32Array {
	const mask = new Float32Array(width * height);

	for (let y = 0; y < height; y++) {
		const poleFade =
			      smoothstep01(y / height, 0.08, 0.18) *
			      (1 - smoothstep01(y / height, 0.82, 0.92));

		for (let x = 0; x < width; x++) {
			const n =
				      valueNoise2D(x * 0.0022, y * 0.0022, seed + 401) * 0.46 +
				      valueNoise2D(x * 0.0065, y * 0.0065, seed + 733) * 0.34 +
				      valueNoise2D(x * 0.0150, y * 0.0150, seed + 991) * 0.20;

			const ridge =
				      Math.pow(
					      clamp(
						      (n - 0.43) / 0.57,
						      0,
						      1,
					      ),
					      2.15,
				      );

			const sharp =
				      Math.pow(
					      valueNoise2D(
						      x * 0.030,
						      y * 0.030,
						      seed + 1667,
					      ),
					      3.0,
				      );

			mask[y * width + x] =
				clamp(
					ridge * 0.82 + ridge * sharp * 0.42,
					0,
					1,
				) *
				poleFade;
		}
	}

	return mask;
}

function drawMountainField(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	mask: Float32Array,
): void {
	const image = ctx.getImageData(0, 0, width, height);
	const data = image.data;

	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			const m = mask[i];

			if (m <= 0.018) {
				continue;
			}

			const left = mask[i - 1];
			const right = mask[i + 1];
			const up = mask[i - width];
			const down = mask[i + width];

			const slopeX = right - left;
			const slopeY = down - up;

			const light = clamp(
				0.52 +
				-slopeX * 1.05 +
				-slopeY * 0.75,
				0,
				1,
			);

			const px = i * 4;

			const highlandDarken = m * 38;
			const ridgeLight = light * m * 26;

			data[px + 0] = clampByte(
				data[px + 0] -
				highlandDarken +
				ridgeLight * 0.55,
			);

			data[px + 1] = clampByte(
				data[px + 1] -
				highlandDarken * 0.88 +
				ridgeLight * 0.31,
			);

			data[px + 2] = clampByte(
				data[px + 2] -
				highlandDarken * 0.78 +
				ridgeLight * 0.18,
			);
		}
	}

	ctx.putImageData(image, 0, 0);
}

function createVolcanoes(
	rng: () => number,
	width: number,
	height: number,
	mountainMask: Float32Array,
): VolcanoSite[] {
	const volcanoes: VolcanoSite[] = [];
	const count = 4 + Math.floor(rng() * 4);

	for (
		let tries = 0;
		tries < 280 && volcanoes.length < count;
		tries++
	) {
		const x = Math.floor(width * (0.10 + rng() * 0.80));
		const y = Math.floor(height * (0.20 + rng() * 0.60));

		const mountain = mountainMask[y * width + x];

		if (mountain < 0.10 && rng() > 0.16) {
			continue;
		}

		const tooClose = volcanoes.some((volcano) => {
			const dx = volcano.x - x;
			const dy = volcano.y - y;

			return Math.sqrt(dx * dx + dy * dy) < width * 0.095;
		});

		if (tooClose) {
			continue;
		}

		volcanoes.push({
			               x,
			               y,
			               radius: width * (0.024 + rng() * 0.027),
			               calderaRadius: width * (0.0065 + rng() * 0.0105),
			               intensity: 0.58 + rng() * 0.42,
		               });
	}

	return volcanoes;
}

function drawVolcanoes(
	colorCtx: CanvasRenderingContext2D,
	emissiveCtx: CanvasRenderingContext2D,
	volcanoes: VolcanoSite[],
): void {
	for (const volcano of volcanoes) {
		const outer = colorCtx.createRadialGradient(
			volcano.x,
			volcano.y,
			volcano.calderaRadius * 0.25,
			volcano.x,
			volcano.y,
			volcano.radius,
		);

		outer.addColorStop(0.0, `rgba(255, 126, 42, ${0.08 * volcano.intensity})`);
		outer.addColorStop(0.24, `rgba(60, 39, 30, ${0.22 * volcano.intensity})`);
		outer.addColorStop(0.72, `rgba(10, 8, 7, ${0.52 * volcano.intensity})`);
		outer.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

		colorCtx.fillStyle = outer;
		colorCtx.beginPath();
		colorCtx.arc(
			volcano.x,
			volcano.y,
			volcano.radius,
			0,
			Math.PI * 2,
		);
		colorCtx.fill();

		const rimAlpha = 0.24 + volcano.intensity * 0.30;

		colorCtx.strokeStyle = `rgba(255, 105, 32, ${rimAlpha})`;
		colorCtx.lineWidth = Math.max(
			1.4,
			volcano.calderaRadius * 0.18,
		);
		colorCtx.beginPath();
		colorCtx.arc(
			volcano.x,
			volcano.y,
			volcano.calderaRadius,
			0,
			Math.PI * 2,
		);
		colorCtx.stroke();

		const lake = emissiveCtx.createRadialGradient(
			volcano.x,
			volcano.y,
			0,
			volcano.x,
			volcano.y,
			volcano.calderaRadius * 2.25,
		);

		lake.addColorStop(0.0, `rgba(255, 245, 180, ${0.88 * volcano.intensity})`);
		lake.addColorStop(0.20, `rgba(255, 138, 28, ${0.78 * volcano.intensity})`);
		lake.addColorStop(0.54, `rgba(255, 54, 8, ${0.36 * volcano.intensity})`);
		lake.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

		emissiveCtx.fillStyle = lake;
		emissiveCtx.beginPath();
		emissiveCtx.arc(
			volcano.x,
			volcano.y,
			volcano.calderaRadius * 2.25,
			0,
			Math.PI * 2,
		);
		emissiveCtx.fill();

		const hotCore = colorCtx.createRadialGradient(
			volcano.x,
			volcano.y,
			0,
			volcano.x,
			volcano.y,
			volcano.calderaRadius * 1.45,
		);

		hotCore.addColorStop(0.0, `rgba(255, 200, 96, ${0.35 * volcano.intensity})`);
		hotCore.addColorStop(0.45, `rgba(255, 75, 12, ${0.22 * volcano.intensity})`);
		hotCore.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

		colorCtx.fillStyle = hotCore;
		colorCtx.beginPath();
		colorCtx.arc(
			volcano.x,
			volcano.y,
			volcano.calderaRadius * 1.45,
			0,
			Math.PI * 2,
		);
		colorCtx.fill();
	}
}

function createHotspots(
	rng: () => number,
	width: number,
	height: number,
	volcanoes: VolcanoSite[],
): Hotspot[] {
	const count = 4 + Math.floor(rng() * 4);
	const hotspots: Hotspot[] = [];

	for (const volcano of volcanoes) {
		hotspots.push({
			              x: volcano.x,
			              y: volcano.y,
			              radius: volcano.calderaRadius * (0.85 + rng() * 0.55),
			              power: volcano.intensity,
		              });
	}

	for (let i = 0; i < count; i++) {
		hotspots.push({
			              x: width * (0.10 + rng() * 0.80),
			              y: height * (0.22 + rng() * 0.56),
			              radius: width * (0.007 + rng() * 0.013),
			              power: 0.42 + rng() * 0.32,
		              });
	}

	return hotspots;
}

function createCrackNetwork(
	rng: () => number,
	width: number,
	height: number,
	hotspots: Hotspot[],
	volcanoes: VolcanoSite[],
): CrackPath[] {
	const cracks: CrackPath[] = [];

	for (const volcano of volcanoes) {
		const arms = 4 + Math.floor(rng() * 5);

		for (let arm = 0; arm < arms; arm++) {
			const angle =
				      (arm / arms) * Math.PI * 2 +
				      (rng() - 0.5) * 0.75;

			const startX =
				      volcano.x +
				      Math.cos(angle) * volcano.calderaRadius * (0.9 + rng() * 0.35);

			const startY =
				      volcano.y +
				      Math.sin(angle) * volcano.calderaRadius * (0.9 + rng() * 0.35);

			const path = createLocalCrackPath(
				rng,
				width,
				height,
				startX,
				startY,
				angle + (rng() - 0.5) * 0.65,
				6 + Math.floor(rng() * 9),
				width * (0.0040 + rng() * 0.0060),
			);

			if (path.length >= 2) {
				cracks.push({
					            points: path,
					            width: 0.55 + rng() * 1.25,
					            hotness: 0.52 + rng() * 0.36,
				            });
			}
		}
	}

	const allOrigins = [
		...hotspots.map((hotspot) => ({
			x: hotspot.x,
			y: hotspot.y,
			boost: 0.72,
		})),
	];

	for (let i = 0; i < 85; i++) {
		allOrigins.push({
			                x: width * (0.08 + rng() * 0.84),
			                y: height * (0.16 + rng() * 0.68),
			                boost: 0.20 + rng() * 0.42,
		                });
	}

	for (const origin of allOrigins) {
		const arms =
			      origin.boost > 0.65
			      ? 1 + Math.floor(rng() * 3)
			      : 1;

		for (let arm = 0; arm < arms; arm++) {
			const path = createLocalCrackPath(
				rng,
				width,
				height,
				origin.x,
				origin.y,
				rng() * Math.PI * 2,
				4 + Math.floor(rng() * 8),
				width * (0.0032 + rng() * 0.0058) *
				(0.75 + origin.boost * 0.55),
			);

			if (path.length < 2) {
				continue;
			}

			cracks.push({
				            points: path,
				            width:
					            origin.boost > 0.65
					            ? 0.42 + rng() * 1.05
					            : 0.26 + rng() * 0.68,
				            hotness:
					            origin.boost > 0.65
					            ? 0.32 + rng() * 0.32
					            : 0.12 + rng() * 0.24,
			            });

			if (origin.boost > 0.55 && rng() > 0.52) {
				const branchStart =
					      path[
						      Math.floor(
							      path.length * (0.35 + rng() * 0.35),
						      )
						      ];

				if (!branchStart) {
					continue;
				}

				const branchPath = createLocalCrackPath(
					rng,
					width,
					height,
					branchStart.x,
					branchStart.y,
					rng() * Math.PI * 2,
					3 + Math.floor(rng() * 5),
					width * (0.0022 + rng() * 0.0038),
				);

				if (branchPath.length >= 2) {
					cracks.push({
						            points: branchPath,
						            width: 0.22 + rng() * 0.55,
						            hotness: 0.12 + rng() * 0.25,
					            });
				}
			}
		}
	}

	return cracks;
}

function createLocalCrackPath(
	rng: () => number,
	width: number,
	height: number,
	startX: number,
	startY: number,
	startAngle: number,
	steps: number,
	stepLength: number,
): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];

	let x = startX;
	let y = startY;
	let angle = startAngle;

	for (let step = 0; step < steps; step++) {
		if (
			x < width * 0.035 ||
			x > width * 0.965 ||
			y < height * 0.105 ||
			y > height * 0.895
		) {
			break;
		}

		points.push({
			            x,
			            y,
		            });

		angle += (Math.random() - 0.5) * 0.05 + (rng() - 0.5) * 0.92;

		x += Math.cos(angle) * stepLength;
		y += Math.sin(angle) * stepLength * 0.64;
	}

	return points;
}

function drawCrackGlow(
	colorCtx: CanvasRenderingContext2D,
	emissiveCtx: CanvasRenderingContext2D,
	cracks: CrackPath[],
	width: number,
): void {
	for (const crack of cracks) {
		drawLocalPath(
			colorCtx,
			crack.points,
			crack.width * 4.0,
			`rgba(255, 68, 10, ${0.06 * crack.hotness})`,
			'round',
		);

		drawLocalPath(
			colorCtx,
			crack.points,
			crack.width * 1.65,
			`rgba(255, 105, 20, ${0.15 * crack.hotness})`,
			'round',
		);

		drawLocalPath(
			colorCtx,
			crack.points,
			crack.width,
			`rgba(255, 190, 85, ${0.55 * crack.hotness})`,
			'round',
		);

		drawLocalPath(
			emissiveCtx,
			crack.points,
			crack.width * 3.1,
			`rgba(255, 58, 8, ${0.20 * crack.hotness})`,
			'round',
		);

		drawLocalPath(
			emissiveCtx,
			crack.points,
			crack.width * 1.22,
			`rgba(255, 128, 30, ${0.64 * crack.hotness})`,
			'round',
		);

		drawLocalPath(
			emissiveCtx,
			crack.points,
			Math.max(0.38, crack.width * 0.42),
			`rgba(255, 222, 130, ${0.82 * crack.hotness})`,
			'round',
		);
	}
}

function drawHotspots(
	colorCtx: CanvasRenderingContext2D,
	emissiveCtx: CanvasRenderingContext2D,
	hotspots: Hotspot[],
): void {
	for (const hotspot of hotspots) {
		drawHotspot(
			colorCtx,
			hotspot,
			0.42,
		);

		drawHotspot(
			emissiveCtx,
			hotspot,
			0.84,
		);
	}
}

function drawHotspot(
	ctx: CanvasRenderingContext2D,
	hotspot: Hotspot,
	alpha: number,
): void {
	const gradient = ctx.createRadialGradient(
		hotspot.x,
		hotspot.y,
		0,
		hotspot.x,
		hotspot.y,
		hotspot.radius * 2.5,
	);

	gradient.addColorStop(0.0, `rgba(255, 238, 170, ${0.78 * alpha * hotspot.power})`);
	gradient.addColorStop(0.18, `rgba(255, 120, 28, ${0.58 * alpha * hotspot.power})`);
	gradient.addColorStop(0.48, `rgba(255, 45, 8, ${0.24 * alpha * hotspot.power})`);
	gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(
		hotspot.x,
		hotspot.y,
		hotspot.radius * 2.5,
		0,
		Math.PI * 2,
	);
	ctx.fill();
}

function drawFineLavaFilaments(
	colorCtx: CanvasRenderingContext2D,
	emissiveCtx: CanvasRenderingContext2D,
	rng: () => number,
	width: number,
	height: number,
): void {
	for (let i = 0; i < 360; i++) {
		const x = width * (0.06 + rng() * 0.88);
		const y = height * (0.12 + rng() * 0.76);
		const length = 2 + rng() * 11;
		const angle = rng() * Math.PI * 2;

		const x2 = clamp(
			x + Math.cos(angle) * length,
			width * 0.04,
			width * 0.96,
		);

		const y2 = clamp(
			y + Math.sin(angle) * length * 0.65,
			height * 0.10,
			height * 0.90,
		);

		const alpha = 0.035 + rng() * 0.085;

		colorCtx.strokeStyle = `rgba(255, 92, 18, ${alpha})`;
		colorCtx.lineWidth = 0.36 + rng() * 0.64;
		colorCtx.beginPath();
		colorCtx.moveTo(x, y);
		colorCtx.lineTo(x2, y2);
		colorCtx.stroke();

		emissiveCtx.strokeStyle = `rgba(255, 72, 12, ${alpha * 1.55})`;
		emissiveCtx.lineWidth = 0.25 + rng() * 0.44;
		emissiveCtx.beginPath();
		emissiveCtx.moveTo(x, y);
		emissiveCtx.lineTo(x2, y2);
		emissiveCtx.stroke();
	}
}

function drawLocalPath(
	ctx: CanvasRenderingContext2D,
	points: Array<{ x: number; y: number }>,
	lineWidth: number,
	strokeStyle: string,
	lineCap: CanvasLineCap,
): void {
	if (points.length < 2) {
		return;
	}

	ctx.strokeStyle = strokeStyle;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = lineCap;
	ctx.lineJoin = 'round';

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);

	for (let index = 1; index < points.length; index++) {
		const point = points[index];

		ctx.lineTo(point.x, point.y);
	}

	ctx.stroke();
}

function createDisplacedLavaSphereGeometry(
	radius: number,
	seed: number,
	widthSegments: number,
	heightSegments: number,
): THREE.SphereGeometry {
	const geometry = new THREE.SphereGeometry(
		radius,
		widthSegments,
		heightSegments,
	);

	const position = geometry.getAttribute('position');

	for (let index = 0; index < position.count; index++) {
		const x = position.getX(index);
		const y = position.getY(index);
		const z = position.getZ(index);

		const normal = new THREE.Vector3(
			x,
			y,
			z,
		).normalize();

		const height =
			      sampleLavaMountainHeight(
				      normal,
				      seed,
			      );

		const displaced = normal.multiplyScalar(
			radius + height,
		);

		position.setXYZ(
			index,
			displaced.x,
			displaced.y,
			displaced.z,
		);
	}

	position.needsUpdate = true;

	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();

	return geometry;
}

function sampleLavaMountainHeight(
	normal: THREE.Vector3,
	seed: number,
): number {
	const px = normal.x * 2.1 + seed * 0.000013;
	const py = normal.y * 2.1 + seed * 0.000019;
	const pz = normal.z * 2.1 + seed * 0.000023;

	const large =
		      valueNoise3D(
			      px * 1.55,
			      py * 1.55,
			      pz * 1.55,
			      seed + 901,
		      );

	const medium =
		      valueNoise3D(
			      px * 4.20,
			      py * 4.20,
			      pz * 4.20,
			      seed + 1201,
		      );

	const fine =
		      valueNoise3D(
			      px * 10.5,
			      py * 10.5,
			      pz * 10.5,
			      seed + 1601,
		      );

	const ridgeBase =
		      large * 0.54 +
		      medium * 0.34 +
		      fine * 0.12;

	const ridge =
		      Math.pow(
			      clamp(
				      (ridgeBase - 0.48) / 0.52,
				      0,
				      1,
			      ),
			      2.4,
		      );

	const sharp =
		      Math.pow(
			      1 - Math.abs(medium * 2 - 1),
			      2.2,
		      );

	const poleFade =
		      1 -
		      Math.pow(
			      Math.abs(normal.y),
			      8,
		      ) *
		      0.55;

	return (
		       ridge * 0.185 +
		       ridge * sharp * 0.095
	       ) * poleFade;
}

function valueNoise3D(
	x: number,
	y: number,
	z: number,
	seed: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);

	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;

	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const uz = fz * fz * (3 - 2 * fz);

	const c000 = hash3(ix, iy, iz, seed);
	const c100 = hash3(ix + 1, iy, iz, seed);
	const c010 = hash3(ix, iy + 1, iz, seed);
	const c110 = hash3(ix + 1, iy + 1, iz, seed);
	const c001 = hash3(ix, iy, iz + 1, seed);
	const c101 = hash3(ix + 1, iy, iz + 1, seed);
	const c011 = hash3(ix, iy + 1, iz + 1, seed);
	const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

	const x00 = lerp(c000, c100, ux);
	const x10 = lerp(c010, c110, ux);
	const x01 = lerp(c001, c101, ux);
	const x11 = lerp(c011, c111, ux);

	const y0 = lerp(x00, x10, uy);
	const y1 = lerp(x01, x11, uy);

	return lerp(y0, y1, uz);
}

function hash3(
	x: number,
	y: number,
	z: number,
	seed: number,
): number {
	let h = seed >>> 0;

	h ^= Math.imul(x, 374761393);
	h ^= Math.imul(y, 668265263);
	h ^= Math.imul(z, 2147483647);
	h = Math.imul(h ^ (h >>> 13), 1274126177);

	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function texturePointToSphereNormal(
	x: number,
	y: number,
	width: number,
	height: number,
): THREE.Vector3 {
	const u = x / width;
	const v = y / height;

	const phi = u * Math.PI * 2;
	const theta = v * Math.PI;

	return new THREE.Vector3(
		Math.sin(theta) * Math.cos(phi),
		Math.cos(theta),
		Math.sin(theta) * Math.sin(phi),
	).normalize();
}

function orientObjectOnSphere(
	object: THREE.Object3D,
	normal: THREE.Vector3,
	radius: number,
): void {
	object.position.copy(
		normal.clone().multiplyScalar(radius),
	);

	object.quaternion.setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		normal.clone().normalize(),
	);
}

function orientFlatObjectOnSphere(
	object: THREE.Object3D,
	normal: THREE.Vector3,
	radius: number,
): void {
	object.position.copy(
		normal.clone().multiplyScalar(radius),
	);

	object.quaternion.setFromUnitVectors(
		new THREE.Vector3(0, 0, 1),
		normal.clone().normalize(),
	);
}

function shapeShieldVolcanoGeometry(
	geometry: THREE.BufferGeometry,
	flattening: number,
): void {
	const position = geometry.getAttribute('position');

	let minY = Infinity;
	let maxY = -Infinity;

	for (let index = 0; index < position.count; index++) {
		minY = Math.min(
			minY,
			position.getY(index),
		);

		maxY = Math.max(
			maxY,
			position.getY(index),
		);
	}

	const height = Math.max(
		0.0001,
		maxY - minY,
	);

	for (let index = 0; index < position.count; index++) {
		const x = position.getX(index);
		const y = position.getY(index);
		const z = position.getZ(index);

		const t = (y - minY) / height;
		const baseFalloff = Math.pow(
			1 - t,
			1.35,
		);

		const radialNoise =
			      0.96 +
			      Math.sin(index * 12.9898) * 0.020 +
			      Math.sin(index * 4.1231) * 0.014;

		position.setX(
			index,
			x * (0.90 + baseFalloff * 0.12) * radialNoise,
		);

		position.setZ(
			index,
			z * (0.90 + baseFalloff * 0.12) * radialNoise,
		);

		position.setY(
			index,
			y * flattening,
		);
	}

	position.needsUpdate = true;
	geometry.computeVertexNormals();
}

function valueNoise2D(
	x: number,
	y: number,
	seed: number,
): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);

	const fx = x - ix;
	const fy = y - iy;

	const a = hash2(ix, iy, seed);
	const b = hash2(ix + 1, iy, seed);
	const c = hash2(ix, iy + 1, seed);
	const d = hash2(ix + 1, iy + 1, seed);

	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);

	return lerp(
		lerp(a, b, ux),
		lerp(c, d, ux),
		uy,
	);
}

function hash2(
	x: number,
	y: number,
	seed: number,
): number {
	let h = seed >>> 0;

	h ^= Math.imul(x, 374761393);
	h ^= Math.imul(y, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);

	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

function lerp(
	a: number,
	b: number,
	t: number,
): number {
	return a + (b - a) * t;
}

function clamp(
	value: number,
	min: number,
	max: number,
): number {
	return Math.min(
		max,
		Math.max(min, value),
	);
}

function clampByte(value: number): number {
	return Math.max(
		0,
		Math.min(
			255,
			Math.round(value),
		),
	);
}

function smoothstep01(
	value: number,
	edge0: number,
	edge1: number,
): number {
	const t = clamp(
		(value - edge0) / (edge1 - edge0),
		0,
		1,
	);

	return t * t * (3 - 2 * t);
}

function disposeMaterial(
	material: THREE.Material | THREE.Material[],
): void {
	if (Array.isArray(material)) {
		for (const item of material) {
			item.dispose();
		}

		return;
	}

	material.dispose();
}
