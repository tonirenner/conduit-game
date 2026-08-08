import type { OrbitalStationType, ShipRole } from '../model/GameWorld';

export type BuildPlacementRule =
	| 'free_system'
	| 'near_planet';

export type BuildableCategory =
	| 'station'
	| 'ship';

export type ResourceCost = {
	credits: number;
	metal: number;
};

export type StationBuildableId =
	| 'shipyard_small'
	| 'shipyard_large'
	| 'refinery'
	| 'research'
	| 'headquarters';

export type ShipBuildableId =
	| 'scout'
	| 'fighter'
	| 'frigate'
	| 'constructor'
	| 'carrier';

export type BuildableId =
	| StationBuildableId
	| ShipBuildableId;

export type BuildableDefinition = {
	id: BuildableId;
	label: string;
	description: string;
	category: BuildableCategory;
	buildTimeSeconds: number;
	cost: ResourceCost;
	icon: string;
	stationType?: OrbitalStationType;
	shipRole?: ShipRole;
	placementRule?: BuildPlacementRule;
	clearanceRenderUnits?: number;
};

export const BUILD_CATALOG: Record<BuildableId, BuildableDefinition> = {
	shipyard_small: {
		id: 'shipyard_small',
		label: 'Small Shipyard',
		description: 'Produces scouts, fighters and constructors.',
		category: 'station',
		buildTimeSeconds: 18,
		cost: { credits: 900, metal: 520 },
		icon: 'SY',
		stationType: 'shipyard_small',
		placementRule: 'free_system',
		clearanceRenderUnits: 7.5,
	},
	shipyard_large: {
		id: 'shipyard_large',
		label: 'Large Shipyard',
		description: 'Heavy orbital dock for frigates and capital ships.',
		category: 'station',
		buildTimeSeconds: 32,
		cost: { credits: 1800, metal: 1100 },
		icon: 'LY',
		stationType: 'shipyard_large',
		placementRule: 'free_system',
		clearanceRenderUnits: 11,
	},
	refinery: {
		id: 'refinery',
		label: 'Refinery',
		description: 'Must be placed close to a planet.',
		category: 'station',
		buildTimeSeconds: 24,
		cost: { credits: 1100, metal: 680 },
		icon: 'RF',
		stationType: 'refinery',
		placementRule: 'near_planet',
		clearanceRenderUnits: 8,
	},
	research: {
		id: 'research',
		label: 'Research Station',
		description: 'Technology and sensor research.',
		category: 'station',
		buildTimeSeconds: 26,
		cost: { credits: 1350, metal: 620 },
		icon: 'RS',
		stationType: 'research',
		placementRule: 'free_system',
		clearanceRenderUnits: 8,
	},
	headquarters: {
		id: 'headquarters',
		label: 'Headquarters',
		description: 'Command and system administration hub.',
		category: 'station',
		buildTimeSeconds: 42,
		cost: { credits: 2600, metal: 1450 },
		icon: 'HQ',
		stationType: 'headquarters',
		placementRule: 'free_system',
		clearanceRenderUnits: 12,
	},
	scout: {
		id: 'scout',
		label: 'Scout',
		description: 'Fast reconnaissance craft.',
		category: 'ship',
		buildTimeSeconds: 6,
		cost: { credits: 180, metal: 60 },
		icon: 'SC',
		shipRole: 'scout',
	},
	fighter: {
		id: 'fighter',
		label: 'Fighter',
		description: 'Fast combat craft.',
		category: 'ship',
		buildTimeSeconds: 8,
		cost: { credits: 240, metal: 90 },
		icon: 'FI',
		shipRole: 'fighter',
	},
	frigate: {
		id: 'frigate',
		label: 'Frigate',
		description: 'Medium combat ship.',
		category: 'ship',
		buildTimeSeconds: 18,
		cost: { credits: 720, metal: 420 },
		icon: 'FR',
		shipRole: 'frigate',
	},
	constructor: {
		id: 'constructor',
		label: 'Constructor',
		description: 'Utility vessel for later support tasks.',
		category: 'ship',
		buildTimeSeconds: 12,
		cost: { credits: 460, metal: 210 },
		icon: 'CO',
		shipRole: 'constructor',
	},
	carrier: {
		id: 'carrier',
		label: 'Capital Ship',
		description: 'Heavy command / builder ship.',
		category: 'ship',
		buildTimeSeconds: 38,
		cost: { credits: 2200, metal: 1250 },
		icon: 'CA',
		shipRole: 'carrier',
	},
};

export const CAPITAL_BUILD_OPTIONS: StationBuildableId[] = [
	'shipyard_small',
	'shipyard_large',
	'refinery',
	'research',
	'headquarters',
];

export function getStationProductionOptions(
	stationType: OrbitalStationType,
): ShipBuildableId[] {
	switch (stationType) {
		case 'shipyard':
		case 'shipyard_small':
			return [
				'scout',
				'fighter',
				'constructor',
			];

		case 'shipyard_large':
			return [
				'fighter',
				'frigate',
				'constructor',
				'carrier',
			];

		case 'refinery':
		case 'research':
		case 'headquarters':
			return [];
	}
}
