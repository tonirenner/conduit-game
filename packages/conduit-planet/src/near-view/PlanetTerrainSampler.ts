import * as THREE from 'three';
import { getClimateSample, type BiomeId, type ClimateSample } from '../climate';
import type { PlanetDefinition } from '../model';
import { resolveTerrainProfileKind } from '@conduit/planet/rendering';
import {
	createTerrainSeedConfig,
	getTerrainSample,
	type TerrainSample,
	type TerrainSeedConfig,
} from '../terrain/noise';
import {
	createPlanetElevationProfile,
	getPlanetElevationMeters,
	type PlanetElevationProfile,
} from './PlanetElevationProfile';
import { getPlanetRadiusMeters } from './PlanetPhysicalScale';

export type PlanetSurfaceSample = {
	direction: THREE.Vector3;
	elevationMeters: number;
	surfaceRadiusMeters: number;
	normal: THREE.Vector3;
	landMask: number;
	isWater: boolean;
	biome: BiomeId;
	climate: ClimateSample;
	rawTerrain: TerrainSample;
};

export class PlanetTerrainSampler {
	readonly elevationProfile: PlanetElevationProfile;
	readonly terrainSeedConfig: TerrainSeedConfig;
	readonly radiusMeters: number;

	constructor(readonly definition: PlanetDefinition) {
		this.radiusMeters = getPlanetRadiusMeters(definition);
		this.elevationProfile = createPlanetElevationProfile(definition);
		this.terrainSeedConfig = createTerrainSeedConfig(
			definition.render.terrainSeed,
			resolveTerrainProfileKind(definition.class),
		);
	}

	sample(
		direction: THREE.Vector3,
		includeTerrainNormal = true,
	): PlanetSurfaceSample {
		const normalDirection = direction.clone().normalize();
		const rawTerrain = getTerrainSample(
			normalDirection,
			this.terrainSeedConfig,
		);
		const elevationMeters = getPlanetElevationMeters(
			rawTerrain.height,
			this.elevationProfile,
		);
		const climate = getClimateSample(
			normalDirection,
			rawTerrain.height,
			rawTerrain.landMask,
		);

		return {
			direction: normalDirection,
			elevationMeters,
			surfaceRadiusMeters:
				this.radiusMeters + elevationMeters,
			normal: includeTerrainNormal
				? this.sampleNormal(normalDirection)
				: normalDirection.clone(),
			landMask: rawTerrain.landMask,
			isWater:
				this.definition.surface.hasOcean &&
				rawTerrain.landMask < 0.54,
			biome: climate.biome,
			climate,
			rawTerrain,
		};
	}

	getSurfacePosition(
		direction: THREE.Vector3,
		target = new THREE.Vector3(),
	): THREE.Vector3 {
		const sample = this.sample(direction);

		return target
			.copy(sample.direction)
			.multiplyScalar(sample.surfaceRadiusMeters);
	}

	private sampleNormal(direction: THREE.Vector3): THREE.Vector3 {
		const tangentA = new THREE.Vector3();
		const tangentB = new THREE.Vector3();
		const reference = Math.abs(direction.y) < 0.9
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		tangentA.crossVectors(reference, direction).normalize();
		tangentB.crossVectors(direction, tangentA).normalize();

		const angularStep = 2 / Math.max(1, this.radiusMeters);
		const samplePosition = (offsetA: number, offsetB: number) => {
			const sampleDirection = direction.clone()
				.addScaledVector(tangentA, offsetA * angularStep)
				.addScaledVector(tangentB, offsetB * angularStep)
				.normalize();
			const terrain = getTerrainSample(sampleDirection, this.terrainSeedConfig);
			const elevation = getPlanetElevationMeters(
				terrain.height,
				this.elevationProfile,
			);

			return sampleDirection.multiplyScalar(
				this.radiusMeters + elevation,
			);
		};

		const left = samplePosition(-1, 0);
		const right = samplePosition(1, 0);
		const down = samplePosition(0, -1);
		const up = samplePosition(0, 1);

		return right.sub(left)
			.cross(up.sub(down))
			.normalize();
	}
}
