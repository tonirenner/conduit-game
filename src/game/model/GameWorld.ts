import type { StarSystemDefinition } from '../../system/model/StarSystemDefinition';

export type FactionId =
	| 'player'
	| 'neutral'
	| 'opponent';

export type StrategicNodeKind =
	| 'homeworld'
	| 'resource'
	| 'research'
	| 'outer'
	| 'frontier'
	| 'chokepoint';

export type Vector3Like = {
	x: number;
	y: number;
	z: number;
};

export type StrategicNode = {
	id: string;
	name: string;
	kind: StrategicNodeKind;
	system: StarSystemDefinition;

	/**
	 * Abstract strategic-map coordinates.
	 * Intentionally not meters.
	 */
	position: {
		x: number;
		y: number;
	};

	owner: FactionId;
	resourceRate: number;
	shipyardSlots: number;
};

export type StrategicLane = {
	id: string;
	fromNodeId: string;
	toNodeId: string;
	travelTimeSeconds: number;
	stability: number;
};

export type ShipRole =
	| 'scout'
	| 'fighter'
	| 'frigate'
	| 'carrier'
	| 'constructor';

export type ShipDefinition = {
	id: string;
	name: string;
	role: ShipRole;
	factionId: FactionId;
	nodeId: string;

	/** Abstract strategic-map position. */
	position: Vector3Like;

	/** Abstract strategic-map velocity. */
	velocity: Vector3Like;

	/** Physical position inside a star system in meters. */
	systemPosition: Vector3Like;

	/** Physical velocity inside a star system in meters / second. */
	systemVelocity: Vector3Like;

	hull: number;
	maxHull: number;

	/** Tactical/SystemView maximum speed in meters / second. */
	maxSpeed: number;

	/** Strategic-map speed in abstract map units / second. */
	strategicMaxSpeed: number;

	/** Steering response in 1 / second. */
	turnRate: number;

	/** Remaining weapon cooldown in seconds. */
	weaponCooldownSeconds?: number;
};

export type FleetHoldOrder = {
	type: 'hold';
};

export type FleetTacticalMoveOrder = {
	type: 'move_tactical';
	space: 'strategic' | 'system';
	nodeId?: string;

	/**
	 * strategic -> abstract map coordinates
	 * system    -> meters
	 */
	target: Vector3Like;
};

/**
 * Physical approach to a wormhole inside SystemView.
 *
 * The fleet must first fly to entryPosition. Only after reaching the
 * wormhole does FleetSimulation switch to move_strategic.
 */
export type FleetMoveToWormholeOrder = {
	type: 'move_to_wormhole';
	targetNodeId: string;

	/** Wormhole center in physical system coordinates (meters). */
	entryPosition: Vector3Like;
};

export type FleetStrategicMoveOrder = {
	type: 'move_strategic';
	targetNodeId: string;
	progress: number;
	durationSeconds: number;
};

export type FleetAttackOrder = {
	type: 'attack_fleet';
	targetFleetId: string;
};

export type FleetOrder =
	| FleetHoldOrder
	| FleetTacticalMoveOrder
	| FleetMoveToWormholeOrder
	| FleetStrategicMoveOrder
	| FleetAttackOrder;

export type Fleet = {
	id: string;
	name: string;
	factionId: FactionId;
	nodeId: string;
	shipIds: string[];
	hotkey?: number;
	order: FleetOrder;
};


export type CombatWeaponKind =
	| 'laser'
	| 'railgun';

export type CombatEvent = {
	id: string;
	type: 'turret_fire';
	sourceShipId: string;
	targetShipId: string;
	weaponKind: CombatWeaponKind;
	damage: number;
};

export type ShipOrderOverrides = Record<string, FleetOrder>;

export type OrbitalStationType =
	| 'shipyard'
	| 'shipyard_small'
	| 'shipyard_large'
	| 'refinery'
	| 'research'
	| 'headquarters';

export type StationBuildState =
	| 'constructing'
	| 'operational';

export type ProductionQueueItem = {
	id: string;
	buildableId: ShipRole;
	elapsedSeconds: number;
	durationSeconds: number;
};

export type OrbitalStationDefinition = {
	id: string;
	name: string;
	type: OrbitalStationType;
	factionId: FactionId;
	nodeId: string;

	/** Physical system position in meters. */
	position: Vector3Like;

	buildState: StationBuildState;
	constructionProgress: number;
	constructionDurationSeconds: number;
	productionQueue: ProductionQueueItem[];

	/** Refinery binding. Other station types leave these undefined. */
	targetPlanetId?: string;
	targetPlanetName?: string;
};

export type GameWorld = {
	seed: number;
	nodes: StrategicNode[];
	lanes: StrategicLane[];
	ships: ShipDefinition[];
	fleets: Fleet[];
	stations: OrbitalStationDefinition[];
	selectedFleetId: string | null;
	shipOrderOverrides?: ShipOrderOverrides;
	combatEvents?: CombatEvent[];
};
