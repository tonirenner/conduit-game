import * as THREE from 'three';
import { getClimateSample, type BiomeId, type ClimateSample } from '../climate';
import type { PlanetDefinition } from '../model';
import { resolveTerrainProfileKind } from '@conduit/planet/rendering';
import {
	getTerrainGeometryReliefRawHeight,
	getTerrainVolcanicMask,
} from '../terrain/TerrainGeometryRelief';
import { getPlanetIceCapMask } from '../terrain/PlanetSurfaceMasks';
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
	geometryRawHeight: number;
	geometryReliefRawHeight: number;
	volcanicMask: number;
	iceCapMask: number;
};

export class PlanetTerrainSampler {
	readonly elevationProfile: PlanetElevationProfile;
	readonly terrainSeedConfig: TerrainSeedConfig;
	readonly radiusMeters: number;
	readonly oceanLandMaskThreshold: number;
	readonly terrainRoughness: number;
	readonly hasTectonics: boolean;
	readonly hasVolcanism: boolean;
	readonly hasIceCaps: boolean;

	constructor(readonly definition: PlanetDefinition) {
		this.radiusMeters = getPlanetRadiusMeters(definition);
		this.elevationProfile = createPlanetElevationProfile(definition);
		this.terrainSeedConfig = createTerrainSeedConfig(
			definition.render.terrainSeed,
			resolveTerrainProfileKind(definition.class),
		);
		this.oceanLandMaskThreshold = THREE.MathUtils.clamp(
			definition.surface.oceanLevel,
			0,
			1,
		);
		this.terrainRoughness = THREE.MathUtils.clamp(
			definition.surface.terrainRoughness,
			0,
			1,
		);
		this.hasTectonics = definition.surface.hasTectonics;
		this.hasVolcanism = definition.surface.hasVolcanism;
		// Ice caps expose a canonical surface mask rather than modifying terrain
		// geometry. Material/climate consumers share this mask without inventing
		// independent polar thresholds.
		this.hasIceCaps = definition.surface.hasIceCaps;
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
		const geometryReliefRawHeight = getTerrainGeometryReliefRawHeight(
			normalDirection,
			rawTerrain,
			this.terrainSeedConfig,
			this.terrainRoughness,
			this.hasTectonics,
			this.hasVolcanism,
		);
		const volcanicMask = getTerrainVolcanicMask(
			normalDirection,
			rawTerrain,
			this.terrainSeedConfig,
			this.hasVolcanism,
		);
		const iceCapMask = getPlanetIceCapMask(
			this.definition,
			normalDirection,
		);
		const geometryRawHeight = Math.max(
			0,
			rawTerrain.height + geometryReliefRawHeight,
		);
		const elevationMeters = getPlanetElevationMeters(
			geometryRawHeight,
			this.elevationProfile,
		);
		// Climate owns biome semantics. The generated planet climate definition
		// now supplies the per-planet seed and global temperature baseline while
		// terrain geometry remains independent.
		const climate = getClimateSample(
			normalDirection,
			rawTerrain.height,
			rawTerrain.landMask,
			this.definition.climate,
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
				rawTerrain.landMask < this.oceanLandMaskThreshold,
			biome: climate.biome,
			climate,
			rawTerrain,
			geometryRawHeight,
			geometryReliefRawHeight,
			volcanicMask,
			iceCapMask,
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
			const relief = getTerrainGeometryReliefRawHeight(
				sampleDirection,
				terrain,
				this.terrainSeedConfig,
				this.terrainRoughness,
				this.hasTectonics,
				this.hasVolcanism,
			);
			const elevation = getPlanetElevationMeters(
				Math.max(0, terrain.height + relief),
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
