import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import {
	evaluateSurfaceTerrainMaterial,
	type SurfaceTerrainMaterialInput,
} from '../src/rendering/surface/SurfaceTerrainMaterial';

const input: SurfaceTerrainMaterialInput = {
	direction: new THREE.Vector3(0.4, 0.7, -0.3).normalize(),
	detailOffset: new THREE.Vector3(),
	height: 0.14,
	landMask: 0.82,
	mountainMask: 0.62,
	erosionMask: 0.24,
	riverMask: 0,
	isWater: false,
	slope: 0.38,
};

function createRockyDefinition(metal: number) {
	const definition = generatePlanetDefinition(551122, {
		forcePlanetClass: 'rocky',
	});
	definition.composition = {
		...definition.composition,
		metal,
	};
	return definition;
}

describe('surface metal composition influence', () => {
	test('higher composition metal increases metalness and lowers roughness', () => {
		const low = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.02),
			input,
		);
		const high = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.55),
			input,
		);

		expect(high.metalness).toBeGreaterThan(low.metalness);
		expect(high.roughness).toBeLessThan(low.roughness);
	});

	test('higher composition metal also changes solid-surface albedo subtly', () => {
		const low = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.02),
			input,
		);
		const high = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.55),
			input,
		);

		expect(high.color.equals(low.color)).toBe(false);
	});

	test('water remains non-metallic regardless of composition metal', () => {
		const waterInput = {
			...input,
			isWater: true,
		};
		const low = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.02),
			waterInput,
		);
		const high = evaluateSurfaceTerrainMaterial(
			createRockyDefinition(0.90),
			waterInput,
		);

		expect(low.metalness).toBe(0);
		expect(high.metalness).toBe(0);
		expect(high.roughness).toBe(low.roughness);
		expect(high.color.equals(low.color)).toBe(true);
	});

	test('metal-rich class remains the full metal influence case', () => {
		const definition = generatePlanetDefinition(991177, {
			forcePlanetClass: 'metal_rich',
		});
		definition.composition = {
			...definition.composition,
			metal: 0,
		};

		const sample = evaluateSurfaceTerrainMaterial(definition, input);

		expect(sample.metalness).toBeGreaterThan(0.24);
		expect(sample.roughness).toBeLessThan(0.62);
	});
});
