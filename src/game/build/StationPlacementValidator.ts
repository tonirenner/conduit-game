import type { OrbitalStationType } from '../model/GameWorld';
import {
	BUILD_CATALOG,
	type StationBuildableId,
} from './BuildCatalog';

export type PlacementPoint = {
	x: number;
	y: number;
	z: number;
};

export type PlanetPlacementProxy = {
	id: string;
	name: string;
	position: PlacementPoint;
	radius: number;
};

export type StationPlacementProxy = {
	id: string;
	type: OrbitalStationType;
	position: PlacementPoint;
};

export type StationPlacementContext = {
	planets: PlanetPlacementProxy[];
	stations: StationPlacementProxy[];
	starPosition?: PlacementPoint;
	starClearance?: number;
};

export type StationPlacementResult = {
	valid: boolean;
	reason: string;
	targetPlanetId?: string;
	targetPlanetName?: string;
};

export function validateStationPlacement(
	buildableId: StationBuildableId,
	position: PlacementPoint,
	context: StationPlacementContext,
): StationPlacementResult {
	const definition = BUILD_CATALOG[buildableId];
	const ownClearance = definition.clearanceRenderUnits ?? 7;

	const starPosition = context.starPosition ?? { x: 0, y: 0, z: 0 };
	const starClearance = context.starClearance ?? 16;

	if (distance(position, starPosition) < starClearance + ownClearance) {
		return {
			valid: false,
			reason: 'Zu nah am Stern',
		};
	}

	for (const station of context.stations) {
		if (distance(position, station.position) < ownClearance + 5.5) {
			return {
				valid: false,
				reason: 'Zu nah an einer Station',
			};
		}
	}

	if (definition.placementRule === 'near_planet') {
		let closest: PlanetPlacementProxy | null = null;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (const planet of context.planets) {
			const currentDistance = distance(position, planet.position);

			if (currentDistance < closestDistance) {
				closest = planet;
				closestDistance = currentDistance;
			}
		}

		if (!closest) {
			return {
				valid: false,
				reason: 'Kein Planet im System',
			};
		}

		const minDistance = closest.radius + 4;
		const maxDistance = closest.radius + 24;

		if (closestDistance < minDistance) {
			return {
				valid: false,
				reason: `Zu nah an ${closest.name}`,
			};
		}

		if (closestDistance > maxDistance) {
			return {
				valid: false,
				reason: 'Raffinerie muss planetennah gebaut werden',
			};
		}

		return {
			valid: true,
			reason: `Planet: ${closest.name}`,
			targetPlanetId: closest.id,
			targetPlanetName: closest.name,
		};
	}

	for (const planet of context.planets) {
		if (distance(position, planet.position) < planet.radius + ownClearance + 2) {
			return {
				valid: false,
				reason: `Zu nah an ${planet.name}`,
			};
		}
	}

	return {
		valid: true,
		reason: 'Position gültig',
	};
}

function distance(a: PlacementPoint, b: PlacementPoint): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;

	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
