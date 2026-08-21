import * as THREE from 'three';
import type { PlanetClimateDefinition } from '../model';
import { clamp01 } from '../internal/ProceduralMath';
import type { ClimateSample } from './Climate';
import { getWeatherSample, type WeatherSample } from './Weather';

/**
 * Applies slow orbital seasonality on top of the canonical fast weather sample.
 *
 * seasonPhase is normalized to [0, 1): one full orbit. Phase zero is the
 * simulation epoch/orbit reference and is deliberately not named as a specific
 * terrestrial season.
 *
 * The seasonal layer only changes storm/cloud/swirl response. Pressure topology,
 * wind bands and global wind strength stay owned by getWeatherSample().
 */
export function getSeasonalWeatherSample(
	normal: THREE.Vector3,
	climate: ClimateSample,
	time: number,
	definition: PlanetClimateDefinition,
	seasonPhase: number,
): WeatherSample {
	const base = getWeatherSample(normal, climate, time, definition);
	const phase = normalizePhase(seasonPhase);
	const seasonalWave = Math.sin(phase * Math.PI * 2);
	const hemisphereWeight = THREE.MathUtils.clamp(normal.y, -1, 1);
	const seasonalStrength = clamp01(definition.seasonality);
	const seasonalStormBias =
		seasonalWave * hemisphereWeight * seasonalStrength * 0.18;
	const stormPotential = clamp01(
		base.stormPotential + seasonalStormBias,
	);
	const cloudBoost = clamp01(
		climate.cloudPotential * 0.66 +
		base.lowPressure * 0.22 +
		stormPotential * 0.24 -
		base.highPressure * 0.12,
	);

	const stormRatio = base.stormPotential > 1e-6
		? stormPotential / base.stormPotential
		: 0;
	const swirl = base.stormPotential > 1e-6
		? clamp01(base.swirl * stormRatio)
		: base.swirl;

	return {
		...base,
		stormPotential,
		cloudBoost,
		swirl,
	};
}

function normalizePhase(value: number): number {
	if (!Number.isFinite(value)) {
		throw new Error('Season phase must be finite.');
	}

	return ((value % 1) + 1) % 1;
}
