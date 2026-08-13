import {
	afterAll,
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';
import * as THREE from 'three';

import { SystemNebulaBackdrop } from '../src/environment';

const originalDocument = globalThis.document;

beforeAll(() => {
	const gradient = {
		addColorStop: () => undefined,
	} as unknown as CanvasGradient;

	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: {
			createElement: (tagName: string) => {
				if (tagName !== 'canvas') {
					throw new Error(`Unexpected element request: ${tagName}`);
				}

				const context = {
					clearRect: () => undefined,
					createRadialGradient: () => gradient,
					fillRect: () => undefined,
					fillStyle: '',
				} as unknown as CanvasRenderingContext2D;

				return {
					width: 0,
					height: 0,
					getContext: () => context,
				} as unknown as HTMLCanvasElement;
			},
		},
	});
});

afterAll(() => {
	if (originalDocument) {
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: originalDocument,
		});
		return;
	}

	Reflect.deleteProperty(globalThis, 'document');
});

describe('SystemNebulaBackdrop', () => {
	test('creates deterministic point geometry for the same seed', () => {
		const first = new SystemNebulaBackdrop({ seed: 42 });
		const second = new SystemNebulaBackdrop({ seed: 42 });
		const firstPoints = findPointCloud(first);
		const secondPoints = findPointCloud(second);

		expect(first.group.children).toHaveLength(4);
		expect(second.group.children).toHaveLength(4);
		expect(
			Array.from(firstPoints.geometry.getAttribute('position').array),
		).toEqual(
			Array.from(secondPoints.geometry.getAttribute('position').array),
		);

		first.dispose();
		second.dispose();
	});

	test('follows the camera and advances backdrop rotation', () => {
		const backdrop = new SystemNebulaBackdrop({ seed: 7 });
		const cameraPosition = new THREE.Vector3(12, -4, 28);
		const initialRotationX = backdrop.group.rotation.x;
		const initialRotationY = backdrop.group.rotation.y;

		backdrop.update(0.5, cameraPosition);

		expect(backdrop.group.position.toArray()).toEqual(
			cameraPosition.toArray(),
		);
		expect(backdrop.group.rotation.x).toBeGreaterThan(initialRotationX);
		expect(backdrop.group.rotation.y).toBeGreaterThan(initialRotationY);

		backdrop.dispose();
	});

	test('disposes owned resources before rebuilding for a new seed', () => {
		const backdrop = new SystemNebulaBackdrop({ seed: 1 });
		const points = findPointCloud(backdrop);
		const material = points.material as THREE.PointsMaterial;
		const texture = material.map;
		let geometryDisposeCount = 0;
		let materialDisposeCount = 0;
		let textureDisposeCount = 0;

		points.geometry.addEventListener('dispose', () => {
			geometryDisposeCount++;
		});
		material.addEventListener('dispose', () => {
			materialDisposeCount++;
		});
		texture?.addEventListener('dispose', () => {
			textureDisposeCount++;
		});

		backdrop.reseed(2);

		expect(backdrop.group.children).toHaveLength(4);
		expect(geometryDisposeCount).toBe(1);
		expect(materialDisposeCount).toBe(1);
		expect(textureDisposeCount).toBe(1);

		backdrop.dispose();
		expect(backdrop.group.children).toHaveLength(0);
	});
});

function findPointCloud(
	backdrop: SystemNebulaBackdrop,
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
	let result: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;

	backdrop.group.traverse((object) => {
		if (object instanceof THREE.Points) {
			result = object as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
		}
	});

	if (!result) {
		throw new Error('Expected backdrop point cloud.');
	}

	return result;
}
