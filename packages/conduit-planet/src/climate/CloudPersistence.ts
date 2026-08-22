import * as THREE from 'three';
import type { PlanetClimateDefinition } from '../model';
import { clamp01 } from '../internal/ProceduralMath';
import type { ClimateSample } from './Climate';
import { getWeatherSample, type WeatherSample } from './Weather';

/**
 * Converts canonical weather time into the slower/faster time used only by
 * storm-cell and swirl structure.
 *
 * cloudPersistence = 0.5 preserves historical timing exactly.
 * Lower values make cloud/storm structure evolve faster; higher values make it
 * evolve more slowly without changing the baseline cloud amount.
 */
export function getCloudStructureTime(
	weatherTime: number,
	definition: PlanetClimateDefinition,
): number {
	if (!Number.isFinite(weatherTime)) {
		throw new Error('Weather time must be finite.');
	}

	const persistence = clamp01(definition.cloudPersistence);
	const structureSpeed = 1.6 - persistence * 1.2;
	return weatherTime * structureSpeed;
}

export function getPersistentWeatherSample(
	normal: THREE.Vector3,
	climate: ClimateSample,
	weatherTime: number,
	definition: PlanetClimateDefinition,
): WeatherSample {
	return getWeatherSample(
		normal,
		climate,
		weatherTime,
		definition,
		{
			cloudStructureTime: getCloudStructureTime(weatherTime, definition),
		},
	);
}
