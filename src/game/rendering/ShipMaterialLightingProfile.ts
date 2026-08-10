import * as THREE from 'three';

export type ShipMaterialLightingProfile = {
	roughnessMultiplier: number;
	metalnessMultiplier: number;
	envMapIntensity: number;
	normalScale: number;
	aoMapIntensity: number;
	emissiveIntensityMultiplier: number;
};

export type GameEnvironmentProbeProfile = {
	environmentIntensity: number;
	hdrPeakIntensityScale: number;
	hdrPeakSizeScale: number;
	hdrPeakOpacityScale: number;
};

export const FRIGATE_MATERIAL_LIGHTING_PROFILE: ShipMaterialLightingProfile = {
	roughnessMultiplier: 1.08,
	metalnessMultiplier: 1.0,
	envMapIntensity: 1.1,
	normalScale: 1.0,
	aoMapIntensity: 1.0,
	emissiveIntensityMultiplier: 1.0,
};

export const GAME_ENVIRONMENT_PROBE_PROFILE: GameEnvironmentProbeProfile = {
	environmentIntensity: 1.35,
	hdrPeakIntensityScale: 0.45,
	hdrPeakSizeScale: 1.4,
	hdrPeakOpacityScale: 0.82,
};

export function applyShipMaterialLightingProfile(
	material: THREE.Material,
	profile: ShipMaterialLightingProfile,
): void {
	if (!(material instanceof THREE.MeshStandardMaterial)) {
		return;
	}

	material.roughness = THREE.MathUtils.clamp(
		material.roughness * profile.roughnessMultiplier,
		0,
		1,
	);
	material.metalness = THREE.MathUtils.clamp(
		material.metalness * profile.metalnessMultiplier,
		0,
		1,
	);
	material.envMapIntensity = profile.envMapIntensity;

	if (material.normalMap) {
		material.normalScale.multiplyScalar(profile.normalScale);
	}

	if (material.aoMap) {
		material.aoMapIntensity *= profile.aoMapIntensity;
	}

	material.emissiveIntensity *= profile.emissiveIntensityMultiplier;
	material.needsUpdate = true;
}
