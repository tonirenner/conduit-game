import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, vertexColor } from 'three/tsl';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { noise3d } from '../../terrain/noise';

export type SurfaceTerrainMaterialInput = {
	direction: THREE.Vector3;
	detailOffset: THREE.Vector3;
	height: number;
	landMask: number;
	mountainMask: number;
	erosionMask: number;
	riverMask: number;
	isWater: boolean;
	slope: number;
};

export type SurfaceTerrainMaterialSample = {
	color: THREE.Color;
	roughness: number;
	metalness: number;
	emissive: THREE.Color;
};

/**
 * Surface material evaluation shared by the new clipmap renderer.
 *
 * This intentionally reuses the material semantics of the existing
 * PlanetSurfaceNodeMaterial (class palettes, basalt/lava, ice, water, dry/rock
 * separation) without reintroducing its legacy terrain/displacement path.
 * Geometry, collision and landing remain owned by PlanetTerrainSampler.
 */
export function evaluateSurfaceTerrainMaterial(
	definition: PlanetDefinition,
	input: SurfaceTerrainMaterialInput,
	targetColor = new THREE.Color(),
	targetEmissive = new THREE.Color(),
): SurfaceTerrainMaterialSample {
	const land = THREE.MathUtils.clamp(input.landMask, 0, 1);
	const mountain = THREE.MathUtils.clamp(input.mountainMask, 0, 1);
	const erosion = THREE.MathUtils.clamp(input.erosionMask, 0, 1);
	const river = THREE.MathUtils.clamp(input.riverMask, 0, 1);
	const height = THREE.MathUtils.clamp(input.height, 0, 1);
	const slope = THREE.MathUtils.clamp(input.slope, 0, 1);
	const detail = getMaterialDetail(input.direction, input.detailOffset);

	targetEmissive.setRGB(0, 0, 0);

	if (input.isWater) {
		const shallow = smoothstep(0.28, 0.72, land);
		targetColor
			.set(0x071f2f)
			.lerp(new THREE.Color(0x155463), shallow)
			.multiplyScalar(THREE.MathUtils.lerp(0.94, 1.06, detail.medium));
		return {
			color: targetColor,
			roughness: THREE.MathUtils.clamp(0.28 + detail.fineSigned * 0.05, 0.20, 0.38),
			metalness: 0,
			emissive: targetEmissive,
		};
	}

	const material = getClassMaterial(definition.class);
	const elevation = smoothstep(0.01, 0.22, height);
	const rockMask = THREE.MathUtils.clamp(
		mountain * 0.62 + erosion * 0.24 + slope * 0.42,
		0,
		0.92,
	);
	const dryDetail = smoothstep(0.54, 0.82, detail.medium) * (1 - rockMask * 0.45);
	const cavity = THREE.MathUtils.clamp(
		erosion * 0.16 + river * 0.22 + Math.max(0, -detail.fineSigned) * 0.08,
		0,
		0.28,
	);

	targetColor.copy(material.low).lerp(material.high, elevation);
	targetColor.lerp(material.rock, rockMask);
	targetColor.lerp(material.accent, dryDetail * material.accentStrength);

	if (definition.class === 'terrestrial' || definition.class === 'ocean') {
		const vegetation = smoothstep(0.58, 0.82, land) *
			(1 - rockMask) *
			smoothstep(0.36, 0.70, detail.large);
		targetColor.lerp(material.accent, vegetation * 0.30);
	}

	if (definition.class === 'ice') {
		const iceBright = smoothstep(0.16, 0.78, mountain + elevation * 0.75);
		targetColor.lerp(new THREE.Color(0xfbfdff), iceBright * 0.42);
		const crack = smoothstep(0.70, 0.92, detail.ridgeFine) * (0.35 + erosion * 0.65);
		targetColor.lerp(new THREE.Color(0x1b5f82), crack * 0.34);
	}

	let roughness = material.roughness;
	let metalness = material.metalness;

	if (definition.class === 'lava') {
		// Same visual intent as the existing PlanetSurfaceNodeMaterial:
		// dark basalt owns the surface, while deterministic ridge/hotspot masks
		// expose hot material. These are shading-only and never affect geometry.
		const crack = smoothstep(0.72, 0.93, detail.ridgeFine) *
			THREE.MathUtils.clamp(0.40 + erosion * 0.35 + mountain * 0.25, 0, 1);
		const hotspot = smoothstep(0.78, 0.96, detail.ridgeMedium) *
			THREE.MathUtils.clamp(mountain * 0.46 + erosion * 0.34 + elevation * 0.28, 0, 1);
		const heat = THREE.MathUtils.clamp(crack * 0.68 + hotspot, 0, 1);

		targetColor
			.set(0x040302)
			.lerp(new THREE.Color(0x180d09), elevation * 0.55 + rockMask * 0.20)
			.lerp(new THREE.Color(0x4a1308), heat * 0.22);
		targetEmissive
			.set(0xff2a05)
			.lerp(new THREE.Color(0xffb743), smoothstep(0.32, 0.92, heat))
			.multiplyScalar(heat * 2.4);
		roughness = THREE.MathUtils.lerp(0.92, 0.58, heat);
		metalness = 0.02;
	}

	if (river > 0.01 && definition.class !== 'lava') {
		targetColor.multiplyScalar(THREE.MathUtils.lerp(1, 0.76, river * 0.58));
		roughness = THREE.MathUtils.lerp(roughness, 0.58, river * 0.35);
	}

	// Small-scale material variation comes from the old procedural-detail idea.
	// It is intentionally subtle so it reads as surface structure rather than
	// changing the canonical terrain silhouette.
	targetColor.multiplyScalar(
		THREE.MathUtils.clamp(
			1 + detail.fineSigned * material.albedoVariation - cavity,
			0.62,
			1.18,
		),
	);
	roughness = THREE.MathUtils.clamp(
		roughness + detail.fineSigned * 0.045 + cavity * 0.10 - slope * 0.08,
		0.18,
		0.99,
	);

	return {
		color: targetColor,
		roughness,
		metalness,
		emissive: targetEmissive,
	};
}

/**
 * Node material for the indexed SurfaceView clipmap.
 * Geometry supplies color/roughness/metalness/emissive attributes generated by
 * evaluateSurfaceTerrainMaterial(). The normal attribute remains the canonical
 * terrain normal plus the existing shading-only micro relief.
 */
export function createSurfaceTerrainNodeMaterial(): any {
	const material = new MeshStandardNodeMaterial({
		transparent: true,
		opacity: 0,
		depthTest: true,
		depthWrite: false,
	});
	material.vertexColors = true;
	material.colorNode = vertexColor().toVec3();
	material.roughnessNode = attribute('terrainRoughness', 'float');
	material.metalnessNode = attribute('terrainMetalness', 'float');
	material.emissiveNode = attribute('terrainEmissive', 'vec3');
	return material;
}

type ClassMaterial = {
	low: THREE.Color;
	high: THREE.Color;
	accent: THREE.Color;
	rock: THREE.Color;
	roughness: number;
	metalness: number;
	accentStrength: number;
	albedoVariation: number;
};

function getClassMaterial(planetClass: PlanetClass): ClassMaterial {
	switch (planetClass) {
		case 'desert':
			return material(0x9c5e32, 0xe4b763, 0xc78b43, 0x714025, 0.94, 0.0, 0.20, 0.055);
		case 'ice':
			return material(0x89b5c8, 0xe8f6fb, 0xc7e3ea, 0x678096, 0.38, 0.0, 0.12, 0.025);
		case 'lava':
			return material(0x040302, 0x130c09, 0xff5a12, 0x0b0705, 0.92, 0.02, 0.0, 0.025);
		case 'toxic':
			return material(0x526f68, 0xa6b6aa, 0x71803d, 0x3f422d, 0.82, 0.0, 0.18, 0.045);
		case 'carbon':
			return material(0x242424, 0x55514b, 0x3c3a36, 0x171717, 0.76, 0.06, 0.10, 0.055);
		case 'metal_rich':
			return material(0x4a4038, 0x8c7864, 0x69594c, 0x403831, 0.62, 0.24, 0.12, 0.045);
		case 'barren':
			return material(0x41392f, 0x9c8767, 0xb7a88a, 0x50483f, 0.86, 0.0, 0.12, 0.05);
		case 'rocky':
			return material(0x3f403c, 0x9c957f, 0xc4b899, 0x433c36, 0.80, 0.0, 0.10, 0.05);
		case 'terrestrial':
			return material(0x315d35, 0x716a4e, 0x496844, 0x69675b, 0.83, 0.0, 0.28, 0.045);
		case 'ocean':
			return material(0x1f6a46, 0x8ca05a, 0x4d6f52, 0x5a5548, 0.78, 0.0, 0.22, 0.04);
		default:
			return material(0x625548, 0xa48e73, 0x786858, 0x51483f, 0.84, 0.0, 0.10, 0.045);
	}
}

function material(
	low: number,
	high: number,
	accent: number,
	rock: number,
	roughness: number,
	metalness: number,
	accentStrength: number,
	albedoVariation: number,
): ClassMaterial {
	return {
		low: new THREE.Color(low),
		high: new THREE.Color(high),
		accent: new THREE.Color(accent),
		rock: new THREE.Color(rock),
		roughness,
		metalness,
		accentStrength,
		albedoVariation,
	};
}

function getMaterialDetail(direction: THREE.Vector3, offset: THREE.Vector3) {
	const large = noise3d(
		direction.x * 9 + offset.x * 0.73,
		direction.y * 9 + offset.y * 0.73,
		direction.z * 9 + offset.z * 0.73,
	);
	const medium = noise3d(
		direction.x * 22 + offset.x * 1.17,
		direction.y * 22 + offset.y * 1.17,
		direction.z * 22 + offset.z * 1.17,
	);
	const fine = noise3d(
		direction.x * 54 + offset.x * 1.91,
		direction.y * 54 + offset.y * 1.91,
		direction.z * 54 + offset.z * 1.91,
	);
	const ridgeMedium = 1 - Math.abs(medium * 2 - 1);
	const ridgeFine = 1 - Math.abs(fine * 2 - 1);
	return {
		large,
		medium,
		fine,
		fineSigned: fine * 2 - 1,
		ridgeMedium,
		ridgeFine,
	};
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = THREE.MathUtils.clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}
