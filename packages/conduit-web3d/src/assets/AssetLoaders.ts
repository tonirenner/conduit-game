import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export type LoadedObjectOptions = {
	name?: string;
};

export class AssetPromiseCache {
	private readonly entries = new Map<string, Promise<THREE.Object3D>>();

	loadObject(
		key: string,
		load: () => Promise<THREE.Object3D>,
	): Promise<THREE.Object3D> {
		const cached = this.entries.get(key);

		if (cached) {
			return cached;
		}

		const promise = load().catch((error) => {
			this.entries.delete(key);
			throw error;
		});

		this.entries.set(key, promise);
		return promise;
	}

	clear(): void {
		this.entries.clear();
	}
}

export async function loadGltfObject(
	url: string,
	options: LoadedObjectOptions = {},
): Promise<THREE.Object3D> {
	const gltf = await new GLTFLoader().loadAsync(url);
	const object = gltf.scene;

	if (options.name) {
		object.name = options.name;
	}

	return object;
}

export async function loadObjMtlObject(
	objUrl: string,
	mtlUrl: string | null,
	options: LoadedObjectOptions = {},
): Promise<THREE.Object3D> {
	const objLoader = new OBJLoader();

	if (mtlUrl) {
		const materials = await new MTLLoader().loadAsync(mtlUrl);

		materials.preload();
		objLoader.setMaterials(materials);
	}

	const object = await objLoader.loadAsync(objUrl);

	if (options.name) {
		object.name = options.name;
	}

	return object;
}

export function cloneObject3D(
	object: THREE.Object3D,
	recursive = true,
): THREE.Object3D {
	return object.clone(recursive);
}

export function ensureUv2FromUv(object: THREE.Object3D): void {
	object.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) {
			return;
		}

		if (
			!child.geometry.getAttribute('uv2') &&
			child.geometry.getAttribute('uv')
		) {
			child.geometry.setAttribute(
				'uv2',
				child.geometry.getAttribute('uv').clone(),
			);
		}
	});
}

export function configureObjectMaterials(
	object: THREE.Object3D,
	configure: (material: THREE.Material, mesh: THREE.Mesh) => void,
): void {
	object.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) {
			return;
		}

		const materials = Array.isArray(child.material)
			? child.material
			: [child.material];

		for (const material of materials) {
			if (material) {
				configure(material, child);
			}
		}
	});
}
