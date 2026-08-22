import * as THREE from 'three';
import type { PlanetDefinition } from '../model';

/**
 * Canonical polar ice-cap mask shared by terrain sampling and surface shading.
 *
 * The mask is surface-domain truth only: it does not modify terrain geometry.
 * Consumers must not recreate their own latitude thresholds.
 */
export function getPlanetIceCapMask(
	definition: PlanetDefinition,
	direction: THREE.Vector3,
): number {
	if (!definition.surface.hasIceCaps) return 0;

	const polarLatitude = Math.abs(direction.y);
	const temperature = THREE.MathUtils.clamp(
		definition.climate.temperature01,
		0,
		1,
	);
	const iceAbundance = THREE.MathUtils.clamp(
		definition.composition.ice,
		0,
		1,
	);

	// Colder / ice-richer worlds extend their caps further toward the equator.
	// Warm, ice-poor worlds keep only narrow polar caps when the domain flag
	// explicitly says that caps exist.
	const capStart = THREE.MathUtils.clamp(
		0.88 - (1 - temperature) * 0.24 - iceAbundance * 0.16,
		0.46,
		0.90,
	);
	const capFull = Math.min(0.985, capStart + 0.12);

	return THREE.MathUtils.smoothstep(polarLatitude, capStart, capFull);
}
