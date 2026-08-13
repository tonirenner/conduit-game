import * as THREE from 'three';

export type PlanetSurfaceCoordinate = {
	planetId: string;
	direction: THREE.Vector3;
	altitudeMeters: number;
};

export function createPlanetSurfaceCoordinate(
	planetId: string,
	direction: THREE.Vector3,
	altitudeMeters = 0,
): PlanetSurfaceCoordinate {
	if (direction.lengthSq() === 0) {
		throw new Error('Planet surface direction must not be zero.');
	}

	return {
		planetId,
		direction: direction.clone().normalize(),
		altitudeMeters,
	};
}

export function surfaceCoordinateToPlanetPosition(
	coordinate: PlanetSurfaceCoordinate,
	planetRadiusMeters: number,
	target = new THREE.Vector3(),
): THREE.Vector3 {
	return target
		.copy(coordinate.direction)
		.normalize()
		.multiplyScalar(planetRadiusMeters + coordinate.altitudeMeters);
}

export function planetPositionToSurfaceCoordinate(
	planetId: string,
	position: THREE.Vector3,
	planetRadiusMeters: number,
): PlanetSurfaceCoordinate {
	const distance = position.length();

	if (distance === 0) {
		throw new Error('Planet position must not be at the planet center.');
	}

	return {
		planetId,
		direction: position.clone().multiplyScalar(1 / distance),
		altitudeMeters: distance - planetRadiusMeters,
	};
}

export function getSurfaceLatitudeLongitude(
	direction: THREE.Vector3,
): { latitudeRadians: number; longitudeRadians: number } {
	const normal = direction.clone().normalize();

	return {
		latitudeRadians: Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)),
		longitudeRadians: Math.atan2(normal.z, normal.x),
	};
}
