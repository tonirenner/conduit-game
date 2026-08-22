import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { generatePlanetDefinition } from '../src/generation';
import { evaluateSurfaceTerrainMaterial } from '../src/rendering/surface/SurfaceTerrainMaterial';

const direction = new THREE.Vector3(0.72, 0.18, -0.67).normalize();

function createDefinition(water: number) {
	const definition = generatePlanetDefinition(550021, {
		forcePlanetClass: 'ocean',
		semiMajorAxis: 1,
		starIrradiance: 1,
	});
	definition.surface.hasOcean = true;
	definition.composition.water = water;
	return definition;
}

function createInput(isWater: boolean) {
	return {
		direction,
		detailOffset: new THREE.Vector3(),
		height: 0.08,
		landMask: isWater ? 0.34 : 0.82,
		mountainMask: 0.18,
		erosionMask: 0.12,
		riverMask: 0,
		isWater,
		slope: 0.14,
	};
}

describe('composition.water surface migration', () => {
	test('changes only the appearance of already-classified water', () => {
		const lowWater = evaluateSurfaceTerrainMaterial(
			createDefinition(0.05),
			createInput(true),
		);
		const highWater = evaluateSurfaceTerrainMaterial(
			createDefinition(0.75),
			createInput(true),
		);

		expect(highWater.color.equals(lowWater.color)).toBe(false);
		expect(highWater.roughness).toBeLessThan(lowWater.roughness);
		expect(lowWater.metalness).toBe(0);
		expect(highWater.metalness).toBe(0);
	});

	test('does not create a composition-driven land material change', () => {
		const lowWater = evaluateSurfaceTerrainMaterial(
			createDefinition(0.05),
			createInput(false),
		);
		const highWater = evaluateSurfaceTerrainMaterial(
			createDefinition(0.75),
			createInput(false),
		);

		expect(highWater.color.equals(lowWater.color)).toBe(true);
		expect(highWater.roughness).toBe(lowWater.roughness);
		expect(highWater.metalness).toBe(lowWater.metalness);
	});

	test('keeps toxic water influence neutral until toxic shading owns it', () => {
		const lowWaterDefinition = createDefinition(0.05);
		const highWaterDefinition = createDefinition(0.75);
		lowWaterDefinition.class = 'toxic';
		highWaterDefinition.class = 'toxic';

		const lowWater = evaluateSurfaceTerrainMaterial(
			lowWaterDefinition,
			createInput(true),
		);
		const highWater = evaluateSurfaceTerrainMaterial(
			highWaterDefinition,
			createInput(true),
		);

		expect(highWater.color.equals(lowWater.color)).toBe(true);
		expect(highWater.roughness).toBe(lowWater.roughness);
	});
});
