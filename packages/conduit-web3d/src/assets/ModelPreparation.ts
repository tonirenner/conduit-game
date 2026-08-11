import * as THREE from 'three';

import { captureMaterialSnapshot, type MaterialSnapshot } from '../materials';
import {
	configureObjectMaterials,
	ensureUv2FromUv,
} from './AssetLoaders';

export type PreparedModelOptions = {
	cloneGeometry?: boolean;
	cloneMaterials?: boolean;
	ensureUv2?: boolean;
	castShadow?: boolean;
	receiveShadow?: boolean;
	frustumCulled?: boolean;
	captureMaterialSnapshots?: boolean;
};

export type PreparedModelResult = {
	materialSnapshots: MaterialSnapshot[];
};

export function prepareModelForRuntime(
	model: THREE.Object3D,
	options: PreparedModelOptions = {},
): PreparedModelResult {
	const cloneGeometry = options.cloneGeometry ?? false;
	const cloneMaterials = options.cloneMaterials ?? false;
	const captureSnapshots = options.captureMaterialSnapshots ?? false;
	const materialSnapshots: MaterialSnapshot[] = [];

	if (options.ensureUv2 ?? true) {
		ensureUv2FromUv(model);
	}

	model.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) {
			return;
		}

		if (cloneGeometry && object.geometry) {
			object.geometry = object.geometry.clone();
		}

		if (options.castShadow !== undefined) {
			object.castShadow = options.castShadow;
		}

		if (options.receiveShadow !== undefined) {
			object.receiveShadow = options.receiveShadow;
		}

		if (options.frustumCulled !== undefined) {
			object.frustumCulled = options.frustumCulled;
		}

		if (cloneMaterials) {
			object.material = cloneMaterialOrArray(object.material);
		}

		if (object.geometry) {
			object.geometry.computeBoundingBox();
			object.geometry.computeBoundingSphere();
		}
	});

	configureObjectMaterials(model, (material) => {
		material.depthWrite = true;
		material.depthTest = true;
		material.needsUpdate = true;

		if (captureSnapshots) {
			materialSnapshots.push(captureMaterialSnapshot(material));
		}
	});

	return {
		materialSnapshots,
	};
}

export function cloneMaterialOrArray<T extends THREE.Material | THREE.Material[]>(
	material: T,
): T {
	if (Array.isArray(material)) {
		return material.map((entry) => entry.clone()) as T;
	}

	return material.clone() as T;
}

export function collectNodeNames(root: THREE.Object3D): string[] {
	const nodeNames: string[] = [];

	root.traverse((node) => {
		if (node.name) {
			nodeNames.push(node.name);
		}
	});

	return nodeNames;
}

export function countMeshes(root: THREE.Object3D): number {
	let count = 0;

	root.traverse((node) => {
		if (node instanceof THREE.Mesh) {
			count++;
		}
	});

	return count;
}

export function countTriangles(root: THREE.Object3D): number {
	let triangles = 0;

	root.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) {
			return;
		}

		const geometry = node.geometry;
		const index = geometry.getIndex();
		const position = geometry.getAttribute('position');

		if (index) {
			triangles += index.count / 3;
		} else if (position) {
			triangles += position.count / 3;
		}
	});

	return Math.round(triangles);
}
