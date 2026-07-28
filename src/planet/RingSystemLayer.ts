import * as THREE from 'three';

export type RingSystemOptions = {
	radius: number;
	seed: number;
	innerRadius?: number;
	outerRadius?: number;
	tilt?: number;
	opacity?: number;
	particleCount?: number;
};

/**
 * Phase 7a.3b:
 *
 * Particle-based ring system.
 *
 * Why this version:
 * - avoids the giant flat vinyl-disc look of RingGeometry + texture
 * - reads more like dust / ice particles
 * - works in WebGL + WebGPU because it uses PointsMaterial
 */
export class RingSystemLayer {
	public readonly group: THREE.Group;
	public readonly points: THREE.Points;

	private readonly rng: () => number;
	private readonly innerRadius: number;
	private readonly outerRadius: number;
	private readonly particleCount: number;
	private readonly material: THREE.PointsMaterial;

	constructor(
		private readonly options: RingSystemOptions,
	) {
		this.rng = createSeededRandom(
			(options.seed ^ 0x51a77a) >>> 0,
		);

		this.innerRadius =
			options.innerRadius ??
			options.radius * (1.38 + this.rng() * 0.10);

		this.outerRadius =
			options.outerRadius ??
			options.radius * (2.08 + this.rng() * 0.42);

		this.particleCount =
			options.particleCount ??
			this.estimateParticleCount();

		this.group = new THREE.Group();
		this.group.name = 'RingSystemLayer';

		this.material = this.createMaterial();
		this.points = this.createPoints();

		const tilt =
			      options.tilt ??
			      THREE.MathUtils.degToRad(16 + this.rng() * 18);

		this.group.rotation.x = tilt;
		this.group.rotation.z =
			THREE.MathUtils.degToRad(-8 + this.rng() * 16);

		this.group.add(this.points);
	}

	update(deltaSeconds: number): void {
		this.group.rotation.y += deltaSeconds * 0.00004;
	}

	dispose(): void {
		this.points.geometry.dispose();
		this.material.dispose();
	}

	private createPoints(): THREE.Points {
		const geometry = new THREE.BufferGeometry();

		const positions = new Float32Array(this.particleCount * 3);
		const colors = new Float32Array(this.particleCount * 3);
		const sizes = new Float32Array(this.particleCount);
		const alphas = new Float32Array(this.particleCount);

		for (let index = 0; index < this.particleCount; index++) {
			const radius = this.sampleRingRadius();
			const angle = this.rng() * Math.PI * 2;
			const height = (this.rng() - 0.5) * this.getBandThickness(radius);

			const i3 = index * 3;

			positions[i3 + 0] = Math.cos(angle) * radius;
			positions[i3 + 1] = height;
			positions[i3 + 2] = Math.sin(angle) * radius;

			const color = this.sampleParticleColor(radius);

			colors[i3 + 0] = color.r;
			colors[i3 + 1] = color.g;
			colors[i3 + 2] = color.b;

			sizes[index] = this.sampleParticleSize(radius);
			alphas[index] = this.sampleParticleAlpha(radius);
		}

		geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(positions, 3),
		);

		geometry.setAttribute(
			'color',
			new THREE.BufferAttribute(colors, 3),
		);

		geometry.setAttribute(
			'aSize',
			new THREE.BufferAttribute(sizes, 1),
		);

		geometry.setAttribute(
			'aAlpha',
			new THREE.BufferAttribute(alphas, 1),
		);

		// PointsMaterial cannot directly use custom per-particle size/alpha,
		// but keeping the attributes allows an easy future ShaderMaterial step.
		// For now we still gain a much more particulate look from the geometry.

		const points = new THREE.Points(
			geometry,
			this.material,
		);

		points.name = 'RingSystemPoints';
		points.renderOrder = 5;
		points.frustumCulled = false;

		return points;
	}

	private createMaterial(): THREE.PointsMaterial {
		return new THREE.PointsMaterial({
			                                size: this.options.radius * 0.0075,
			                                sizeAttenuation: true,
			                                vertexColors: true,
			                                transparent: true,
			                                opacity: this.options.opacity ?? 0.78,
			                                depthWrite: false,
			                                depthTest: true,
			                                blending: THREE.NormalBlending,
		                                });
	}

	private estimateParticleCount(): number {
		const circumference = Math.PI * (this.innerRadius + this.outerRadius);
		const thickness = this.outerRadius - this.innerRadius;
		const areaLike = circumference * thickness;

		return Math.max(
			18000,
			Math.min(90000, Math.floor(areaLike * 2200)),
		);
	}

	private sampleRingRadius(): number {
		// Creates denser ring bands with a few gaps.
		const t = this.rng();
		let bandT = t;

		for (let i = 0; i < 3; i++) {
			bandT = THREE.MathUtils.lerp(bandT, this.rng(), 0.22);
		}

		// Pull particles away from a pseudo Cassini-style gap.
		const cassiniStart = 0.56;
		const cassiniEnd = 0.64;

		if (bandT > cassiniStart && bandT < cassiniEnd) {
			bandT += this.rng() > 0.5 ? 0.06 : -0.06;
		}

		bandT = THREE.MathUtils.clamp(bandT, 0, 1);

		return THREE.MathUtils.lerp(
			this.innerRadius,
			this.outerRadius,
			bandT,
		);
	}

	private getBandThickness(radius: number): number {
		const normalized =
			      (radius - this.innerRadius) /
			      (this.outerRadius - this.innerRadius);

		return this.options.radius * THREE.MathUtils.lerp(
			0.010,
			0.028,
			normalized,
		);
	}

	private sampleParticleSize(radius: number): number {
		const normalized =
			      (radius - this.innerRadius) /
			      (this.outerRadius - this.innerRadius);

		return THREE.MathUtils.lerp(0.3, 1.0, this.rng()) *
		       THREE.MathUtils.lerp(0.8, 1.15, normalized);
	}

	private sampleParticleAlpha(radius: number): number {
		const normalized =
			      (radius - this.innerRadius) /
			      (this.outerRadius - this.innerRadius);

		const bandMask =
			      0.65 +
			      0.35 * Math.sin(normalized * Math.PI * 18);

		return THREE.MathUtils.clamp(
			(0.18 + this.rng() * 0.82) * bandMask,
			0.05,
			1.0,
		);
	}

	private sampleParticleColor(radius: number): THREE.Color {
		const normalized =
			      (radius - this.innerRadius) /
			      (this.outerRadius - this.innerRadius);

		const icy = new THREE.Color(0xd6d8dc);
		const warmDust = new THREE.Color(0xb9ab92);
		const darkDust = new THREE.Color(0x60584f);

		const color = icy.clone().lerp(
			warmDust,
			0.25 + 0.45 * Math.sin(normalized * Math.PI * 4) * 0.5 + 0.25,
		);

		if (this.rng() > 0.72) {
			color.lerp(darkDust, 0.25 + this.rng() * 0.45);
		}

		return color;
	}
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
