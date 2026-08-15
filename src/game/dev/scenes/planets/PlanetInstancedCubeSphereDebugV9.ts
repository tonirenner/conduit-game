import * as THREE from 'three';
import { normalize, texture3D } from 'three/tsl';
import type { TerrainSeedConfig } from '@conduit/planet/terrain/noise';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV7,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV7';
import {
	createPlanetMacroHeightVolume,
	DEFAULT_MACRO_HEIGHT_VOLUME_RESOLUTION,
} from './PlanetMacroHeightVolume';

export type { PlanetInstancedColorMode, PlanetInstancedCubeSphereStats };

type V7Runtime = {
	terrainConfig: TerrainSeedConfig;
	terrainHeightScale: number;
	createProceduralHeight: (direction: ReturnType<typeof normalize>) => unknown;
};

/**
 * Feature-Lab v9: keeps the proven v7 topology/instancing lifecycle, but moves
 * expensive macro terrain noise out of the per-frame vertex shader.
 *
 * A small RGBA16F 3D direction LUT is baked once per seed/profile/config and
 * cached for the life of this debug renderer. Vertex displacement becomes one
 * trilinear texture3D lookup instead of many FBM/ridged-noise evaluations.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV7 {
	private readonly macroVolumes = new Map<string, THREE.Data3DTexture>();

	constructor(planetRadius: number) {
		super(planetRadius);

		const runtime = this as unknown as V7Runtime;
		runtime.createProceduralHeight = (direction) => {
			const volume = this.getMacroVolume(
				runtime.terrainConfig,
				runtime.terrainHeightScale,
			);
			const uvw = direction.mul(0.49).add(0.5);
			return texture3D(volume, uvw).x;
		};
	}

	override detach(): void {
		super.detach();
		for (const texture of this.macroVolumes.values()) texture.dispose();
		this.macroVolumes.clear();
	}

	private getMacroVolume(
		config: TerrainSeedConfig,
		terrainHeightScale: number,
	): THREE.Data3DTexture {
		const signature = createMacroVolumeSignature(config, terrainHeightScale);
		const cached = this.macroVolumes.get(signature);
		if (cached) return cached;

		const { texture } = createPlanetMacroHeightVolume(
			config,
			terrainHeightScale,
			DEFAULT_MACRO_HEIGHT_VOLUME_RESOLUTION,
		);
		this.macroVolumes.set(signature, texture);
		return texture;
	}
}

function createMacroVolumeSignature(
	config: TerrainSeedConfig,
	terrainHeightScale: number,
): string {
	return [
		config.seed,
		config.profile,
		config.continentScale.toFixed(6),
		config.coastScale.toFixed(6),
		config.mountainScale.toFixed(6),
		config.heightScale.toFixed(6),
		config.oceanBias.toFixed(6),
		config.continentOffset.toArray().map((value) => value.toFixed(4)).join(','),
		config.ridgeOffset.toArray().map((value) => value.toFixed(4)).join(','),
		terrainHeightScale.toFixed(8),
		DEFAULT_MACRO_HEIGHT_VOLUME_RESOLUTION,
	].join('|');
}
