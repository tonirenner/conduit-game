import * as THREE from 'three';

export type GasGiantLayerKind = 'gas_giant' | 'ice_giant';

export type GasGiantVisualProfile = {
	body: { roughness: number; emissive: THREE.Color; emissiveIntensity: number };
	cloudShells: { count: number; radiusStart: number; radiusStep: number; color: THREE.ColorRepresentation; opacityStart: number; opacityStep: number; opacityMin: number; emissive: THREE.Color; emissiveIntensity: number };
	cloudParticles: { count: number; innerRadius: number; outerRadius: number; bands: number; bandSpreadMin: number; bandSpreadRandom: number; size: number; opacity: number; farFadeStart: number; farFadeEnd: number; farOpacity: number; farSize: number };
	atmosphere: { radius: number; color: THREE.ColorRepresentation; opacity: number };
	bands: { frequency: number; stripeCount: number; stripeAlpha: number; cloudAlphaFrequency: number; cloudAlphaScaleX: number; cloudAlphaScaleY: number; cloudThreshold: number; cloudPower: number };
};

const GAS_GIANT_PROFILE: GasGiantVisualProfile = {
	body: { roughness: 0.88, emissive: new THREE.Color(0x24160c), emissiveIntensity: 0.14 },
	cloudShells: { count: 5, radiusStart: 1.014, radiusStep: 0.010, color: 0xffdfba, opacityStart: 0.16, opacityStep: 0.024, opacityMin: 0.045, emissive: new THREE.Color(0xffcf9d), emissiveIntensity: 0.10 },
	cloudParticles: { count: 22000, innerRadius: 1.022, outerRadius: 1.052, bands: 11, bandSpreadMin: 0.032, bandSpreadRandom: 0.055, size: 0.0074, opacity: 0.11, farFadeStart: 3.8, farFadeEnd: 9.5, farOpacity: 0.015, farSize: 0.22 },
	atmosphere: { radius: 1.065, color: 0xffd6a0, opacity: 0.15 },
	bands: { frequency: 23.0, stripeCount: 154, stripeAlpha: 0.17, cloudAlphaFrequency: 15.0, cloudAlphaScaleX: 16.0, cloudAlphaScaleY: 42.0, cloudThreshold: 0.56, cloudPower: 1.45 },
};

const ICE_GIANT_PROFILE: GasGiantVisualProfile = {
	body: { roughness: 0.82, emissive: new THREE.Color(0x0b2430), emissiveIntensity: 0.18 },
	cloudShells: { count: 4, radiusStart: 1.016, radiusStep: 0.011, color: 0xdaf6ff, opacityStart: 0.13, opacityStep: 0.020, opacityMin: 0.038, emissive: new THREE.Color(0x8bdfff), emissiveIntensity: 0.12 },
	cloudParticles: { count: 14000, innerRadius: 1.022, outerRadius: 1.043, bands: 7, bandSpreadMin: 0.045, bandSpreadRandom: 0.060, size: 0.0062, opacity: 0.09, farFadeStart: 3.6, farFadeEnd: 8.6, farOpacity: 0.012, farSize: 0.20 },
	atmosphere: { radius: 1.055, color: 0x9fe7ff, opacity: 0.14 },
	bands: { frequency: 16.0, stripeCount: 86, stripeAlpha: 0.13, cloudAlphaFrequency: 10.0, cloudAlphaScaleX: 10.0, cloudAlphaScaleY: 26.0, cloudThreshold: 0.50, cloudPower: 1.25 },
};

export function getGasGiantVisualProfile(
	kind: GasGiantLayerKind,
	gasInfluence = 1,
): GasGiantVisualProfile {
	const base = kind === 'ice_giant' ? ICE_GIANT_PROFILE : GAS_GIANT_PROFILE;
	const gas = THREE.MathUtils.clamp(gasInfluence, 0, 1);
	const density = THREE.MathUtils.lerp(0.72, 1.08, gas);

	return {
		body: { ...base.body, emissive: base.body.emissive.clone() },
		cloudShells: {
			...base.cloudShells,
			opacityStart: base.cloudShells.opacityStart * density,
			opacityMin: base.cloudShells.opacityMin * density,
			emissive: base.cloudShells.emissive.clone(),
		},
		cloudParticles: {
			...base.cloudParticles,
			opacity: base.cloudParticles.opacity * density,
		},
		atmosphere: {
			...base.atmosphere,
			opacity: base.atmosphere.opacity * THREE.MathUtils.lerp(0.84, 1.06, gas),
		},
		bands: {
			...base.bands,
			stripeAlpha: base.bands.stripeAlpha * THREE.MathUtils.lerp(0.82, 1.10, gas),
			cloudThreshold: THREE.MathUtils.clamp(
				base.bands.cloudThreshold + THREE.MathUtils.lerp(0.035, -0.025, gas),
				0,
				1,
			),
		},
	};
}
