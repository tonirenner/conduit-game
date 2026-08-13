import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { getClimateSample, getWeatherSample } from '../src/climate';

import {
	createMulberry32,
	setSeededVectorOffset,
} from '../src/internal/DeterministicRandom';
import { createAtmosphereLayerProfile } from '../src/rendering/AtmosphereVisualProfile';
import { createCloudLayerProfile } from '../src/rendering/CloudVisualProfile';
import { sampleColorRamp } from '../src/rendering/ColorRamp';
import {
	appendRegularGridIndices,
	createStitchedGridIndices,
	createDefaultCubeFaces,
	getCubeFaceIndex,
} from '../src/terrain/TerrainGeometryUtils';
import { createTerrainSeedConfig, noise3d } from '../src/terrain/noise';

describe('planet internal helpers', () => {
	test('preserves deterministic random sequences and seed offsets', () => {
		const random = createMulberry32(1234);

		expect([random(), random(), random()]).toEqual([
			0.07329497812315822,
			0.7034119898453355,
			0.9028560190927237,
		]);

		const offset = setSeededVectorOffset(new THREE.Vector3(), 0);
		expect(offset.toArray()).toEqual([
			60.99549148231745,
			-238.68685383349657,
			13.174579180777073,
		]);
	});

	test('derives renderer-independent atmosphere and cloud profiles', () => {
		expect(createAtmosphereLayerProfile(
			1.25,
			0.4,
			'#8ec5ff',
			'lava',
		)).toEqual({
			tint: '#ff3a16',
			lavaMix: 1,
			sunIntensity: 43.68,
			atmosphereAlpha: 0.6384000000000001,
			scatteringBoost: 0.9026999999999998,
			opacity: 0.44,
		});

		expect(createCloudLayerProfile(
			0.6,
			1.25,
			{
				cloudPersistence: 0.7,
				stormActivity: 0.4,
				windStrength: 0.5,
				ashLoad: 0.1,
			},
		)).toEqual({
			coverage: 0.522,
			density: 2.1900000000000004,
			alpha: 0.66784,
			climateInfluence: 0.306,
			weatherInfluence: 0.20800000000000002,
			stormInfluence: 0.132,
			driftScale: 1.2000000000000002,
		});
	});

	test('builds regular grid indices and cube-face mappings', () => {
		const indices: number[] = [];
		appendRegularGridIndices(indices, 2);

		expect(indices).toEqual([
			0, 1, 3, 1, 4, 3,
			1, 2, 4, 2, 5, 4,
			3, 4, 6, 4, 7, 6,
			4, 5, 7, 5, 8, 7,
		]);
		expect(getCubeFaceIndex(new THREE.Vector3(1, 0, 0))).toBe(0);
		expect(getCubeFaceIndex(new THREE.Vector3(0, 0, -1))).toBe(5);

		const faces = createDefaultCubeFaces();
		expect(faces).toHaveLength(6);
		expect(faces.map((face) => face.normal.toArray())).toEqual([
			[1, 0, 0],
			[-1, 0, 0],
			[0, 1, 0],
			[0, -1, 0],
			[0, 0, 1],
			[0, 0, -1],
		]);
		expect(faces.map((face) => face.up.toArray())).toEqual([
			[0, 1, 0],
			[0, 1, 0],
			[0, 0, 1],
			[0, 0, -1],
			[0, 1, 0],
			[0, 1, 0],
		]);
		expect(faces.map((face) => face.right.toArray())).toEqual([
			[0, 0, -1],
			[0, 0, 1],
			[-1, 0, 0],
			[-1, 0, 0],
			[1, 0, 0],
			[-1, 0, 0],
		]);
	});

	test('collapses fine edge vertices for two-to-one LOD stitching', () => {
		const regular = createStitchedGridIndices(4, {
			top: false,
			right: false,
			bottom: false,
			left: false,
		});
		const stitched = createStitchedGridIndices(4, {
			top: true,
			right: false,
			bottom: false,
			left: false,
		});

		expect(regular).toContain(1);
		expect(regular).toContain(3);
		expect(stitched).not.toContain(1);
		expect(stitched).not.toContain(3);
		expect(stitched).toHaveLength(regular.length);
	});

	test('samples parameterized color ramps without changing boundaries', () => {
		const ramp = [
			{ start: 0, end: 0.5, from: 0x000000, to: 0xffffff },
		] as const;

		expect(sampleColorRamp(0.25, ramp)?.getHex()).toBe(0xbcbcbc);
		expect(sampleColorRamp(0.5, ramp)).toBeNull();
	});

	test('preserves climate, weather, and terrain golden samples', () => {
		const normal = new THREE.Vector3(0.25, 0.7, -0.45).normalize();
		const climate = getClimateSample(normal, 0.12, 0.68);
		const weather = getWeatherSample(normal, climate, 1.25);
		const terrain = createTerrainSeedConfig(1234, 'oceanic');

		expect(climate.biome).toBe('tundra');
		expect(climate.humidity).toBeCloseTo(0.45848602582639125, 12);
		expect(climate.snow).toBeCloseTo(0.30601287953937545, 12);
		expect(weather.stormPotential).toBeCloseTo(0.36406925406752233, 12);
		expect(weather.cloudBoost).toBeCloseTo(0.46784639001298667, 12);
		expect(terrain.continentOffset.toArray()).toEqual([
			-204.81841050088406,
			97.63775512576103,
			193.3708891645074,
		]);
		expect(noise3d(1.2, -0.7, 2.4)).toBeCloseTo(
			0.3486979898062034,
			12,
		);
	});
});
