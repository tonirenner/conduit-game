import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { HorizonCulling } from '../src/performance';

describe('HorizonCulling', () => {
	test('keeps all candidates visible while disabled', () => {
		const culling = new HorizonCulling(10, { enabled: false });
		const result = culling.testPatchSphere(
			new THREE.Vector3(0, 0, 20),
			new THREE.Vector3(0, 0, -10),
			0.5,
		);

		expect(result.visible).toBe(true);
		expect(result.reason).toBe('disabled');
		expect(culling.getStats()).toMatchObject({
			tested: 1,
			visible: 1,
			disabled: 1,
		});
	});

	test('does not cull close to the sphere surface', () => {
		const culling = new HorizonCulling(10, {
			minCameraHeightForCulling: 0.25,
		});
		const result = culling.testPatchSphere(
			new THREE.Vector3(0, 0, 10.1),
			new THREE.Vector3(0, 0, -10),
			0.5,
		);

		expect(result.visible).toBe(true);
		expect(result.reason).toBe('near-surface');
	});

	test('distinguishes front, safety-margin, and occluded candidates', () => {
		const culling = new HorizonCulling(10, {
			safetyMargin: 0.18,
			minCameraHeightForCulling: 0,
		});
		const camera = new THREE.Vector3(0, 0, 20);
		const front = culling.testPatchSphere(
			camera,
			new THREE.Vector3(0, 0, 10),
			0.5,
		);
		const marginAngle = 1.1;
		const margin = culling.testPatchSphere(
			camera,
			new THREE.Vector3(
				Math.sin(marginAngle) * 10,
				0,
				Math.cos(marginAngle) * 10,
			),
			0.5,
		);
		const occluded = culling.testPatchSphere(
			camera,
			new THREE.Vector3(0, 0, -10),
			0.5,
		);

		expect(front.reason).toBe('visible-front');
		expect(margin.reason).toBe('visible-margin');
		expect(occluded).toMatchObject({
			visible: false,
			reason: 'culled-behind-horizon',
		});
		expect(culling.getStats()).toMatchObject({
			tested: 3,
			visible: 2,
			culled: 1,
		});
	});

	test('resets frame statistics and debug samples', () => {
		const culling = new HorizonCulling(10, { debug: true });

		culling.testPatchSphere(
			new THREE.Vector3(0, 0, 20),
			new THREE.Vector3(0, 0, 10),
			0.5,
		);
		expect(culling.getDebugSamples()).toHaveLength(1);

		culling.resetFrameStats();

		expect(culling.getDebugSamples()).toHaveLength(0);
		expect(culling.getStats().tested).toBe(0);
	});
});
