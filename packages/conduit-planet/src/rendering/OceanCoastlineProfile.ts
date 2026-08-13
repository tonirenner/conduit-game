export type OceanCoastlineProfile = {
	waterHintStart: number;
	waterHintEnd: number;
	shelfStart: number;
	shelfEnd: number;
	shelfFadeStart: number;
	shelfFadeEnd: number;
	islandStart: number;
	islandEnd: number;
	islandHeightInfluence: number;
	shelfTintStrength: number;
	waveStrength: number;
};

export const OCEAN_COASTLINE_PROFILE: OceanCoastlineProfile = {
	waterHintStart: 0.50,
	waterHintEnd: 0.61,
	shelfStart: 0.50,
	shelfEnd: 0.58,
	shelfFadeStart: 0.64,
	shelfFadeEnd: 0.74,
	islandStart: 0.86,
	islandEnd: 0.92,
	islandHeightInfluence: 0.09,
	shelfTintStrength: 0.30,
	waveStrength: 0.36,
};
