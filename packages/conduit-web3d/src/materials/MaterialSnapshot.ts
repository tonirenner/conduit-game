import * as THREE from 'three';

export type MaterialSnapshot = {
	material: THREE.Material;
	roughness?: number;
	metalness?: number;
	envMapIntensity?: number;
	normalScale?: THREE.Vector2;
	aoMapIntensity?: number;
	emissiveIntensity?: number;
};

export function captureMaterialSnapshot(material: THREE.Material): MaterialSnapshot {
	if (!(material instanceof THREE.MeshStandardMaterial)) {
		return { material };
	}

	return {
		material,
		roughness: material.roughness,
		metalness: material.metalness,
		envMapIntensity: material.envMapIntensity,
		normalScale: material.normalScale?.clone(),
		aoMapIntensity: material.aoMapIntensity,
		emissiveIntensity: material.emissiveIntensity,
	};
}

export function restoreMaterialSnapshot(snapshot: MaterialSnapshot): void {
	const material = snapshot.material;

	if (!(material instanceof THREE.MeshStandardMaterial)) {
		return;
	}

	if (snapshot.roughness !== undefined) {
		material.roughness = snapshot.roughness;
	}

	if (snapshot.metalness !== undefined) {
		material.metalness = snapshot.metalness;
	}

	if (snapshot.envMapIntensity !== undefined) {
		material.envMapIntensity = snapshot.envMapIntensity;
	}

	if (snapshot.normalScale) {
		material.normalScale.copy(snapshot.normalScale);
	}

	if (snapshot.aoMapIntensity !== undefined) {
		material.aoMapIntensity = snapshot.aoMapIntensity;
	}

	if (snapshot.emissiveIntensity !== undefined) {
		material.emissiveIntensity = snapshot.emissiveIntensity;
	}

	material.needsUpdate = true;
}
