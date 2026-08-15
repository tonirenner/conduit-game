import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
	attribute,
	color,
	float,
	max,
	mix,
	normalize,
	smoothstep,
	uniform,
	vertexColor,
	wgslFn,
} from 'three/tsl';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';

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
};

/**
 * CPU-side material classification for SurfaceView.
 *
 * Only broad, low-frequency material ownership is evaluated here. Fine surface
 * structure deliberately stays out of the vertex stream because a ~333 m cell
 * would turn cracks/cavity/hotspots into giant interpolated triangles.
 *
 * Geometry, collision and landing remain owned by PlanetTerrainSampler.
 */
export function evaluateSurfaceTerrainMaterial(
	definition: PlanetDefinition,
	input: SurfaceTerrainMaterialInput,
	targetColor = new THREE.Color(),
): SurfaceTerrainMaterialSample {
	const land = THREE.MathUtils.clamp(input.landMask, 0, 1);
	const mountain = THREE.MathUtils.clamp(input.mountainMask, 0, 1);
	const erosion = THREE.MathUtils.clamp(input.erosionMask, 0, 1);
	const river = THREE.MathUtils.clamp(input.riverMask, 0, 1);
	const height = THREE.MathUtils.clamp(input.height, 0, 1);
	const slope = THREE.MathUtils.clamp(input.slope, 0, 1);

	if (input.isWater) {
		const shallow = cpuSmoothstep(0.28, 0.72, land);
		targetColor.set(0x071f2f).lerp(new THREE.Color(0x155463), shallow);
		return {
			color: targetColor,
			roughness: 0.28,
			metalness: 0,
		};
	}

	const material = getClassMaterial(definition.class);
	const elevation = cpuSmoothstep(0.01, 0.22, height);
	const rockMask = THREE.MathUtils.clamp(
		mountain * 0.62 + erosion * 0.24 + slope * 0.42,
		0,
		0.92,
	);

	if (definition.class === 'lava') {
		// Broad basalt ownership only. Cracks and heat are fragment detail.
		targetColor
			.set(0x030201)
			.lerp(new THREE.Color(0x120905), elevation * 0.48 + rockMask * 0.16);
		return {
			color: targetColor,
			roughness: 0.95,
			metalness: 0.015,
		};
	}

	targetColor.copy(material.low).lerp(material.high, elevation);
	targetColor.lerp(material.rock, rockMask);

	if (definition.class === 'terrestrial' || definition.class === 'ocean') {
		const vegetation = cpuSmoothstep(0.58, 0.82, land) * (1 - rockMask);
		targetColor.lerp(material.accent, vegetation * material.accentStrength);
	}

	if (definition.class === 'ice') {
		const iceBright = cpuSmoothstep(0.16, 0.78, mountain + elevation * 0.75);
		targetColor.lerp(new THREE.Color(0xfbfdff), iceBright * 0.42);
	}

	let roughness = material.roughness;
	if (river > 0.01) {
		targetColor.multiplyScalar(THREE.MathUtils.lerp(1, 0.76, river * 0.58));
		roughness = THREE.MathUtils.lerp(roughness, 0.58, river * 0.35);
	}

	return {
		color: targetColor,
		roughness,
		metalness: material.metalness,
	};
}

const proceduralMaterialDetail = wgslFn(`
fn surface_material_detail(
	directionInput: vec3<f32>,
	detailOffset: vec3<f32>
) -> vec4<f32> {
	let n = normalize(directionInput);
	let large = detail_fbm(n * 38.0 + detailOffset * 0.73);
	let medium = detail_fbm(n * 115.0 + detailOffset * 1.17);
	let fine = detail_fbm(n * 360.0 + detailOffset * 1.91);
	let ridgeMedium = 1.0 - abs(medium * 2.0 - 1.0);
	let ridgeFine = 1.0 - abs(fine * 2.0 - 1.0);
	return vec4<f32>(fine * 2.0 - 1.0, ridgeMedium, ridgeFine, large);
}

fn detail_hash3(p_input: vec3<f32>) -> f32 {
	return fract(
		sin(dot(p_input, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123
	);
}

fn detail_noise3d(p: vec3<f32>) -> f32 {
	let i = floor(p);
	var f = fract(p);
	f = f * f * (3.0 - 2.0 * f);

	let v000 = detail_hash3(i + vec3<f32>(0.0, 0.0, 0.0));
	let v100 = detail_hash3(i + vec3<f32>(1.0, 0.0, 0.0));
	let v010 = detail_hash3(i + vec3<f32>(0.0, 1.0, 0.0));
	let v110 = detail_hash3(i + vec3<f32>(1.0, 1.0, 0.0));
	let v001 = detail_hash3(i + vec3<f32>(0.0, 0.0, 1.0));
	let v101 = detail_hash3(i + vec3<f32>(1.0, 0.0, 1.0));
	let v011 = detail_hash3(i + vec3<f32>(0.0, 1.0, 1.0));
	let v111 = detail_hash3(i + vec3<f32>(1.0, 1.0, 1.0));

	let x00 = mix(v000, v100, f.x);
	let x10 = mix(v010, v110, f.x);
	let x01 = mix(v001, v101, f.x);
	let x11 = mix(v011, v111, f.x);
	let y0 = mix(x00, x10, f.y);
	let y1 = mix(x01, x11, f.y);
	return mix(y0, y1, f.z);
}

fn detail_fbm(p_input: vec3<f32>) -> f32 {
	var value = 0.0;
	var amplitude = 0.5;
	var frequency = 1.0;
	var normalizer = 0.0;
	for (var i = 0; i < 5; i = i + 1) {
		value = value + amplitude * detail_noise3d(p_input * frequency);
		normalizer = normalizer + amplitude;
		frequency = frequency * 2.07;
		amplitude = amplitude * 0.5;
	}
	return value / normalizer;
}
`);

/**
 * Fragment-shaded PBR material for SurfaceView.
 *
 * `terrainDirection` is the planet-space unit direction at each clipmap vertex;
 * interpolation gives every fragment stable spherical coordinates. Broad terrain
 * masks may interpolate, but the visible cracks/cavity/roughness detail is sampled
 * per fragment and therefore is independent of clipmap cell size.
 */
export function createSurfaceTerrainNodeMaterial(
	definition: PlanetDefinition,
	detailOffset: THREE.Vector3,
): any {
	const material = new MeshStandardNodeMaterial({
		transparent: true,
		opacity: 0,
		depthTest: true,
		depthWrite: false,
	});
	material.vertexColors = true;

	const direction = normalize(attribute('terrainDirection', 'vec3'));
	const masks = attribute('terrainMaterialData', 'vec4');
	const baseRoughness = attribute('terrainRoughness', 'float');
	const baseMetalness = attribute('terrainMetalness', 'float');
	const seedOffset = uniform(detailOffset.clone());
	const detail = proceduralMaterialDetail({
		directionInput: direction,
		detailOffset: seedOffset,
	});

	const fineSigned = detail.x;
	const ridgeMedium = detail.y;
	const ridgeFine = detail.z;
	const mountain = masks.x;
	const erosion = masks.y;
	const river = masks.z;
	const slope = masks.w;

	const microCavity = max(float(0), fineSigned.negate())
		.mul(0.075)
		.add(erosion.mul(0.055))
		.add(river.mul(0.045));
	const microVariation = float(1).add(fineSigned.mul(0.035)).sub(microCavity);

	let surfaceColor: any = vertexColor().toVec3().mul(microVariation);
	let surfaceRoughness: any = baseRoughness
		.add(fineSigned.mul(0.035))
		.add(microCavity.mul(0.10))
		.sub(slope.mul(0.05));
	let surfaceMetalness: any = baseMetalness;
	let surfaceEmissive: any = color(0x000000);

	if (definition.class === 'lava') {
		// Keep most of the planet as cooled basalt. Fine ridges expose narrow hot
		// seams; medium ridges only produce rare active hotspots where terrain
		// structure supports them.
		const crackStrength = smoothstep(0.91, 0.985, ridgeFine).mul(
			float(0.16)
				.add(erosion.mul(0.16))
				.add(mountain.mul(0.10)),
		);
		const hotspotStrength = smoothstep(0.955, 0.995, ridgeMedium).mul(
			mountain.mul(0.20)
				.add(erosion.mul(0.14))
				.add(float(0.025)),
		);
		const heat = crackStrength.mul(0.48).add(hotspotStrength.mul(0.70));
		const hotCore = smoothstep(0.12, 0.46, heat);

		// Heat tints only the immediate seam; emissive is intentionally restrained
		// so bloom does not turn whole valleys into white lava fields.
		surfaceColor = mix(
			surfaceColor,
			color(0x351006),
			heat.mul(0.08),
		);
		surfaceEmissive = mix(
			color(0xd92605),
			color(0xff8a24),
			hotCore,
		).mul(heat.mul(0.95));
		surfaceRoughness = mix(surfaceRoughness, float(0.72), heat.mul(0.34));
		surfaceMetalness = float(0.015);
	}

	if (definition.class === 'ice') {
		const crack = smoothstep(0.84, 0.965, ridgeFine)
			.mul(float(0.22).add(erosion.mul(0.34)));
		surfaceColor = mix(surfaceColor, color(0x1b5f82), crack.mul(0.28));
		surfaceRoughness = mix(surfaceRoughness, float(0.30), crack.mul(0.36));
	}

	material.colorNode = surfaceColor;
	material.roughnessNode = surfaceRoughness;
	material.metalnessNode = surfaceMetalness;
	material.emissiveNode = surfaceEmissive;
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
};

function getClassMaterial(planetClass: PlanetClass): ClassMaterial {
	switch (planetClass) {
		case 'desert': return material(0x9c5e32, 0xe4b763, 0xc78b43, 0x714025, 0.94, 0.0, 0.20);
		case 'ice': return material(0x89b5c8, 0xe8f6fb, 0xc7e3ea, 0x678096, 0.38, 0.0, 0.12);
		case 'lava': return material(0x030201, 0x120905, 0xb83c12, 0x080503, 0.95, 0.015, 0.0);
		case 'toxic': return material(0x526f68, 0xa6b6aa, 0x71803d, 0x3f422d, 0.82, 0.0, 0.18);
		case 'carbon': return material(0x242424, 0x55514b, 0x3c3a36, 0x171717, 0.76, 0.06, 0.10);
		case 'metal_rich': return material(0x4a4038, 0x8c7864, 0x69594c, 0x403831, 0.62, 0.24, 0.12);
		case 'barren': return material(0x41392f, 0x9c8767, 0xb7a88a, 0x50483f, 0.86, 0.0, 0.12);
		case 'rocky': return material(0x3f403c, 0x9c957f, 0xc4b899, 0x433c36, 0.80, 0.0, 0.10);
		case 'terrestrial': return material(0x315d35, 0x716a4e, 0x496844, 0x69675b, 0.83, 0.0, 0.28);
		case 'ocean': return material(0x1f6a46, 0x8ca05a, 0x4d6f52, 0x5a5548, 0.78, 0.0, 0.22);
		default: return material(0x625548, 0xa48e73, 0x786858, 0x51483f, 0.84, 0.0, 0.10);
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
): ClassMaterial {
	return {
		low: new THREE.Color(low),
		high: new THREE.Color(high),
		accent: new THREE.Color(accent),
		rock: new THREE.Color(rock),
		roughness,
		metalness,
		accentStrength,
	};
}

function cpuSmoothstep(edge0: number, edge1: number, value: number): number {
	const t = THREE.MathUtils.clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}
