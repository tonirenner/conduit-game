import {
	applyMaterialAdjustmentProfile,
	MATTE_MILITARY_METAL_MATERIAL_PROFILE,
	SPACE_BACKDROP_ENVIRONMENT_PROBE_PROFILE,
	type EnvironmentProbeProfile,
	type MaterialAdjustmentProfile,
} from '@conduit/web3d';

export type ShipMaterialLightingProfile = MaterialAdjustmentProfile;
export type GameEnvironmentProbeProfile = EnvironmentProbeProfile;

export const FRIGATE_MATERIAL_LIGHTING_PROFILE: ShipMaterialLightingProfile = {
	...MATTE_MILITARY_METAL_MATERIAL_PROFILE,
};

export const GAME_ENVIRONMENT_PROBE_PROFILE: GameEnvironmentProbeProfile = {
	...SPACE_BACKDROP_ENVIRONMENT_PROBE_PROFILE,
};

export const applyShipMaterialLightingProfile = applyMaterialAdjustmentProfile;
