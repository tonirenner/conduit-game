import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { CubeSphere } from '../src/CubeSphere';
import { createTerrainSeedConfig } from '../src/terrain/noise';
import {
	PlanetReferenceFrame,
	PlanetTerrainSampler,
	createPlanetSurfaceCoordinate,
	getPlanetRenderHeightScale,
	planetPositionToSurfaceCoordinate,
	surfaceCoordinateToPlanetPosition,
} from '../src/near-view';

function createDefinition() {
	return generatePlanetDefinition(90125, {
		name: 'Near View Test',
		semiMajorAxis: 1,
		starIrradiance: 1,
		forcePlanetClass: 'terrestrial',
	});
}

describe('planet near-view foundations', () => {
	test('round-trips stable planet surface coordinates', () => {
		const radius = 6_371_000;
		const coordinate = createPlanetSurfaceCoordinate(
			'planet-test',
			new THREE.Vector3(0.35, 0.82, -0.44),
			1_250,
		);
		const position = surfaceCoordinateToPlanetPosition(coordinate, radius);
		const roundTrip = planetPositionToSurfaceCoordinate(
			coordinate.planetId,
			position,
			radius,
		);

		expect(roundTrip.planetId).toBe(coordinate.planetId);
		expect(roundTrip.direction.distanceTo(coordinate.direction)).toBeLessThan(1e-12);
		expect(roundTrip.altitudeMeters).toBeCloseTo(1_250, 8);
	});

	test('keeps deterministic terrain and outward surface normals', () => {
		const sampler = new PlanetTerrainSampler(createDefinition());
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
		const first = sampler.sample(direction);
		const second = sampler.sample(direction);

		expect(sampler.radiusMeters).toBeCloseTo(
			sampler.definition.physical.radius * 6_371_000,
			8,
		);
		expect(second.elevationMeters).toBe(first.elevationMeters);
		expect(second.biome).toBe(first.biome);
		expect(second.landMask).toBe(first.landMask);
		expect(first.normal.dot(direction)).toBeGreaterThan(0.8);
	});

	test('uses the same metric elevation in render and physical space', () => {
		const definition = createDefinition();
		const sampler = new PlanetTerrainSampler(definition);
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
		const sample = sampler.sample(direction);
		const renderRadius = 3_000;
		const renderHeightScale = getPlanetRenderHeightScale(
			definition,
			renderRadius,
		);
		const reconstructedMeters =
			sample.geometryRawHeight *
			renderHeightScale *
			(sampler.radiusMeters / renderRadius);

		expect(reconstructedMeters).toBeCloseTo(sample.elevationMeters, 8);
	});

	test('keeps CubeSphere LOD invariant under parent transforms', () => {
		const material = new THREE.MeshBasicMaterial();
		const createSphere = () => new CubeSphere(
			10,
			2,
			material,
			false,
			createTerrainSeedConfig(71),
			0.5,
		);
		const originSphere = createSphere();
		const transformedSphere = createSphere();
		transformedSphere.position.set(100_000, -50_000, 25_000);
		transformedSphere.scale.setScalar(2_000);
		const cameraLocal = new THREE.Vector3(0, 0, 12);

		for (let frame = 0; frame < 4; frame++) {
			originSphere.updateLOD(cameraLocal);
			transformedSphere.updateLOD(cameraLocal);
		}

		expect(transformedSphere.getStats()).toEqual(originSphere.getStats());
		originSphere.traverse((object) => {
			if (!(object instanceof THREE.Mesh) || !object.visible) return;
			const positions = object.geometry.getAttribute('position');
			const morphPositions = object.geometry.getAttribute('morphPosition');
			expect(positions.count).toBe(9);
			expect(morphPositions.count).toBe(positions.count);
			let maxLocalLength = 0;
			for (let index = 0; index < positions.count; index++) {
				maxLocalLength = Math.max(
					maxLocalLength,
					Math.hypot(positions.getX(index), positions.getY(index), positions.getZ(index)),
				);
			}
			expect(maxLocalLength).toBeLessThan(6);
		});
		originSphere.clear();
		transformedSphere.clear();
		material.dispose();
	});

	test('selects the surface CubeSphere LOD profile near the surface', () => {
		const material = new THREE.MeshBasicMaterial();
		const sphere = new CubeSphere(
			10,
			2,
			material,
			false,
			createTerrainSeedConfig(19),
			0.5,
		);

		for (let frame = 0; frame < 6; frame++) {
			sphere.updateLOD(new THREE.Vector3(0, 0, 100));
		}
		expect(sphere.getStats().profile).not.toBe('surface');

		for (let frame = 0; frame < 24; frame++) {
			sphere.updateLOD(new THREE.Vector3(0, 0, 10.01));
		}

		// Refinement beyond the initial levels is asynchronous. The synchronous
		// Node/Bun characterization guarantees profile selection, not completion
		// of worker-backed split requests before getStats() is read.
		expect(sphere.getStats().profile).toBe('surface');
		sphere.clear();
		material.dispose();
	});

	test('shifts the render origin without changing physical positions', () => {
		const frame = new PlanetReferenceFrame(
			new THREE.Vector3(6_371_000, 0, 0),
			1_000,
		);
		const observer = new THREE.Vector3(6_371_000, 1_500, 0);
		const before = frame.toPlanetPosition(frame.toRenderPosition(observer));
		const update = frame.update(observer);
		const after = frame.toPlanetPosition(frame.toRenderPosition(before));

		expect(update.shifted).toBe(true);
		expect(update.shiftCount).toBe(1);
		expect(after.distanceTo(observer)).toBeLessThan(1e-9);
	});
});
