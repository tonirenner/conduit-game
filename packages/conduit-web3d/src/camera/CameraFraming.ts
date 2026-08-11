import * as THREE from 'three';

export type OrbitLikeControls = {
	target: THREE.Vector3;
	update: () => void;
};

export type FrameObjectOptions = {
	distanceMultiplier?: number;
	minDistance?: number;
	positionOffset?: THREE.Vector3;
	targetHeightFactor?: number;
};

export function frameObject(
	object: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
	controls?: OrbitLikeControls,
	options: FrameObjectOptions = {},
): THREE.Box3 {
	const box = new THREE.Box3().setFromObject(object);
	const center = new THREE.Vector3();
	const size = new THREE.Vector3();

	box.getCenter(center);
	box.getSize(size);

	const targetHeightFactor = options.targetHeightFactor ?? 0.52;
	const target = new THREE.Vector3(
		center.x,
		box.min.y + size.y * targetHeightFactor,
		center.z,
	);
	const largestAxis = Math.max(size.x, size.y, size.z);
	const distance = Math.max(
		options.minDistance ?? 5,
		largestAxis * (options.distanceMultiplier ?? 1.45),
	);
	const positionOffset =
		options.positionOffset ??
		new THREE.Vector3(distance * 0.35, distance * 0.22, distance);

	camera.position.copy(target).add(positionOffset);
	camera.lookAt(target);

	if (controls) {
		controls.target.copy(target);
		controls.update();
	}

	return box;
}

export function normalizeObjectToSize(
	object: THREE.Object3D,
	targetSize: number,
): THREE.Box3 {
	const box = new THREE.Box3().setFromObject(object);
	const size = new THREE.Vector3();

	box.getSize(size);

	const maxSize = Math.max(size.x, size.y, size.z);

	if (maxSize > 0.0001) {
		object.scale.multiplyScalar(targetSize / maxSize);
	}

	const normalizedBox = new THREE.Box3().setFromObject(object);
	const center = new THREE.Vector3();

	normalizedBox.getCenter(center);
	object.position.sub(center);

	return new THREE.Box3().setFromObject(object);
}
