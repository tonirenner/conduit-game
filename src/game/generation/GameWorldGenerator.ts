import { SeededRandom } from '../../planet/generation/SeededRandom';
import { generateStarSystemDefinition } from '../../system/generation/StarSystemGenerator';
import { KILOMETER } from '../spatial/SpatialUnits';

import type {
	FactionId,
	Fleet,
	GameWorld,
	ShipDefinition,
	StrategicLane,
	StrategicNode,
	StrategicNodeKind,
} from '../model/GameWorld';

export type GameWorldGenerationOptions = {
	nodeCount?: number;
};

export function generateGameWorld(
	seed: number,
	options: GameWorldGenerationOptions = {},
): GameWorld {
	const random = new SeededRandom(seed);
	const nodeCount = Math.max(4, options.nodeCount ?? 7);
	const nodes = createStrategicNodes(seed, random, nodeCount);
	const lanes = createStrategicLanes(nodes, random);
	const ships = createInitialShips(nodes);
	const fleets = createInitialFleets(nodes, ships);

	return {
		seed,
		nodes,
		lanes,
		ships,
		fleets,
		stations: [],
		selectedFleetId: fleets[0]?.id ?? null,
	};
}

export function generateSingleplayerHomeRegion(
	seed: number,
): GameWorld {
	const world = generateGameWorld(seed, {
		nodeCount: 5,
	});
	const nodes = world.nodes.map((node, index) => {
		const template = SINGLEPLAYER_START_SYSTEMS[index] ??
			SINGLEPLAYER_START_SYSTEMS[SINGLEPLAYER_START_SYSTEMS.length - 1];

		return {
			...node,
			name: template.name,
			kind: template.kind,
			owner: 'player' as const,
			resourceRate: template.resourceRate,
			shipyardSlots: template.shipyardSlots,
			system: {
				...node.system,
				name: template.name,
			},
		};
	});
	const playerNodeIds = new Set(nodes.map((node) => node.id));
	const ships = world.ships.filter(
		(ship) =>
			ship.factionId === 'player' &&
			playerNodeIds.has(ship.nodeId),
	);
	const shipIds = new Set(ships.map((ship) => ship.id));
	const fleets = world.fleets
		.filter((fleet) => fleet.factionId === 'player')
		.map((fleet) => ({
			...fleet,
			name: fleet.nodeId === nodes[0]?.id ? 'Home Fleet' : fleet.name,
			shipIds: fleet.shipIds.filter((shipId) => shipIds.has(shipId)),
		}))
		.filter((fleet) => fleet.shipIds.length > 0);

	return {
		...world,
		nodes,
		ships,
		fleets,
		stations: [],
		selectedFleetId: fleets[0]?.id ?? null,
		shipOrderOverrides: {},
		combatEvents: [],
	};
}

const SINGLEPLAYER_START_SYSTEMS: Array<{
	name: string;
	kind: StrategicNodeKind;
	resourceRate: number;
	shipyardSlots: number;
}> = [
	{
		name: 'Home System',
		kind: 'homeworld',
		resourceRate: 12,
		shipyardSlots: 2,
	},
	{
		name: 'Resource System',
		kind: 'resource',
		resourceRate: 15,
		shipyardSlots: 1,
	},
	{
		name: 'Research Reach',
		kind: 'research',
		resourceRate: 7,
		shipyardSlots: 0,
	},
	{
		name: 'Frontier Line',
		kind: 'frontier',
		resourceRate: 8,
		shipyardSlots: 0,
	},
	{
		name: 'Outer System',
		kind: 'outer',
		resourceRate: 5,
		shipyardSlots: 0,
	},
];

function createStrategicNodes(
	seed: number,
	random: SeededRandom,
	nodeCount: number,
): StrategicNode[] {
	return Array.from({
		length: nodeCount,
	}).map((_, index) => {
		const angle = (index / nodeCount) * Math.PI * 2;
		const radius = index === 0 ? 0 : random.range(18, 44);
		const kind = getStrategicNodeKind(index, nodeCount);
		const owner = getInitialOwner(index, nodeCount);
		const nodeSeed = seed + index * 9973;

		return {
			id: `node-${index + 1}`,
			name: getNodeName(index),
			kind,
			system: generateStarSystemDefinition(
				nodeSeed,
				{
					id: `system-${nodeSeed}`,
					name: getNodeName(index),
					planetCount:
						kind === 'homeworld'
						? 6
						: random.int(3, 7),
				},
			),
			position: {
				x: Math.cos(angle) * radius + random.range(-5, 5),
				y: Math.sin(angle) * radius + random.range(-5, 5),
			},
			owner,
			resourceRate: getResourceRate(kind, random),
			shipyardSlots: kind === 'homeworld' ? 2 : kind === 'resource' ? 1 : 0,
		};
	});
}

function createStrategicLanes(
	nodes: StrategicNode[],
	random: SeededRandom,
): StrategicLane[] {
	const lanes: StrategicLane[] = [];

	for (let index = 1; index < nodes.length; index++) {
		lanes.push(createLane(nodes[0], nodes[index], random));
	}

	for (let index = 1; index < nodes.length; index++) {
		const nextIndex = index === nodes.length - 1 ? 1 : index + 1;

		if (random.chance(0.72)) {
			lanes.push(createLane(nodes[index], nodes[nextIndex], random));
		}
	}

	return lanes;
}

function createLane(
	from: StrategicNode,
	to: StrategicNode,
	random: SeededRandom,
): StrategicLane {
	const dx = from.position.x - to.position.x;
	const dy = from.position.y - to.position.y;
	const distance = Math.sqrt(dx * dx + dy * dy);

	return {
		id: `lane-${from.id}-${to.id}`,
		fromNodeId: from.id,
		toNodeId: to.id,
		travelTimeSeconds: Math.max(8, distance * random.range(0.55, 0.90)),
		stability: random.range(0.42, 1.0),
	};
}

function createInitialShips(nodes: StrategicNode[]): ShipDefinition[] {
	const playerHome = nodes.find((node) => node.owner === 'player') ?? nodes[0];
	const opponentHome =
		[...nodes].reverse().find((node) => node.owner === 'opponent') ??
		nodes[nodes.length - 1];

	return [
		...createFleetShips('player', playerHome, -3),
		...createFleetShips('opponent', opponentHome, 3),
		createMiddleSystemEnemyFrigate(nodes[0]),
	];
}

function createMiddleSystemEnemyFrigate(
	node: StrategicNode,
): ShipDefinition {
	/*
	 * Phase 4.1 combat test target:
	 * A single opponent Frigate lives in the central strategic system
	 * (node-1 / Anchor). It starts far outside all current weapon ranges,
	 * so entering the system does not immediately trigger a battle.
	 *
	 * Current longest basic weapon range is the Capital Ship at ~15 km.
	 * This spawn is roughly 65 km away from the player's initial cluster.
	 */
	return {
		id: `opponent-${node.id}-test-frigate`,
		name: 'Enemy Frigate',
		role: 'frigate',
		factionId: 'opponent',
		nodeId: node.id,
		position: {
			x: node.position.x + 0.6,
			y: 0,
			z: node.position.y - 0.4,
		},
		velocity: {
			x: 0,
			y: 0,
			z: 0,
		},
		systemPosition: {
			x: 52 * KILOMETER,
			y: 1.2 * KILOMETER,
			z: -42 * KILOMETER,
		},
		systemVelocity: {
			x: 0,
			y: 0,
			z: 0,
		},
		hull: 160,
		maxHull: 160,
		maxSpeed: 4.6 * KILOMETER,
		strategicMaxSpeed: 4.6,
		turnRate: 2.2,
	};
}

function createFleetShips(
	factionId: FactionId,
	node: StrategicNode,
	offset: number,
): ShipDefinition[] {
	return [
		{
			id: `${factionId}-${node.id}-carrier-1`,
			name: factionId === 'player' ? 'Capital Ship' : 'Enemy Capital Ship',
			role: 'carrier',
			factionId,
			nodeId: node.id,
			position: {
				x: node.position.x + offset,
				y: 0,
				z: node.position.y - 2.4,
			},
			velocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			systemPosition: {
				x: offset * 0.85 * KILOMETER,
				y: 0.75 * KILOMETER,
				z: 6.1 * KILOMETER,
			},
			systemVelocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			hull: 260,
			maxHull: 260,
			maxSpeed: 3.2 * KILOMETER,
			strategicMaxSpeed: 3.2,
			turnRate: 1.35,
		},
		{
			id: `${factionId}-${node.id}-scout-1`,
			name: 'Scout 1',
			role: 'scout',
			factionId,
			nodeId: node.id,
			position: {
				x: node.position.x + offset,
				y: 0,
				z: node.position.y,
			},
			velocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			systemPosition: {
				x: offset * 0.85 * KILOMETER,
				y: 0,
				z: 8 * KILOMETER,
			},
			systemVelocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			hull: 70,
			maxHull: 70,
			maxSpeed: 8.2 * KILOMETER,
			strategicMaxSpeed: 8.2,
			turnRate: 4.0,
		},
		{
			id: `${factionId}-${node.id}-frigate-1`,
			name: 'Frigate 1',
			role: 'frigate',
			factionId,
			nodeId: node.id,
			position: {
				x: node.position.x + offset,
				y: 0,
				z: node.position.y + 1.8,
			},
			velocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			systemPosition: {
				x: offset * 0.85 * KILOMETER,
				y: 0.35 * KILOMETER,
				z: 9.8 * KILOMETER,
			},
			systemVelocity: {
				x: 0,
				y: 0,
				z: 0,
			},
			hull: 160,
			maxHull: 160,
			maxSpeed: 4.6 * KILOMETER,
			strategicMaxSpeed: 4.6,
			turnRate: 2.2,
		},
	];
}

function createInitialFleets(
	nodes: StrategicNode[],
	ships: ShipDefinition[],
): Fleet[] {
	const fleets = nodes
		.filter((node) => node.owner === 'player' || node.owner === 'opponent')
		.map((node) => {
			const factionShips = ships.filter(
				(ship) =>
					ship.factionId === node.owner &&
					ship.id.includes(node.id) &&
					!ship.id.endsWith('-test-frigate'),
			);

			return {
				id: `fleet-${node.owner}-${node.id}`,
				name: `${node.owner} fleet`,
				factionId: node.owner,
				nodeId: node.id,
				shipIds: factionShips.map((ship) => ship.id),
				order: {
					type: 'hold',
				},
			};
		});

	const middleSystemEnemy =
		ships.find(
			(ship) =>
				ship.id === `opponent-${nodes[0]?.id}-test-frigate`,
		);

	if (middleSystemEnemy) {
		fleets.push({
			id: `fleet-opponent-${middleSystemEnemy.nodeId}-test-frigate`,
			name: 'Enemy Frigate Patrol',
			factionId: 'opponent',
			nodeId: middleSystemEnemy.nodeId,
			shipIds: [middleSystemEnemy.id],
			order: {
				type: 'hold',
			},
		});
	}

	return fleets;
}

function getStrategicNodeKind(
	index: number,
	nodeCount: number,
): StrategicNodeKind {
	if (index === 0 || index === nodeCount - 1) {
		return 'homeworld';
	}

	if (index % 3 === 0) {
		return 'chokepoint';
	}

	if (index % 2 === 0) {
		return 'resource';
	}

	return 'frontier';
}

function getInitialOwner(
	index: number,
	nodeCount: number,
): FactionId {
	if (index === 0) {
		return 'player';
	}

	if (index === nodeCount - 1) {
		return 'opponent';
	}

	return 'neutral';
}

function getResourceRate(
	kind: StrategicNodeKind,
	random: SeededRandom,
): number {
	switch (kind) {
		case 'homeworld':
			return random.range(8, 12);

		case 'resource':
			return random.range(7, 14);

		case 'research':
			return random.range(5, 9);

		case 'outer':
			return random.range(3, 6);

		case 'chokepoint':
			return random.range(2, 5);

		case 'frontier':
			return random.range(4, 8);
	}
}

function getNodeName(index: number): string {
	const names = [
		'Anchor',
		'Veil',
		'Kestral',
		'Nadir',
		'Lumen',
		'Rift',
		'Helix',
		'Bastion',
		'Vesper',
	];

	return names[index] ?? `Sector ${index + 1}`;
}
