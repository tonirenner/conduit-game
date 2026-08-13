import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { CubeSphere } from '../src/CubeSphere';
import { createTerrainSeedConfig } from '../src/terrain/noise';
import {
	PlanetLandingController,
	PlanetNearViewRuntime,
	PlanetReferenceFrame,
	PlanetTerrainSampler,
	PLANET_NEAR_VIEW_CHUNK_SPECS,
	createPlanetNearViewVisualProfile,
	createPlanetSurfaceCoordinate,
	getChunkSpecCoverageRadius,
	getApproachProxyDistance,
	getApproachProxyScale,
	getPlanetHorizonDistance,
	getPlanetRenderHeightScale,
	getPlanetNearViewTransition,
	getNearViewSurfaceColor,
	planetPositionToSurfaceCoordinate,
	selectPlanetLandingSite,
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

	test('uses the same metric elevation in render and landing space', () => {
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
			sample.rawTerrain.height *
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

	test('increases CubeSphere detail monotonically toward the surface', () => {
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
		const orbitStats = sphere.getStats();

		for (let frame = 0; frame < 24; frame++) {
			sphere.updateLOD(new THREE.Vector3(0, 0, 10.01));
		}
		const surfaceStats = sphere.getStats();

		expect(surfaceStats.profile).toBe('surface');
		expect(surfaceStats.maxLevel).toBeGreaterThan(orbitStats.maxLevel);
		expect(surfaceStats.approximateVertexSpacing).toBeLessThan(
			orbitStats.approximateVertexSpacing,
		);
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

	test('accepts safe land contact and rejects hard contact', () => {
		const sampler = new PlanetTerrainSampler(createDefinition());
		const direction = findLandDirection(sampler);
		const surface = sampler.sample(direction);
		const safePosition = direction.clone()
			.multiplyScalar(surface.surfaceRadiusMeters + 1);
		const landing = new PlanetLandingController(sampler);
		const safe = landing.update(
			safePosition,
			direction.clone().multiplyScalar(-2),
			true,
		);

		expect(safe.canLand).toBe(true);
		expect(safe.state).toBe('landed');
		expect(safe.correctedPosition).not.toBeNull();

		const hard = new PlanetLandingController(sampler).update(
			safePosition,
			direction.clone().multiplyScalar(-40),
			true,
		);

		expect(hard.canLand).toBe(false);
		expect(hard.hardContact).toBe(true);
	});

	test('streams bounded terrain chunks across floating-origin shifts', () => {
		const definition = createDefinition();
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
		const runtime = new PlanetNearViewRuntime(definition, direction, 1_200);
		const surface = runtime.sampler.sample(direction);
		const position = direction.clone().multiplyScalar(
			surface.surfaceRadiusMeters + 1_200,
		);
		const initial = runtime.update(position, new THREE.Vector3(), false);
		const shifted = runtime.update(
			position.clone().add(new THREE.Vector3(3_000, 0, 0)),
			new THREE.Vector3(),
			false,
		);

		expect(initial.terrain.visibleChunks).toBe(97);
		expect(initial.terrain.coverageRadiusMeters).toBeGreaterThan(
			initial.terrain.horizonDistanceMeters,
		);
		expect(shifted.originShiftMeters.length()).toBeGreaterThan(2_000);
		expect(shifted.terrain.shiftCount).toBe(1);
		expect(shifted.terrain.cachedChunks).toBeLessThanOrEqual(150);
		runtime.dispose();
	});

	test('uses the production planet proxy until local terrain is close enough', () => {
		const definition = createDefinition();
		const direction = new THREE.Vector3(0.31, 0.74, -0.52).normalize();
		const runtime = new PlanetNearViewRuntime(definition, direction, 120_000);
		const surface = runtime.sampler.sample(direction);
		const position = direction.clone().multiplyScalar(
			surface.surfaceRadiusMeters + 120_000,
		);
		const orbitUpdate = runtime.update(position, new THREE.Vector3(), false);

		expect(orbitUpdate.landing.state).toBe('orbit');
		expect(orbitUpdate.transition.planetVisible).toBe(true);
		expect(orbitUpdate.transition.terrainVisible).toBe(false);
		expect(orbitUpdate.terrain.visibleChunks).toBe(0);

		const nearPosition = direction.clone().multiplyScalar(
			surface.surfaceRadiusMeters + 1_200,
		);
		const surfaceUpdate = runtime.update(
			nearPosition,
			new THREE.Vector3(),
			false,
		);
		expect(surfaceUpdate.transition.planetVisible).toBe(false);
		expect(surfaceUpdate.transition.terrainVisible).toBe(true);
		expect(surfaceUpdate.terrain.visibleChunks).toBe(97);
		runtime.dispose();
	});

	test('keeps the proxy scale consistent across the approach transition', () => {
		const proxyRadius = 3_000;
		const planetRadius = 6_371_000;

		expect(getApproachProxyDistance(planetRadius, 0, proxyRadius)).toBe(
			planetRadius,
		);
		expect(getApproachProxyDistance(
			planetRadius,
			24_000,
			proxyRadius,
		)).toBe(planetRadius + 24_000);
		expect(getApproachProxyDistance(
			planetRadius,
			350,
			proxyRadius,
			444,
		)).toBe(planetRadius + 794);
		expect(getApproachProxyScale(
			planetRadius,
			24_000,
			proxyRadius,
		)).toBeCloseTo(planetRadius / proxyRadius, 8);
		expect(getApproachProxyDistance(
			planetRadius,
			planetRadius,
			proxyRadius,
		)).toBe(proxyRadius * 2);
		expect(getPlanetNearViewTransition(24_000).terrainVisible).toBe(false);
		expect(getPlanetNearViewTransition(4_000)).toMatchObject({
			planetVisible: true,
			terrainVisible: false,
			terrainPrepared: true,
		});
		expect(getPlanetNearViewTransition(2_500)).toMatchObject({
			planetVisible: true,
			terrainVisible: true,
		});
		expect(getPlanetNearViewTransition(1_200).planetVisible).toBe(false);
	});

	test('covers the geometric horizon with contiguous LOD rings', () => {
		const radius = 6_371_000;
		const horizon = getPlanetHorizonDistance(radius, 1_200);
		expect(horizon).toBeGreaterThan(120_000);
		expect(horizon).toBeLessThan(130_000);

		for (let index = 1; index < PLANET_NEAR_VIEW_CHUNK_SPECS.length; index++) {
			const previous = PLANET_NEAR_VIEW_CHUNK_SPECS[index - 1];
			const current = PLANET_NEAR_VIEW_CHUNK_SPECS[index];
			const currentInnerRadius = current.sizeMeters * 0.5;
			expect(getChunkSpecCoverageRadius(previous)).toBe(
				currentInnerRadius,
			);
		}
	});

	test('selects a deterministic, non-polar landing site', () => {
		const sampler = new PlanetTerrainSampler(createDefinition());
		const first = selectPlanetLandingSite(sampler);
		const second = selectPlanetLandingSite(sampler);
		const sample = sampler.sample(first.direction);

		expect(first.direction.distanceTo(second.direction)).toBeLessThan(1e-12);
		expect(Math.abs(first.latitudeDegrees)).toBeLessThan(70);
		expect(first.slopeDegrees).toBeLessThanOrEqual(12);
		expect(sample.isWater).toBe(false);
		expect(['ice', 'snow', 'tundra']).not.toContain(first.biome);
	});

	test('derives deterministic surface colors from the production profile', () => {
		const definition = createDefinition();
		const sampler = new PlanetTerrainSampler(definition);
		const sample = sampler.sample(
			new THREE.Vector3(0.31, 0.74, -0.52).normalize(),
		);
		const profile = createPlanetNearViewVisualProfile(definition);
		const first = getNearViewSurfaceColor(sample, profile);
		const second = getNearViewSurfaceColor(sample, profile);

		expect(profile.palette).toBe('earthlike');
		expect(first.getHex()).toBe(second.getHex());
		expect(profile.atmosphereColor.getHexString()).toHaveLength(6);
	});
});

function findLandDirection(sampler: PlanetTerrainSampler): THREE.Vector3 {
	for (let index = 0; index < 512; index++) {
		const y = 1 - (index / 511) * 2;
		const radius = Math.sqrt(Math.max(0, 1 - y * y));
		const angle = index * Math.PI * (3 - Math.sqrt(5));
		const direction = new THREE.Vector3(
			Math.cos(angle) * radius,
			y,
			Math.sin(angle) * radius,
		);
		const sample = sampler.sample(direction);
		const position = direction.clone().multiplyScalar(
			sample.surfaceRadiusMeters + 1,
		);
		const landing = new PlanetLandingController(sampler).update(
			position,
			direction.clone().multiplyScalar(-2),
			true,
		);

		if (landing.canLand) {
			return direction;
		}
	}

	throw new Error('Expected deterministic test planet to contain landable terrain.');
}
