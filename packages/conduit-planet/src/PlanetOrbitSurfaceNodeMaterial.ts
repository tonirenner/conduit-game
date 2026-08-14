import * as THREE from 'three/webgpu';
import {
	attribute,
	cameraPosition,
	color,
	dot,
	float,
	max,
	mix,
	normalize,
	normalWorld,
	oneMinus,
	positionWorld,
	pow,
	smoothstep,
	uniform,
	vertexColor,
} from 'three/tsl';

import { SUN_DIRECTION } from './Sun';

export type PlanetOrbitSurfaceRenderTuning = {
	ambient?: number;
	exposure?: number;
};

/**
 * Lightweight WebGPU material for orbit / far approach.
 *
 * Deliberately does NOT evaluate procedural terrain noise, surface detail
 * FBM, palette branches or surface raymarching. Terrain class color and
 * masks are already baked into TerrainPatch vertex attributes by the CPU /
 * terrain workers, so the orbit shader only performs cheap lighting.
 */
export function createPlanetOrbitSurfaceNodeMaterial(
	planetRadius: number,
): any {
	const material = new THREE.MeshBasicNodeMaterial({
		vertexColors: true,
		transparent: false,
		depthWrite: true,
		depthTest: true,
	});

	material.name = 'PlanetOrbitSurfaceNodeMaterial';

	const sunDirection = uniform(SUN_DIRECTION.clone().normalize());
	const ambient = uniform(0.46);
	const exposure = uniform(1.22);

	const sphereNormal = normalize(attribute('sphereNormal', 'vec3'));
	const terrainDisplacement = attribute('terrainDisplacement', 'float');
	const patchOrigin = attribute('patchOrigin', 'vec3');
	const landMask = attribute('landMask', 'float');

	// Keep the exact same GPU terrain displacement contract as the production
	// WebGPU surface material so switching materials never changes geometry.
	material.positionNode = sphereNormal
		.mul(float(planetRadius).add(terrainDisplacement))
		.sub(patchOrigin);

	const baseColor = vertexColor().toVec3();
	const worldNormal = normalize(normalWorld);
	const ndl = dot(worldNormal, sunDirection);
	const day = smoothstep(-0.22, 0.42, ndl);
	const direct = pow(max(ndl, 0.0), 0.72);

	const dayColor = baseColor.mul(
		ambient.add(direct.mul(1.02)),
	);

	const nightColor = baseColor
		.mul(0.24)
		.add(color(0x07121e).mul(0.12));

	let surfaceColor = mix(nightColor, dayColor, day);

	// One cheap view-dependent term keeps the limb readable without invoking
	// the full atmosphere / reflection stack from the production shader.
	const viewDirection = normalize(cameraPosition.sub(positionWorld));
	const viewFacing = max(dot(worldNormal, viewDirection), 0.0);
	const fresnel = pow(oneMinus(viewFacing), 2.1);
	const waterHint = oneMinus(smoothstep(0.50, 0.64, landMask));

	surfaceColor = surfaceColor
		.add(color(0x6fa8c0).mul(fresnel).mul(waterHint).mul(0.10))
		.add(color(0xd6b07a).mul(fresnel).mul(day).mul(0.018))
		.mul(exposure);

	material.colorNode = surfaceColor;
	material.toneMapped = false;

	(material as any).setSunDirection = (direction: THREE.Vector3): void => {
		sunDirection.value.copy(direction).normalize();
	};

	(material as any).setRenderTuning = (
		tuning: PlanetOrbitSurfaceRenderTuning,
	): void => {
		if (typeof tuning.ambient === 'number') {
			ambient.value = THREE.MathUtils.clamp(tuning.ambient, 0.10, 1.25);
		}
		if (typeof tuning.exposure === 'number') {
			exposure.value = THREE.MathUtils.clamp(tuning.exposure, 0.40, 2.0);
		}
	};

	return material;
}
