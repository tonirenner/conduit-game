import type { GameWorld } from '../model/GameWorld';

export type PlayerResources = {
	credits: number;
	metal: number;
	rareMaterials: number;
	fuel: number;
	researchPoints: number;
};

export type ResearchState = {
	completed: string[];
	active: string | null;
	progress: Record<string, number>;
};

export type StoryProgress = {
	missions: Record<string, MissionState>;
	npcs: Record<string, NpcState>;
};

export type MissionState = {
	id: string;
	status: 'locked' | 'active' | 'completed' | 'failed';
	objectives: Record<string, number>;
};

export type NpcState = {
	id: string;
	relationship: number;
	flags: Record<string, boolean>;
};

export type PlayerProfile = {
	id: string;
	displayName: string;
	createdAt: string;
	research: ResearchState;
	resources: PlayerResources;
	ownedSystems: string[];
	fleets: string[];
	unlockedShips: string[];
	storyProgress: StoryProgress;
};

export type PersistentGameState = {
	saveVersion: 1;
	playerProfile: PlayerProfile;
	world: GameWorld;
	activeSystemId: string;
	lastSavedAt: string;
};

export const LOCAL_PLAYER_ID = 'local-player';

export function createDefaultPlayerProfile(createdAt = new Date().toISOString()): PlayerProfile {
	return {
		id: LOCAL_PLAYER_ID,
		displayName: 'Commander',
		createdAt,
		research: {
			completed: [],
			active: null,
			progress: {},
		},
		resources: {
			credits: 3200,
			metal: 1800,
			rareMaterials: 120,
			fuel: 900,
			researchPoints: 80,
		},
		ownedSystems: [],
		fleets: [],
		unlockedShips: [
			'scout',
			'fighter',
			'frigate',
			'constructor',
			'carrier',
		],
		storyProgress: {
			missions: {},
			npcs: {},
		},
	};
}
