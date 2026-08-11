import {
	applyMaterialAdjustmentProfile,
	type MaterialAdjustmentProfile,
} from '@conduit/web3d';

export type ShipMaterialLightingProfile = MaterialAdjustmentProfile;

export type GameEnvironmentProbeProfile = {
	environmentIntensity: number;
	hdrPeakIntensityScale: number;
	hdrPeakSizeScale: number;
	hdrPeakOpacityScale: number;
};

export const FRIGATE_MATERIAL_LIGHTING_PROFILE: ShipMaterialLightingProfile = {
	roughnessMultiplier: 1.14,
	metalnessMultiplier: 1.0,
	envMapIntensity: 0.95,
	normalScale: 1.0,
	aoMapIntensity: 1.0,
	emissiveIntensityMultiplier: 1.0,
};

export const GAME_ENVIRONMENT_PROBE_PROFILE: GameEnvironmentProbeProfile = {
	environmentIntensity: 1.15,
	hdrPeakIntensityScale: 0.32,
	hdrPeakSizeScale: 1.7,
	hdrPeakOpacityScale: 0.72,
};

export const applyShipMaterialLightingProfile = applyMaterialAdjustmentProfile;
