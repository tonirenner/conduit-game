import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
	attribute,
	clamp,
	color,
	float,
	max,
	mix,
	normalize,
	normalView,
	positionView,
	smoothstep,
	uniform,
	vertexColor,
	wgslFn,
} from 'three/tsl';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';

const EARTH_RADIUS_METERS = 6_371_000;

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
		return { color: targetColor, roughness: 0.28, metalness: 0 };
	}

	const material = getClassMaterial(definition.class);
	const elevation = cpuSmoothstep(0.01, 0.22, height);
	const rockMask = THREE.MathUtils.clamp(
		mountain * 0.62 + erosion * 0.24 + slope * 0.42,
		0,
		0.92,
	);

	if (definition.class === 'lava') {
		targetColor
			.set(0x030303)
			.lerp(new THREE.Color(0x15100e), elevation * 0.48 + rockMask * 0.18);
		return { color: targetColor, roughness: 0.95, metalness: 0.015 };
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

	return { color: targetColor, roughness, metalness: material.metalness };
}

const proceduralMaterialDetail = wgslFn(`
fn surface_material_detail(
	directionInput: vec3<f32>,
	detailOffset: vec3<f32>,
	frequencies: vec3<f32>
) -> vec4<f32> {
	let n = normalize(directionInput);
	let large = detail_fbm(n * frequencies.x + detailOffset * 0.73);
	let medium = detail_fbm(n * frequencies.y + detailOffset * 1.17);
	let fine = detail_fbm(n * frequencies.z + detailOffset * 1.91);
	let ridgeMedium = 1.0 - abs(medium * 2.0 - 1.0);
	let ridgeFine = 1.0 - abs(fine * 2.0 - 1.0);
	return vec4<f32>(fine * 2.0 - 1.0, ridgeMedium, ridgeFine, large);
}

fn detail_hash3(p_input: vec3<f32>) -> f32 {
	return fract(sin(dot(p_input, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
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
	return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
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

const perturbProceduralNormal = wgslFn(`
fn perturb_procedural_normal(
	positionInput: vec3<f32>,
	normalInput: vec3<f32>,
	heightInput: f32,
	strengthInput: f32
) -> vec3<f32> {
	let sigmaX = normalize(dpdx(positionInput));
	let sigmaY = normalize(dpdy(positionInput));
	let baseNormal = normalize(normalInput);
	let heightDerivative = vec2<f32>(dpdx(heightInput), dpdy(heightInput)) * strengthInput;
	let r1 = cross(sigmaY, baseNormal);
	let r2 = cross(baseNormal, sigmaX);
	let determinant = dot(sigmaX, r1);
	let gradient = sign(determinant) * (
		heightDerivative.x * r1 +
		heightDerivative.y * r2
	);
	return normalize(abs(determinant) * baseNormal - gradient);
}
`);

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
	const radiusMeters = definition.physical.radius * EARTH_RADIUS_METERS;
	const materialFrequencies = uniform(new THREE.Vector3(
		radiusMeters / 8_000,
		radiusMeters / 2_800,
		radiusMeters / 900,
	));
	const detail = proceduralMaterialDetail({
		directionInput: direction,
		detailOffset: seedOffset,
		frequencies: materialFrequencies,
	});

	const fineSigned = detail.x;
	const ridgeMedium = detail.y;
	const ridgeFine = detail.z;
	const mountain = masks.x;
	const erosion = masks.y;
	const river = masks.z;
	const slope = masks.w;

	const microCavity = max(float(0), fineSigned.negate())
		.mul(0.050)
		.add(erosion.mul(0.040))
		.add(river.mul(0.035));
	const microVariation = float(1).add(fineSigned.mul(0.022)).sub(microCavity);

	let surfaceColor: any = vertexColor().toVec3().mul(microVariation);
	let surfaceRoughness: any = baseRoughness
		.add(fineSigned.mul(0.022))
		.add(microCavity.mul(0.08))
		.sub(slope.mul(0.04));
	let surfaceMetalness: any = baseMetalness;
	let surfaceEmissive: any = color(0x000000);

	// Phase 3: material-dependent micro normals. Water stays flat by using the
	// low water roughness as a solid-surface gate.
	const solidMicroMask = smoothstep(0.30, 0.36, baseRoughness)
		.mul(float(1).sub(river.mul(0.45)));
	let microHeight: any = fineSigned.mul(0.12)
		.add(detail.w.sub(0.5).mul(0.04));
	let microNormalStrength: any = float(0.06);

	// Phase 4: local material cavity AO. GTAO still handles broad screen-space
	// valleys and silhouettes; this factor only darkens fragment-scale recesses.
	const finePocket = smoothstep(0.04, 0.72, max(float(0), fineSigned.negate()));
	const fineCrease = smoothstep(0.91, 0.992, ridgeFine);
	const mediumCrease = smoothstep(0.90, 0.99, ridgeMedium);
	let cavityAmount: any = finePocket.mul(0.10)
		.add(fineCrease.mul(0.035))
		.add(erosion.mul(0.055))
		.add(river.mul(0.025));

	if (definition.class === 'desert') {
		microHeight = fineSigned.mul(0.085).add(ridgeMedium.mul(0.025));
		microNormalStrength = float(0.045);
		cavityAmount = finePocket.mul(0.055)
			.add(mediumCrease.mul(0.018))
			.add(erosion.mul(0.035));
	} else if (definition.class === 'rocky') {
		microHeight = fineSigned.mul(0.24)
			.add(ridgeMedium.mul(0.10))
			.add(ridgeFine.mul(0.055));
		microNormalStrength = float(0.105);
		cavityAmount = finePocket.mul(0.14)
			.add(fineCrease.mul(0.075))
			.add(erosion.mul(0.09))
			.add(slope.mul(0.025));
	} else if (definition.class === 'barren') {
		microHeight = fineSigned.mul(0.20).add(ridgeMedium.mul(0.075));
		microNormalStrength = float(0.09);
		cavityAmount = finePocket.mul(0.12)
			.add(fineCrease.mul(0.065))
			.add(erosion.mul(0.075));
	} else if (definition.class === 'carbon') {
		microHeight = fineSigned.mul(0.25).add(ridgeFine.mul(0.07));
		microNormalStrength = float(0.11);
		cavityAmount = finePocket.mul(0.15)
			.add(fineCrease.mul(0.07))
			.add(erosion.mul(0.06));
	} else if (definition.class === 'metal_rich') {
		microHeight = fineSigned.mul(0.17).add(ridgeMedium.mul(0.06));
		microNormalStrength = float(0.075);
		cavityAmount = finePocket.mul(0.085)
			.add(fineCrease.mul(0.035))
			.add(erosion.mul(0.05));
	} else if (definition.class === 'toxic') {
		microHeight = fineSigned.mul(0.14).add(detail.w.sub(0.5).mul(0.05));
		microNormalStrength = float(0.065);
		cavityAmount = finePocket.mul(0.085)
			.add(mediumCrease.mul(0.03))
			.add(erosion.mul(0.055))
			.add(river.mul(0.035));
	} else if (definition.class === 'terrestrial' || definition.class === 'ocean') {
		microHeight = fineSigned.mul(0.10).add(detail.w.sub(0.5).mul(0.035));
		microNormalStrength = float(0.055);
		cavityAmount = finePocket.mul(0.065)
			.add(erosion.mul(0.045))
			.add(river.mul(0.035));
	}

	if (definition.class === 'lava') {
		const crackHalo = smoothstep(0.925, 0.975, ridgeFine).mul(
			float(0.28).add(erosion.mul(0.26)).add(mountain.mul(0.14)),
		);
		const crackCore = smoothstep(0.972, 0.995, ridgeFine).mul(
			float(0.18).add(erosion.mul(0.24)).add(mountain.mul(0.12)),
		);
		const hotspot = smoothstep(0.968, 0.995, ridgeMedium).mul(
			mountain.mul(0.24).add(erosion.mul(0.20)).add(float(0.035)),
		);
		const heat = crackCore.mul(0.82).add(hotspot.mul(0.72));
		const hotCore = smoothstep(0.10, 0.46, heat);

		surfaceColor = surfaceColor.mul(float(1).sub(crackHalo.mul(0.24)));
		surfaceColor = mix(surfaceColor, color(0x39110a), heat.mul(0.10));
		surfaceEmissive = mix(
			color(0xa91f08),
			color(0xff8a2a),
			hotCore,
		).mul(heat.mul(0.92));
		surfaceRoughness = surfaceRoughness.add(crackHalo.mul(0.035));
		surfaceRoughness = mix(surfaceRoughness, float(0.68), heat.mul(0.28));
		surfaceMetalness = float(0.015);

		microHeight = fineSigned.mul(0.17)
			.add(ridgeMedium.mul(0.045))
			.sub(crackHalo.mul(0.16))
			.sub(crackCore.mul(0.10));
		microNormalStrength = float(0.12);
		cavityAmount = finePocket.mul(0.12)
			.add(crackHalo.mul(0.24))
			.add(erosion.mul(0.065));
		// The luminous crack core should remain bright; cavity belongs to its rim.
		cavityAmount = cavityAmount.mul(float(1).sub(hotCore.mul(0.48)));
	}

	if (definition.class === 'ice') {
		const crack = smoothstep(0.84, 0.965, ridgeFine)
			.mul(float(0.22).add(erosion.mul(0.34)));
		surfaceColor = mix(surfaceColor, color(0x1b5f82), crack.mul(0.28));
		surfaceRoughness = mix(surfaceRoughness, float(0.30), crack.mul(0.36));
		microHeight = fineSigned.mul(0.055).sub(crack.mul(0.13));
		microNormalStrength = float(0.038);
		cavityAmount = finePocket.mul(0.035)
			.add(crack.mul(0.15))
			.add(erosion.mul(0.025));
	}

	const surfaceAO = clamp(
		float(1).sub(cavityAmount.mul(solidMicroMask)),
		float(0.62),
		float(1),
	);

	material.colorNode = surfaceColor;
	material.roughnessNode = surfaceRoughness;
	material.metalnessNode = surfaceMetalness;
	material.emissiveNode = surfaceEmissive;
	material.aoNode = surfaceAO;
	material.normalNode = perturbProceduralNormal({
		positionInput: positionView,
		normalInput: normalView,
		heightInput: microHeight,
		strengthInput: microNormalStrength.mul(solidMicroMask),
	});
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
		case 'lava': return material(0x030303, 0x15100e, 0xb23b17, 0x090706, 0.95, 0.015, 0.0);
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