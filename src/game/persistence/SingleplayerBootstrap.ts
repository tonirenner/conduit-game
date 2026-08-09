import { generateSingleplayerHomeRegion } from '../generation/GameWorldGenerator';
import {
	createDefaultPlayerProfile,
	type PersistentGameState,
} from '../domain/PlayerProfile';
import {
	LocalGameWorldRepository,
	LocalPlayerRepository,
	type GameWorldRepository,
	type PlayerRepository,
} from './PlayerRepository';

export type SingleplayerBootstrapOptions = {
	seed: number;
	playerRepository?: PlayerRepository;
	worldRepository?: GameWorldRepository;
};

export function loadOrCreateSingleplayerState(
	options: SingleplayerBootstrapOptions,
): PersistentGameState {
	const playerRepository =
		options.playerRepository ?? new LocalPlayerRepository();
	const worldRepository =
		options.worldRepository ?? new LocalGameWorldRepository();
	const existing = worldRepository.load();

	if (existing) {
		return existing;
	}

	const world = generateSingleplayerHomeRegion(options.seed);
	const profile = {
		...createDefaultPlayerProfile(),
		ownedSystems: world.nodes
			.filter((node) => node.owner === 'player')
			.map((node) => node.id),
		fleets: world.fleets
			.filter((fleet) => fleet.factionId === 'player')
			.map((fleet) => fleet.id),
	};
	const state: PersistentGameState = {
		saveVersion: 1,
		playerProfile: profile,
		world,
		activeSystemId: world.nodes[0]?.id ?? '',
		lastSavedAt: new Date().toISOString(),
	};

	playerRepository.save(profile);
	worldRepository.save(state);

	return state;
}

export function saveSingleplayerState(state: PersistentGameState): void {
	const playerRepository = new LocalPlayerRepository();
	const worldRepository = new LocalGameWorldRepository();

	playerRepository.save(state.playerProfile);
	worldRepository.save(state);
}
