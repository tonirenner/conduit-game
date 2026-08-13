import {
	createDefaultPlayerProfile,
	type PersistentGameState,
	type PlayerProfile,
} from '../domain/PlayerProfile';
import { generatePlanetResourceProfile } from '@conduit/planet/generation';
import type { PlanetDefinition } from '@conduit/planet/model';

export type PlayerRepository = {
	load: () => PlayerProfile;
	save: (profile: PlayerProfile) => void;
	reset: () => PlayerProfile;
};

export type GameWorldRepository = {
	load: () => PersistentGameState | null;
	save: (state: PersistentGameState) => void;
	reset: () => void;
};

const PLAYER_PROFILE_STORAGE_KEY = 'webgl-planet-model.player-profile.v1';
const GAME_STATE_STORAGE_KEY = 'webgl-planet-model.game-state.v1';

export class LocalPlayerRepository implements PlayerRepository {
	load(): PlayerProfile {
		if (typeof window === 'undefined') {
			return createDefaultPlayerProfile();
		}

		const raw = window.localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);

		if (!raw) {
			return createDefaultPlayerProfile();
		}

		try {
			return normalizePlayerProfile(JSON.parse(raw) as Partial<PlayerProfile>);
		} catch (error) {
			console.warn('Could not parse player profile. Using defaults.', error);
			return createDefaultPlayerProfile();
		}
	}

	save(profile: PlayerProfile): void {
		if (typeof window === 'undefined') {
			return;
		}

		window.localStorage.setItem(
			PLAYER_PROFILE_STORAGE_KEY,
			JSON.stringify(normalizePlayerProfile(profile)),
		);
	}

	reset(): PlayerProfile {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
		}

		return createDefaultPlayerProfile();
	}
}

export class LocalGameWorldRepository implements GameWorldRepository {
	load(): PersistentGameState | null {
		if (typeof window === 'undefined') {
			return null;
		}

		const raw = window.localStorage.getItem(GAME_STATE_STORAGE_KEY);

		if (!raw) {
			return null;
		}

		try {
			const parsed = JSON.parse(raw) as PersistentGameState;

			if (parsed.saveVersion !== 1 || !parsed.world || !parsed.playerProfile) {
				return null;
			}

			return {
				...parsed,
				playerProfile: normalizePlayerProfile(parsed.playerProfile),
				world: normalizeWorldPlanetResources(parsed.world),
			};
		} catch (error) {
			console.warn('Could not parse persistent game state.', error);
			return null;
		}
	}

	save(state: PersistentGameState): void {
		if (typeof window === 'undefined') {
			return;
		}

		window.localStorage.setItem(
			GAME_STATE_STORAGE_KEY,
			JSON.stringify({
				...state,
				playerProfile: normalizePlayerProfile(state.playerProfile),
				lastSavedAt: new Date().toISOString(),
			}),
		);
	}

	reset(): void {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(GAME_STATE_STORAGE_KEY);
		}
	}
}

function normalizeWorldPlanetResources(
	world: PersistentGameState['world'],
): PersistentGameState['world'] {
	return {
		...world,
		nodes: world.nodes.map((node) => ({
			...node,
			system: {
				...node.system,
				planets: node.system.planets.map(normalizePlanetResources),
			},
		})),
	};
}

function normalizePlanetResources(
	planet: PlanetDefinition,
): PlanetDefinition {
	if ((planet as Partial<PlanetDefinition>).resources) {
		return planet;
	}

	return {
		...planet,
		resources: generatePlanetResourceProfile({
			planetClass: planet.class,
			composition: planet.composition,
			atmosphere: planet.atmosphere,
			surface: planet.surface,
			climate: planet.climate,
		}),
	};
}

function normalizePlayerProfile(input: Partial<PlayerProfile>): PlayerProfile {
	const defaults = createDefaultPlayerProfile(input.createdAt);

	return {
		id: typeof input.id === 'string' ? input.id : defaults.id,
		displayName:
			typeof input.displayName === 'string'
				? input.displayName
				: defaults.displayName,
		createdAt:
			typeof input.createdAt === 'string'
				? input.createdAt
				: defaults.createdAt,
		research: {
			completed: Array.isArray(input.research?.completed)
				? input.research.completed.filter((id): id is string => typeof id === 'string')
				: defaults.research.completed,
			active:
				typeof input.research?.active === 'string'
					? input.research.active
					: null,
			progress:
				input.research?.progress &&
				typeof input.research.progress === 'object'
					? input.research.progress
					: defaults.research.progress,
		},
		resources: {
			credits: numberOrDefault(input.resources?.credits, defaults.resources.credits),
			metal: numberOrDefault(input.resources?.metal, defaults.resources.metal),
			rareMaterials: numberOrDefault(
				input.resources?.rareMaterials,
				defaults.resources.rareMaterials,
			),
			fuel: numberOrDefault(input.resources?.fuel, defaults.resources.fuel),
			researchPoints: numberOrDefault(
				input.resources?.researchPoints,
				defaults.resources.researchPoints,
			),
		},
		ownedSystems: Array.isArray(input.ownedSystems)
			? input.ownedSystems.filter((id): id is string => typeof id === 'string')
			: defaults.ownedSystems,
		fleets: Array.isArray(input.fleets)
			? input.fleets.filter((id): id is string => typeof id === 'string')
			: defaults.fleets,
		unlockedShips: Array.isArray(input.unlockedShips)
			? input.unlockedShips.filter((id): id is string => typeof id === 'string')
			: defaults.unlockedShips,
		storyProgress: {
			missions:
				input.storyProgress?.missions &&
				typeof input.storyProgress.missions === 'object'
					? input.storyProgress.missions
					: defaults.storyProgress.missions,
			npcs:
				input.storyProgress?.npcs &&
				typeof input.storyProgress.npcs === 'object'
					? input.storyProgress.npcs
					: defaults.storyProgress.npcs,
		},
	};
}

function numberOrDefault(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}
