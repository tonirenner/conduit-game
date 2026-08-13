import type * as THREE from 'three';

import {createPlanetSurfaceMaterial} from '../PlanetSurfaceMaterial';
import {createPlanetSurfaceNodeMaterial} from '../PlanetSurfaceNodeMaterial';

import type {TerrainTextureSet} from '../TerrainTextureSet';
import type {SurfaceRenderProfile} from '../rendering/SurfaceRenderProfile';

export type PlanetSurfaceMaterialRendererMode = 'webgl' | 'webgpu';

export type PlanetSurfaceRuntimeMaterial = THREE.Material & {
	uniforms?: Record<string, {
		value: unknown;
	}>;
	setRenderTuning?: (tuning: PlanetSurfaceRenderTuning) => void;
	setTerrainSeed?: (seed: number) => void;
	setSurfaceProfile?: (profile: SurfaceRenderProfile) => void;
	setForcedLavaSurface?: (enabled: boolean) => void;
	setRaymarchedSurfaceEnabled?: (enabled: boolean) => void;
	setSurfaceRaymarchSteps?: (steps: number) => void;
	getSurfaceRaymarchSteps?: () => number;
	setBakedTerrainBlend?: (value: number) => void;
	getSurfaceProfileStats?: () => unknown;
	setSunDirection?: (direction: THREE.Vector3) => void;
};

export type PlanetSurfaceRenderTuning = {
	ambient?: number;
	exposure?: number;
};

export type PlanetSurfaceMaterialFactoryOptions = {
	rendererMode: PlanetSurfaceMaterialRendererMode;
	radius: number;
	atmosphereRadius: number;
	terrainTextureSet: TerrainTextureSet | null;
};

export function createPlanetSurfaceRuntimeMaterial(
	options: PlanetSurfaceMaterialFactoryOptions,
): PlanetSurfaceRuntimeMaterial {
	if (options.rendererMode === 'webgpu') {
		return createPlanetSurfaceNodeMaterial(
			options.radius,
			options.terrainTextureSet,
		) as PlanetSurfaceRuntimeMaterial;
	}

	return createPlanetSurfaceMaterial(
		options.radius,
		options.atmosphereRadius,
	) as PlanetSurfaceRuntimeMaterial;
}
