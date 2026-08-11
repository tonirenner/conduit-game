import * as THREE from 'three';

export type MaterialAdjustmentProfile = {
	roughnessMultiplier: number;
	metalnessMultiplier: number;
	envMapIntensity: number;
	normalScale: number;
	aoMapIntensity: number;
	emissiveIntensityMultiplier: number;
};

export function applyMaterialAdjustmentProfile(
	material: THREE.Material,
	profile: MaterialAdjustmentProfile,
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
