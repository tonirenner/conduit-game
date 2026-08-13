import * as THREE from 'three';

export type MoonSystemLayerOptions = {
	radius: number;
	seed: number;
	moonCount: number;
	parentKind?: string;
};

/**
 * Phase 7b.1:
 *
 * Seeded lightweight moon renderer.
 *
 * It renders only the most visible moons from PlanetDefinition.moons.
 * The HUD can still show the full generated moon count.
 */
export class MoonSystemLayer {
	public readonly group: THREE.Group;

	private readonly rng: () => number;
	private readonly moonEntries: MoonEntry[] = [];

	constructor(
		private readonly options: MoonSystemLayerOptions,
	) {
		this.rng = createSeededRandom(
			(options.seed ^ 0x6d00f1) >>> 0,
		);

		this.group = new THREE.Group();
		this.group.name = 'MoonSystemLayer';

		this.createMoons();
	}

	update(deltaSeconds: number): void {
		for (const entry of this.moonEntries) {
			entry.orbitGroup.rotation.y +=
				deltaSeconds * entry.orbitSpeed;

			entry.orbitGroup.rotation.z +=
				deltaSeconds * entry.precessionSpeed;

			entry.moon.rotation.y +=
				deltaSeconds * entry.spinSpeed;
		}
	}

	dispose(): void {
		for (const entry of this.moonEntries) {
			entry.moon.geometry.dispose();

			const moonMaterial = entry.moon.material;

			if (Array.isArray(moonMaterial)) {
				for (const item of moonMaterial) {
					item.dispose();
				}
			} else {
				moonMaterial.dispose();
			}

			entry.orbitLine.geometry.dispose();

			const orbitMaterial = entry.orbitLine.material;

			if (Array.isArray(orbitMaterial)) {
				for (const item of orbitMaterial) {
					item.dispose();
				}
			} else {
				orbitMaterial.dispose();
			}
		}
	}

	private createMoons(): void {
		if (this.options.moonCount <= 0) {
			return;
		}

		const visibleMoonCount = Math.min(
			this.options.parentKind === 'gas_giant' ||
			this.options.parentKind === 'ice_giant'
			? 5
			: 3,
			this.options.moonCount,
		);

		for (let index = 0; index < visibleMoonCount; index++) {
			const orbitRadius =
				      this.options.radius *
				      (
					      2.65 +
					      index * 0.72 +
					      this.rng() * 0.45
				      );

			const moonRadius =
				      this.options.radius *
				      (
					      this.options.parentKind === 'gas_giant' ||
					      this.options.parentKind === 'ice_giant'
					      ? 0.045 + this.rng() * 0.045
					      : 0.055 + this.rng() * 0.060
				      ) *
				      (index === 0 ? 1.25 : 1.0);

			const orbitTilt =
				      THREE.MathUtils.degToRad(
					      -18 + this.rng() * 36,
				      );

			const orbitPhase =
				      this.rng() * Math.PI * 2;

			const orbitGroup = new THREE.Group();

			orbitGroup.name = `MoonOrbit_${index}`;
			orbitGroup.rotation.x = orbitTilt;
			orbitGroup.rotation.z =
				THREE.MathUtils.degToRad(
					-10 + this.rng() * 20,
				);

			const moon = this.createMoonMesh(
				index,
				moonRadius,
			);

			moon.position.set(
				Math.cos(orbitPhase) * orbitRadius,
				0,
				Math.sin(orbitPhase) * orbitRadius,
			);

			const orbitLine = this.createOrbitLine(
				index,
				orbitRadius,
			);

			orbitGroup.add(orbitLine);
			orbitGroup.add(moon);

			this.group.add(orbitGroup);

			this.moonEntries.push({
				                      orbitGroup,
				                      orbitLine,
				                      moon,
				                      orbitSpeed:
					                      (0.00008 + this.rng() * 0.00012) /
					                      (index + 1),
				                      precessionSpeed:
					                      (0.000004 + this.rng() * 0.000006) *
					                      (index % 2 === 0 ? 1 : -1),
				                      spinSpeed:
					                      0.0004 + this.rng() * 0.0004,
			                      });
		}
	}

	private createMoonMesh(
		index: number,
		radius: number,
	): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			radius,
			48,
			28,
		);

		const material = new THREE.MeshStandardMaterial({
			                                                color: this.sampleMoonColor(index),
			                                                roughness: 0.92,
			                                                metalness: 0.0,
			                                                emissive: new THREE.Color(0x050505),
			                                                emissiveIntensity: 0.12,
		                                                });

		const moon = new THREE.Mesh(
			geometry,
			material,
		);

		moon.name = `Moon_${index}`;
		moon.renderOrder = 3;

		return moon;
	}

	private createOrbitLine(
		index: number,
		orbitRadius: number,
	): THREE.Line {
		const segments = 192;
		const positions = new Float32Array((segments + 1) * 3);

		for (let segment = 0; segment <= segments; segment++) {
			const angle =
				      (segment / segments) *
				      Math.PI *
				      2;

			const i3 = segment * 3;

			positions[i3 + 0] = Math.cos(angle) * orbitRadius;
			positions[i3 + 1] = 0;
			positions[i3 + 2] = Math.sin(angle) * orbitRadius;
		}

		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(positions, 3),
		);

		const material = new THREE.LineBasicMaterial({
			                                             color: 0x9eb8d8,
			                                             transparent: true,
			                                             opacity: Math.max(0.035, 0.08 - index * 0.01),
			                                             depthWrite: false,
			                                             depthTest: true,
		                                             });

		const line = new THREE.Line(
			geometry,
			material,
		);

		line.name = `MoonOrbitLine_${index}`;
		line.renderOrder = 1;

		return line;
	}

	private sampleMoonColor(index: number): THREE.Color {
		const palettes = [
			new THREE.Color(0xb8b5aa),
			new THREE.Color(0x8d8a82),
			new THREE.Color(0xc7b99c),
			new THREE.Color(0xa8b7c4),
			new THREE.Color(0x6f6a62),
		];

		const color =
			      palettes[index % palettes.length].clone();

		color.multiplyScalar(
			0.82 + this.rng() * 0.34,
		);

		return color;
	}
}

type MoonEntry = {
	orbitGroup: THREE.Group;
	orbitLine: THREE.Line;
	moon: THREE.Mesh;
	orbitSpeed: number;
	precessionSpeed: number;
	spinSpeed: number;
};

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
