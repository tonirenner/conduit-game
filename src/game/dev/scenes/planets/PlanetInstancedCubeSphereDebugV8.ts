import {
	abs,
	float,
	max,
	mx_noise_float,
	normalize,
	pow,
	smoothstep,
	vec3,
} from 'three/tsl';
import type { TerrainSeedConfig } from '@conduit/planet/terrain/noise';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV7,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV7';

export type { PlanetInstancedColorMode, PlanetInstancedCubeSphereStats };

type V7Runtime = {
	terrainConfig: TerrainSeedConfig;
	terrainHeightScale: number;
	createProceduralHeight: (direction: ReturnType<typeof normalize>) => unknown;
};

/**
 * Feature-Lab v8: keeps the proven v7 renderer/lifecycle intact and swaps only
 * its GPU height function for a macro profile that follows the production CPU
 * terrain structure more closely.
 *
 * Production getTerrainSample():
 * continent FBM -> coast -> land/highlands -> ridged mountain bands ->
 * foothills/mountains -> erosion/rivers/detail.
 *
 * V8 intentionally stops before erosion/rivers/detail. It keeps the same
 * thresholds and height weights while using fewer octaves so we can measure
 * the cost of a recognizable macro terrain before porting the expensive bits.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV7 {
	constructor(planetRadius: number) {
		super(planetRadius);

		// V7 is deliberately kept as the stable reference implementation. This
		// debug-only override avoids duplicating its ~20k lifecycle/atlas code just
		// to A/B one shader function.
		const runtime = this as unknown as V7Runtime;
		runtime.createProceduralHeight = (direction) =>
			createMacroTerrainHeight(
				direction,
				runtime.terrainConfig,
				runtime.terrainHeightScale,
			);
	}
}

function createMacroTerrainHeight(
	direction: ReturnType<typeof normalize>,
	config: TerrainSeedConfig,
	terrainHeightScale: number,
) {
	const continentOffset = vec3(
		config.continentOffset.x,
		config.continentOffset.y,
		config.continentOffset.z,
	);
	const ridgeOffset = vec3(
		config.ridgeOffset.x,
		config.ridgeOffset.y,
		config.ridgeOffset.z,
	);

	// mx_noise_float is signed MaterialX Perlin noise. Production CPU terrain
	// uses a 0..1 value noise, so normalize once here before building FBM/ridges.
	const noise01 = (position: any) =>
		mx_noise_float(position).mul(0.5).add(0.5);

	// Production FBM uses frequency *= 2 / amplitude *= .5. Keep the same
	// normalized weights, but cap the macro pass at five/three octaves.
	const fbm5 = (position: any) =>
		noise01(position).mul(0.51612903)
			.add(noise01(position.mul(2)).mul(0.25806452))
			.add(noise01(position.mul(4)).mul(0.12903226))
			.add(noise01(position.mul(8)).mul(0.06451613))
			.add(noise01(position.mul(16)).mul(0.03225806));

	const fbm3 = (position: any) =>
		noise01(position).mul(0.57142857)
			.add(noise01(position.mul(2)).mul(0.28571429))
			.add(noise01(position.mul(4)).mul(0.14285714));

	// Production ridgedFbm: ridge = 1 - abs(noise * 2 - 1), squared,
	// frequency *= 2.15 and amplitude *= .48.
	const ridgeSample = (position: any) => {
		const ridge = float(1).sub(abs(noise01(position).mul(2).sub(1)));
		return pow(max(ridge, 0), 2);
	};

	const ridged4 = (position: any) =>
		ridgeSample(position).mul(0.54915133)
			.add(ridgeSample(position.mul(2.15)).mul(0.26359264))
			.add(ridgeSample(position.mul(4.6225)).mul(0.12652447))
			.add(ridgeSample(position.mul(9.938375)).mul(0.06073156));

	const ridged3 = (position: any) =>
		ridgeSample(position).mul(0.58465854)
			.add(ridgeSample(position.mul(2.15)).mul(0.28063610))
			.add(ridgeSample(position.mul(4.6225)).mul(0.13470536));

	const ridged2 = (position: any) =>
		ridgeSample(position).mul(0.67567568)
			.add(ridgeSample(position.mul(2.15)).mul(0.32432432));

	const seededContinent = direction
		.mul(config.continentScale)
		.add(continentOffset);
	const continentBase = fbm5(seededContinent.mul(1.25));
	const coastNoise = fbm3(
		direction
			.mul(config.coastScale * 2.4)
			.add(continentOffset),
	).sub(0.5).mul(0.045);
	const continent = continentBase.add(coastNoise).sub(config.oceanBias);

	const landMask = smoothstep(0.525, 0.585, continent);
	const highlands = max(continent.sub(0.54), 0);
	const mountainMask = smoothstep(0.62, 0.78, continent).mul(landMask);

	const ridgeNormal = direction
		.mul(config.mountainScale)
		.add(ridgeOffset);
	const ridgeLarge = ridged4(ridgeNormal.mul(3.8));
	const ridgeMedium = ridged3(ridgeNormal.mul(8.5));
	const ridgeFine = ridged2(ridgeNormal.mul(18));

	const mountainChains = smoothstep(0.46, 0.84, ridgeLarge)
		.mul(ridgeMedium.mul(0.72).add(ridgeFine.mul(0.28)));

	// Erosion changes the production exponent dynamically (2.15 -> 1.45).
	// V8 uses the midpoint until the erosion mask itself moves to the GPU.
	const mountains = pow(max(mountainChains, 0), 1.8).mul(mountainMask);
	const foothills = smoothstep(0.48, 0.74, ridgeLarge)
		.mul(mountainMask)
		.mul(0.40);

	const macroHeight = max(
		landMask.mul(0.006)
			.add(highlands.mul(0.095))
			.add(foothills.mul(0.055))
			.add(mountains.mul(0.165)),
		0,
	).mul(config.heightScale);

	return macroHeight.mul(terrainHeightScale);
}
