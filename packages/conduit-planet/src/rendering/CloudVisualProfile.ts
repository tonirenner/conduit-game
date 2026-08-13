import { clamp01, lerp } from '../internal/ProceduralMath';

export type CloudClimateProfile = {
	cloudPersistence?: number;
	stormActivity?: number;
	windStrength?: number;
	ashLoad?: number;
};

export type CloudLayerProfile = {
	coverage: number;
	density: number;
	alpha: number;
	climateInfluence: number;
	weatherInfluence: number;
	stormInfluence: number;
	driftScale: number;
};

export function createCloudLayerProfile(
	cloudCoverage: number,
	atmosphereDensity: number,
	climate?: CloudClimateProfile,
): CloudLayerProfile {
	const normalizedCoverage = clamp01(cloudCoverage);
	const cloudPersistence = clamp01(
		climate?.cloudPersistence ?? normalizedCoverage,
	);
	const stormActivity = clamp01(climate?.stormActivity ?? 0);
	const windStrength = clamp01(climate?.windStrength ?? 0);
	const ashLoad = clamp01(climate?.ashLoad ?? 0);
	const effectiveCoverage = clamp01(
		normalizedCoverage * 0.62 +
		cloudPersistence * 0.28 +
		stormActivity * 0.10 -
		ashLoad * 0.08,
	);
	const normalizedDensity = clamp01(atmosphereDensity / 2.5);

	return {
		coverage: lerp(0.66, 0.43, effectiveCoverage),
		density: lerp(
			1.20,
			2.85,
			Math.max(
				effectiveCoverage,
				normalizedDensity,
				stormActivity * 0.82,
			),
		),
		alpha: lerp(
			0.28,
			0.92,
			clamp01(
				effectiveCoverage * 0.84 +
				cloudPersistence * 0.16 -
				ashLoad * 0.10,
			),
		),
		climateInfluence: lerp(0.18, 0.36, cloudPersistence),
		weatherInfluence: lerp(
			0.12,
			0.34,
			Math.max(stormActivity, windStrength * 0.72),
		),
		stormInfluence: lerp(0.06, 0.24, stormActivity),
		driftScale: lerp(
			0.55,
			1.85,
			Math.max(windStrength, stormActivity * 0.82),
		),
	};
}
