import {
	BUILD_CATALOG,
	type ShipBuildableId,
	type StationBuildableId,
} from '../build/BuildCatalog';
import type {
	FactionId,
	GameWorld,
	OrbitalStationDefinition,
	OrbitalStationType,
	ShipDefinition,
	ShipRole,
	Vector3Like,
} from '../model/GameWorld';
import { KILOMETER } from '../spatial/SpatialUnits';

export type AddStationOptions = {
	nodeId: string;
	factionId: FactionId;
	buildableId: StationBuildableId;
	position: Vector3Like;
	targetPlanetId?: string;
	targetPlanetName?: string;
};

export function addBuildStation(
	world: GameWorld,
	options: AddStationOptions,
): GameWorld {
	const definition = BUILD_CATALOG[options.buildableId];
	const stationType = definition.stationType;

	if (!stationType) {
		return world;
	}

	const stationIndex = world.stations.length + 1;
	const station: OrbitalStationDefinition = {
		id: `station-${options.nodeId}-${stationIndex}`,
		name: `${definition.label} ${stationIndex}`,
		type: stationType,
		factionId: options.factionId,
		nodeId: options.nodeId,
		position: {
			...options.position,
		},
		buildState: 'constructing',
		constructionProgress: 0,
		constructionDurationSeconds: definition.buildTimeSeconds,
		productionQueue: [],
		targetPlanetId: options.targetPlanetId,
		targetPlanetName: options.targetPlanetName,
	};

	return {
		...world,
		stations: [
			...world.stations,
			station,
		],
	};
}

export function enqueueShipProduction(
	world: GameWorld,
	stationId: string,
	buildableId: ShipBuildableId,
): GameWorld {
	const definition = BUILD_CATALOG[buildableId];

	if (!definition.shipRole) {
		return world;
	}

	return {
		...world,
		stations: world.stations.map((station) => {
			if (
				station.id !== stationId ||
				station.buildState !== 'operational' ||
				!canStationProduce(station.type, definition.shipRole)
			) {
				return station;
			}

			const queueNumber = station.productionQueue.length + 1;

			return {
				...station,
				productionQueue: [
					...station.productionQueue,
					{
						id: `${station.id}-queue-${Date.now()}-${queueNumber}`,
						buildableId: definition.shipRole,
						elapsedSeconds: 0,
						durationSeconds: definition.buildTimeSeconds,
					},
				],
			};
		}),
	};
}

export function updateProductionSystem(
	world: GameWorld,
	deltaSeconds: number,
): GameWorld {
	let nextWorld: GameWorld = {
		...world,
		stations: world.stations.map((station) => ({
			...station,
			position: { ...station.position },
			productionQueue: station.productionQueue.map((item) => ({ ...item })),
		})),
	};

	const completedShips: Array<{
		station: OrbitalStationDefinition;
		role: ShipRole;
	}> = [];

	nextWorld = {
		...nextWorld,
		stations: nextWorld.stations.map((station) => {
			if (station.buildState === 'constructing') {
				const progress =
					station.constructionProgress +
					deltaSeconds / Math.max(0.1, station.constructionDurationSeconds);

				if (progress >= 1) {
					return {
						...station,
						buildState: 'operational',
						constructionProgress: 1,
					};
				}

				return {
					...station,
					constructionProgress: progress,
				};
			}

			if (station.productionQueue.length === 0) {
				return station;
			}

			const [current, ...rest] = station.productionQueue;
			const elapsedSeconds = current.elapsedSeconds + deltaSeconds;

			if (elapsedSeconds < current.durationSeconds) {
				return {
					...station,
					productionQueue: [
						{
							...current,
							elapsedSeconds,
						},
						...rest,
					],
				};
			}

			completedShips.push({
				station,
				role: current.buildableId,
			});

			return {
				...station,
				productionQueue: rest,
			};
		}),
	};

	for (const completed of completedShips) {
		nextWorld = spawnUnassignedShip(
			nextWorld,
			completed.station,
			completed.role,
		);
	}

	return nextWorld;
}

export function getProductionQueueProgress(
	station: OrbitalStationDefinition,
): Array<{
	label: string;
	progress: number;
}> {
	return station.productionQueue.map((item) => ({
		label: BUILD_CATALOG[item.buildableId].label,
		progress:
			item.durationSeconds > 0
				? Math.min(1, item.elapsedSeconds / item.durationSeconds)
				: 1,
	}));
}

function canStationProduce(
	stationType: OrbitalStationType,
	role: ShipRole,
): boolean {
	switch (stationType) {
		case 'shipyard':
		case 'shipyard_small':
			return role === 'scout' || role === 'fighter' || role === 'constructor';

		case 'shipyard_large':
			return role === 'fighter' || role === 'frigate' || role === 'constructor' || role === 'carrier';

		case 'refinery':
		case 'research':
		case 'headquarters':
			return false;
	}
}

function spawnUnassignedShip(
	world: GameWorld,
	station: OrbitalStationDefinition,
	role: ShipRole,
): GameWorld {
	const strategicNode = world.nodes.find((node) => node.id === station.nodeId);
	const shipNumber = world.ships.filter(
		(ship) => ship.factionId === station.factionId,
	).length + 1;

	const ship = createBuiltShip(
		station.factionId,
		station.nodeId,
		role,
		shipNumber,
		{
			x: (strategicNode?.position.x ?? 0) + 0.4,
			y: 0,
			z: strategicNode?.position.y ?? 0,
		},
		{
			x: station.position.x + 1.4 * KILOMETER,
			y: station.position.y,
			z: station.position.z + 0.35 * KILOMETER,
		},
	);

	/*
	 * Current simulation still requires every ship to belong to a Fleet.
	 * Phase 1 therefore creates a one-ship HOLD group instead of adding the
	 * new ship to an existing combat fleet. When Fleet Groups land, these
	 * temporary groups can be merged / dissolved without changing production.
	 */
	const holdingFleetId = `unassigned-${ship.id}`;

	return {
		...world,
		ships: [
			...world.ships,
			ship,
		],
		fleets: [
			...world.fleets,
			{
				id: holdingFleetId,
				name: `Unassigned · ${ship.name}`,
				factionId: ship.factionId,
				nodeId: ship.nodeId,
				shipIds: [ship.id],
				order: {
					type: 'hold',
				},
			},
		],
	};
}

function createBuiltShip(
	factionId: FactionId,
	nodeId: string,
	role: ShipRole,
	shipNumber: number,
	position: Vector3Like,
	systemPosition: Vector3Like,
): ShipDefinition {
	const hull = getShipHull(role);

	return {
		id: `${factionId}-${nodeId}-${role}-${shipNumber}`,
		name: `${BUILD_CATALOG[role].label} ${shipNumber}`,
		role,
		factionId,
		nodeId,
		position: { ...position },
		velocity: { x: 0, y: 0, z: 0 },
		systemPosition: { ...systemPosition },
		systemVelocity: { x: 0, y: 0, z: 0 },
		hull,
		maxHull: hull,
		maxSpeed: getSystemSpeed(role),
		strategicMaxSpeed: getStrategicSpeed(role),
		turnRate: getTurnRate(role),
	};
}

function getShipHull(role: ShipRole): number {
	switch (role) {
		case 'scout':
			return 70;
		case 'fighter':
			return 90;
		case 'constructor':
			return 95;
		case 'frigate':
			return 160;
		case 'carrier':
			return 260;
	}
}

function getSystemSpeed(role: ShipRole): number {
	switch (role) {
		case 'carrier':
			return 3.2 * KILOMETER;
		case 'frigate':
			return 4.6 * KILOMETER;
		case 'constructor':
			return 5.4 * KILOMETER;
		case 'fighter':
			return 7.4 * KILOMETER;
		case 'scout':
			return 8.2 * KILOMETER;
	}
}

function getStrategicSpeed(role: ShipRole): number {
	switch (role) {
		case 'carrier':
			return 3.2;
		case 'frigate':
			return 4.6;
		case 'constructor':
			return 5.4;
		case 'fighter':
			return 7.4;
		case 'scout':
			return 8.2;
	}
}

function getTurnRate(role: ShipRole): number {
	switch (role) {
		case 'carrier':
			return 1.35;
		case 'frigate':
			return 2.2;
		case 'constructor':
			return 2.8;
		case 'fighter':
			return 3.6;
		case 'scout':
			return 4.0;
	}
}
