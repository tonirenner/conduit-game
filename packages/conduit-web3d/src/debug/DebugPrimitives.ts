import * as THREE from 'three';

export function createDebugLine(
	name: string,
	color: THREE.ColorRepresentation,
): THREE.Line {
	const geometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(),
		new THREE.Vector3(0, 0, -1),
	]);
	const material = new THREE.LineBasicMaterial({
		color,
		depthTest: false,
		depthWrite: false,
		transparent: true,
		opacity: 0.86,
	});
	const line = new THREE.Line(geometry, material);

	line.name = name;
	line.renderOrder = 100;
	return line;
}

export function setDebugLinePoints(
	line: THREE.Line,
	start: THREE.Vector3,
	end: THREE.Vector3,
): void {
	const position = line.geometry.getAttribute('position');
	if (position instanceof THREE.BufferAttribute && position.count >= 2) {
		position.setXYZ(0, start.x, start.y, start.z);
		position.setXYZ(1, end.x, end.y, end.z);
		position.needsUpdate = true;
		line.geometry.computeBoundingSphere();
		return;
	}

	// Recovery path for malformed/debug geometries. Normal frame updates reuse
	// the existing GPU attribute so WebGPU never races a disposed geometry.
	line.geometry.dispose();
	line.geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
}

export function createDebugPoint(
	name: string,
	color: THREE.ColorRepresentation,
	radius = 0.08,
): THREE.Mesh {
	const point = new THREE.Mesh(
		new THREE.SphereGeometry(radius, 12, 8),
		new THREE.MeshBasicMaterial({
			color,
			depthTest: false,
			depthWrite: false,
		}),
	);

	point.name = name;
	point.renderOrder = 101;
	return point;
}

export function createDebugLabel(text: string): THREE.Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;
	const context = canvas.getContext('2d');

	if (context) {
		context.fillStyle = 'rgba(3, 11, 18, 0.82)';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.strokeStyle = 'rgba(143, 231, 255, 0.56)';
		context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
		context.fillStyle = '#d9f7ff';
		context.font = '18px monospace';
		context.fillText(text, 12, 39);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
			depthWrite: false,
		}),
	);

	sprite.name = `DebugLabel ${text}`;
	sprite.scale.set(2.6, 0.65, 1);
	sprite.renderOrder = 102;
	return sprite;
}

export function createBoundingBoxHelper(object: THREE.Object3D): THREE.Box3Helper {
	const box = new THREE.Box3().setFromObject(object);
	const helper = new THREE.Box3Helper(box, 0x8fe7ff);

	helper.name = 'DebugBoundingBox';
	helper.renderOrder = 100;
	return helper;
}

export function disposeObject3D(object: THREE.Object3D): void {
	const textures = new Set<THREE.Texture>();
	const materials = new Set<THREE.Material>();

	object.traverse((child) => {
		if (
			child instanceof THREE.Mesh ||
			child instanceof THREE.Line ||
			child instanceof THREE.Points
		) {
			child.geometry.dispose();
		}

		if (
			!(
				child instanceof THREE.Mesh ||
				child instanceof THREE.Line ||
				child instanceof THREE.Points ||
				child instanceof THREE.Sprite
			)
		) {
			return;
		}

		const childMaterials = Array.isArray(child.material)
			? child.material
			: [child.material];

		for (const material of childMaterials) {
			materials.add(material);
			collectMaterialTextures(material, textures);
		}
	});

	for (const material of materials) {
		material.dispose();
	}

	for (const texture of textures) {
		texture.dispose();
	}
}

export function collectMaterialTextures(
	material: THREE.Material,
	textures: Set<THREE.Texture>,
): void {
	const record = material as unknown as Record<string, unknown>;

	for (const value of Object.values(record)) {
		if (value instanceof THREE.Texture) {
			textures.add(value);
		}
	}
}
