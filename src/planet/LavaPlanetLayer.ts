import * as THREE from 'three';

export type LavaPlanetLayerOptions = {
	radius: number;
	seed: number;
};

/**
 * Phase 7c.2 clean:
 *
 * Dedicated lava planet renderer.
 *
 * This intentionally bypasses the normal biome/CubeSphere material path.
 * Reason: lava is not an earthlike biome tint. It is a different surface
 * renderer: dark basalt crust + emissive magma cracks + hotspots.
 *
 * It uses standard Three materials + generated canvas textures, so it works
 * reliably in WebGPU/WebGL without TSL shader surgery.
 */
export class LavaPlanetLayer {
	public readonly group: THREE.Group;

	private readonly surfaceMesh: THREE.Mesh;
	private readonly glowShell: THREE.Mesh;
	private readonly texture: THREE.CanvasTexture;
	private readonly emissiveTexture: THREE.CanvasTexture;

	constructor(
		private readonly options: LavaPlanetLayerOptions,
	) {
		this.group      = new THREE.Group();
		this.group.name = 'LavaPlanetLayer';

		const textureSet = createLavaTextureSet(
			options.seed,
			2048,
			1024,
		);

		this.texture         = textureSet.colorTexture;
		this.emissiveTexture = textureSet.emissiveTexture;

		this.surfaceMesh = this.createSurfaceMesh();
		this.glowShell   = this.createGlowShell();

		this.group.add(this.surfaceMesh);
		this.group.add(this.glowShell);
	}

	update(deltaSeconds: number): void {
		this.surfaceMesh.rotation.y += deltaSeconds * 0.00008;
		this.glowShell.rotation.y -= deltaSeconds * 0.00004;
	}

	dispose(): void {
		this.surfaceMesh.geometry.dispose();
		this.glowShell.geometry.dispose();

		disposeMaterial(this.surfaceMesh.material);
		disposeMaterial(this.glowShell.material);

		this.texture.dispose();
		this.emissiveTexture.dispose();
	}

	private createSurfaceMesh(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius,
			192,
			128,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                map: this.texture,
			                                                emissiveMap: this.emissiveTexture,
			                                                emissive: new THREE.Color(0xff5a12),
			                                                emissiveIntensity: 1.85,
			                                                roughness: 0.92,
			                                                metalness: 0.02,
		                                                });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name        = 'LavaPlanetSurface';
		mesh.renderOrder = 1;

		return mesh;
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
			                                             opacity: 0.085,
			                                             side: THREE.BackSide,
			                                             depthWrite: false,
			                                             depthTest: true,
			                                             blending: THREE.AdditiveBlending,
		                                             });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name        = 'LavaPlanetGlowShell';
		mesh.renderOrder = 3;

		return mesh;
	}
}

type LavaTextureSet = {
	colorTexture: THREE.CanvasTexture;
	emissiveTexture: THREE.CanvasTexture;
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

function createLavaTextureSet(
	seed: number,
	width: number,
	height: number,
): LavaTextureSet {
	const colorCanvas    = document.createElement('canvas');
	const emissiveCanvas = document.createElement('canvas');

	colorCanvas.width  = width;
	colorCanvas.height = height;

	emissiveCanvas.width  = width;
	emissiveCanvas.height = height;

	const colorCtx    = colorCanvas.getContext('2d');
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

	emissiveCtx.fillStyle = 'rgb(0, 0, 0)';
	emissiveCtx.fillRect(0, 0, width, height);

	const hotspots = createHotspots(
		rng,
		width,
		height,
	);

	const cracks = createCrackNetwork(
		rng,
		width,
		height,
		hotspots,
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

	const colorTexture    = new THREE.CanvasTexture(colorCanvas);
	const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);

	colorTexture.name    = 'GeneratedLavaColorTexture';
	emissiveTexture.name = 'GeneratedLavaEmissiveTexture';

	colorTexture.colorSpace    = THREE.SRGBColorSpace;
	emissiveTexture.colorSpace = THREE.SRGBColorSpace;

	colorTexture.wrapS = THREE.RepeatWrapping;
	colorTexture.wrapT = THREE.ClampToEdgeWrapping;

	emissiveTexture.wrapS = THREE.RepeatWrapping;
	emissiveTexture.wrapT = THREE.ClampToEdgeWrapping;

	colorTexture.needsUpdate    = true;
	emissiveTexture.needsUpdate = true;

	return {
		colorTexture,
		emissiveTexture,
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
				      10 +
				      ash * 34 *
				      latitudeShade;

			data[index + 0] = base * 0.96;
			data[index + 1] = base * 0.73;
			data[index + 2] = base * 0.58;
			data[index + 3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);

	ctx.globalAlpha = 0.18;

	for (let i = 0; i < 1300; i++) {
		const x = rng() * width;
		const y = rng() * height;
		const r = 1 + rng() * 9;

		ctx.fillStyle =
			rng() > 0.5
			? 'rgb(45, 35, 28)'
			: 'rgb(7, 6, 5)';

		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.globalAlpha = 1;
}

function createHotspots(
	rng: () => number,
	width: number,
	height: number,
): Hotspot[] {
	const count               = 8 + Math.floor(rng() * 7);
	const hotspots: Hotspot[] = [];

	for (let i = 0; i < count; i++) {
		hotspots.push({
			              x: rng() * width,
			              y: height * (0.16 + rng() * 0.68),
			              radius: width * (0.018 + rng() * 0.034),
			              power: 0.65 + rng() * 0.55,
		              });
	}

	return hotspots;
}

function createCrackNetwork(
	rng: () => number,
	width: number,
	height: number,
	hotspots: Hotspot[],
): CrackPath[] {
	const cracks: CrackPath[] = [];

	for (const hotspot of hotspots) {
		const arms = 3 + Math.floor(rng() * 5);

		for (let arm = 0; arm < arms; arm++) {
			const points: Array<{ x: number; y: number }> = [];

			let x = hotspot.x;
			let y = hotspot.y;

			let angle    = rng() * Math.PI * 2;
			const length =
				      width *
				      (0.08 + rng() * 0.19);

			const steps = 9 + Math.floor(rng() * 15);

			for (let step = 0; step < steps; step++) {
				const t = step / Math.max(1, steps - 1);

				points.push({
					            x: wrapX(x, width),
					            y: clamp(y, 0, height),
				            });

				angle += (rng() - 0.5) * 0.85;

				x += Math.cos(angle) * length / steps;
				y += Math.sin(angle) * length / steps * 0.72;

				y += Math.sin(t * Math.PI * 2 + rng() * 2) * height * 0.006;
			}

			cracks.push({
				            points,
				            width: 1.0 + rng() * 2.8,
				            hotness: 0.65 + rng() * 0.55,
			            });

			const branchCount = rng() > 0.45 ? 1 + Math.floor(rng() * 3) : 0;

			for (let branch = 0; branch < branchCount; branch++) {
				const branchStart =
					      points[
						      Math.floor(
							      points.length * (0.25 + rng() * 0.55),
						      )
						      ];

				if (!branchStart) {
					continue;
				}

				const branchPoints: Array<{ x: number; y: number }> = [];
				let bx                                              = branchStart.x;
				let by                                              = branchStart.y;
				let bAngle                                          = angle + (rng() - 0.5) * Math.PI;

				const branchSteps  = 4 + Math.floor(rng() * 7);
				const branchLength = length * (0.20 + rng() * 0.42);

				for (let step = 0; step < branchSteps; step++) {
					branchPoints.push({
						                  x: wrapX(bx, width),
						                  y: clamp(by, 0, height),
					                  });

					bAngle += (rng() - 0.5) * 0.95;
					bx += Math.cos(bAngle) * branchLength / branchSteps;
					by += Math.sin(bAngle) * branchLength / branchSteps * 0.72;
				}

				cracks.push({
					            points: branchPoints,
					            width: 0.65 + rng() * 1.55,
					            hotness: 0.45 + rng() * 0.40,
				            });
			}
		}
	}

	for (let i = 0; i < 90; i++) {
		const points: Array<{ x: number; y: number }> = [];

		let x     = rng() * width;
		let y     = height * (0.12 + rng() * 0.76);
		let angle = rng() * Math.PI * 2;

		const steps  = 3 + Math.floor(rng() * 7);
		const length = width * (0.018 + rng() * 0.065);

		for (let step = 0; step < steps; step++) {
			points.push({
				            x: wrapX(x, width),
				            y: clamp(y, 0, height),
			            });

			angle += (rng() - 0.5) * 0.8;
			x += Math.cos(angle) * length / steps;
			y += Math.sin(angle) * length / steps * 0.75;
		}

		cracks.push({
			            points,
			            width: 0.45 + rng() * 1.05,
			            hotness: 0.25 + rng() * 0.35,
		            });
	}

	return cracks;
}

function drawCrackGlow(
	colorCtx: CanvasRenderingContext2D,
	emissiveCtx: CanvasRenderingContext2D,
	cracks: CrackPath[],
	width: number,
): void {
	for (const crack of cracks) {
		drawWrappedPath(
			colorCtx,
			crack.points,
			width,
			crack.width * 8.0,
			`rgba(255, 68, 10, ${0.10 * crack.hotness})`,
			'round',
		);

		drawWrappedPath(
			colorCtx,
			crack.points,
			width,
			crack.width * 3.2,
			`rgba(255, 105, 20, ${0.22 * crack.hotness})`,
			'round',
		);

		drawWrappedPath(
			colorCtx,
			crack.points,
			width,
			crack.width,
			`rgba(255, 218, 110, ${0.78 * crack.hotness})`,
			'round',
		);

		drawWrappedPath(
			emissiveCtx,
			crack.points,
			width,
			crack.width * 7.0,
			`rgba(255, 58, 8, ${0.22 * crack.hotness})`,
			'round',
		);

		drawWrappedPath(
			emissiveCtx,
			crack.points,
			width,
			crack.width * 2.4,
			`rgba(255, 135, 35, ${0.72 * crack.hotness})`,
			'round',
		);

		drawWrappedPath(
			emissiveCtx,
			crack.points,
			width,
			Math.max(0.75, crack.width * 0.78),
			`rgba(255, 230, 140, ${0.92 * crack.hotness})`,
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
			0.55,
		);

		drawHotspot(
			emissiveCtx,
			hotspot,
			1.0,
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
		hotspot.radius * 2.8,
	);

	gradient.addColorStop(0.0, `rgba(255, 238, 170, ${0.85 * alpha * hotspot.power})`);
	gradient.addColorStop(0.18, `rgba(255, 120, 28, ${0.68 * alpha * hotspot.power})`);
	gradient.addColorStop(0.48, `rgba(255, 45, 8, ${0.26 * alpha * hotspot.power})`);
	gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(
		hotspot.x,
		hotspot.y,
		hotspot.radius * 2.8,
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
	for (let i = 0; i < 650; i++) {
		const x      = rng() * width;
		const y      = rng() * height;
		const length = 4 + rng() * 26;
		const angle  = rng() * Math.PI * 2;

		const x2 = wrapX(x + Math.cos(angle) * length, width);
		const y2 = clamp(y + Math.sin(angle) * length * 0.65, 0, height);

		const alpha = 0.04 + rng() * 0.10;

		colorCtx.strokeStyle = `rgba(255, 92, 18, ${alpha})`;
		colorCtx.lineWidth   = 0.45 + rng() * 0.75;
		colorCtx.beginPath();
		colorCtx.moveTo(x, y);
		colorCtx.lineTo(x2, y2);
		colorCtx.stroke();

		emissiveCtx.strokeStyle = `rgba(255, 72, 12, ${alpha * 1.8})`;
		emissiveCtx.lineWidth   = 0.35 + rng() * 0.55;
		emissiveCtx.beginPath();
		emissiveCtx.moveTo(x, y);
		emissiveCtx.lineTo(x2, y2);
		emissiveCtx.stroke();
	}
}

function drawWrappedPath(
	ctx: CanvasRenderingContext2D,
	points: Array<{ x: number; y: number }>,
	width: number,
	lineWidth: number,
	strokeStyle: string,
	lineCap: CanvasLineCap,
): void {
	drawPath(
		ctx,
		points,
		lineWidth,
		strokeStyle,
		lineCap,
	);

	const crossesLeft  = points.some((point) => point.x < width * 0.08);
	const crossesRight = points.some((point) => point.x > width * 0.92);

	if (crossesLeft) {
		drawPath(
			ctx,
			points.map((point) => ({
				x: point.x + width,
				y: point.y,
			})),
			lineWidth,
			strokeStyle,
			lineCap,
		);
	}

	if (crossesRight) {
		drawPath(
			ctx,
			points.map((point) => ({
				x: point.x - width,
				y: point.y,
			})),
			lineWidth,
			strokeStyle,
			lineCap,
		);
	}
}

function drawPath(
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
	ctx.lineWidth   = lineWidth;
	ctx.lineCap     = lineCap;
	ctx.lineJoin    = 'round';

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);

	for (let index = 1; index < points.length; index++) {
		const point = points[index];

		ctx.lineTo(point.x, point.y);
	}

	ctx.stroke();
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

function wrapX(
	x: number,
	width: number,
): number {
	return ((x % width) + width) % width;
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
