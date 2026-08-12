export type EnvironmentProbeProfile = {
	environmentIntensity: number;
	hdrPeakIntensityScale: number;
	hdrPeakSizeScale: number;
	hdrPeakOpacityScale: number;
};

export const SPACE_BACKDROP_ENVIRONMENT_PROBE_PROFILE: EnvironmentProbeProfile = {
	environmentIntensity: 1.15,
	hdrPeakIntensityScale: 0.32,
	hdrPeakSizeScale: 1.7,
	hdrPeakOpacityScale: 0.72,
};

