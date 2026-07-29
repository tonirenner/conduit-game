import type { StarSystemDefinition } from '../../system/model/StarSystemDefinition';

export type FactionId =
	| 'player'
	| 'neutral'
	| 'opponent';

export type StrategicNodeKind =
	| 'homeworld'
	| 'resource'
	| 'frontier'
	| 'chokepoint';

export type StrategicNode = {
	id: string;
	name: string;
	kind: StrategicNodeKind;
	system: StarSystemDefinition;
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
	position: {
		x: number;
		y: number;
		z: number;
	};
	velocity: {
		x: number;
		y: number;
		z: number;
	};
	systemPosition: {
		x: number;
		y: number;
		z: number;
	};
	systemVelocity: {
		x: number;
		y: number;
		z: number;
	};
	hull: number;
	maxHull: number;
	maxSpeed: number;
	turnRate: number;
};

export type FleetOrder =
	| {
		type: 'hold';
	}
	| {
		type: 'move_tactical';
		space: 'strategic' | 'system';
		nodeId?: string;
		target: {
			x: number;
			y: number;
			z: number;
		};
	}
	| {
		type: 'move_strategic';
		targetNodeId: string;
		progress: number;
		durationSeconds: number;
	}
	| {
		type: 'attack_fleet';
		targetFleetId: string;
	};

export type Fleet = {
	id: string;
	name: string;
	factionId: FactionId;
	nodeId: string;
	shipIds: string[];
	order: FleetOrder;
};

export type OrbitalStationType =
	| 'shipyard';

export type OrbitalStationDefinition = {
	id: string;
	name: string;
	type: OrbitalStationType;
	factionId: FactionId;
	nodeId: string;
	position: {
		x: number;
		y: number;
		z: number;
	};
};

export type GameWorld = {
	seed: number;
	nodes: StrategicNode[];
	lanes: StrategicLane[];
	ships: ShipDefinition[];
	fleets: Fleet[];
	stations: OrbitalStationDefinition[];
	selectedFleetId: string | null;
};
