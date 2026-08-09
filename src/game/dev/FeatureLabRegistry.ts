import type { FeatureTestRegistration } from './FeatureTestScene';
import { ShipModelTestScene } from './scenes/ships/ShipModelTestScene';
import { EngineVfxTestScene } from './scenes/ships/EngineVfxTestScene';
import { TurretTrackingTestScene } from './scenes/combat/TurretTrackingTestScene';
import { ShipCombatTestScene } from './scenes/combat/ShipCombatTestScene';
import { PlanetLodTestScene } from './scenes/planets/PlanetLodTestScene';
import { PostFxTestScene } from './scenes/rendering/PostFxTestScene';

const registrations: FeatureTestRegistration[] = [];

export function registerFeatureTest(registration: FeatureTestRegistration): void {
	if (registrations.some((entry) => entry.id === registration.id)) {
		throw new Error(`Feature test scene already registered: ${registration.id}`);
	}

	registrations.push(registration);
}

export function getFeatureTestRegistrations(): FeatureTestRegistration[] {
	return [...registrations];
}

export function getFeatureTestRegistration(id: string): FeatureTestRegistration | null {
	return registrations.find((entry) => entry.id === id) ?? null;
}

registerFeatureTest({
	id: 'ship-model-viewer',
	name: 'Model Viewer',
	category: 'Ships',
	description: 'Inspect real GLB/OBJ assets, dummy ships, dummy stations, bounds and named nodes.',
	create: () => new ShipModelTestScene(),
});

registerFeatureTest({
	id: 'combat-turret-tracking',
	name: 'Turret Tracking',
	category: 'Combat',
	description: 'One ship tracks a moving target with the production combat VFX tracking path.',
	create: () => new TurretTrackingTestScene(),
});

registerFeatureTest({
	id: 'ship-engine-vfx',
	name: 'Engine VFX',
	category: 'Ships',
	description: 'Drive production EngineVfxSystem with controllable ship velocity.',
	create: () => new EngineVfxTestScene(),
});

registerFeatureTest({
	id: 'combat-ship-vs-ship',
	name: 'Ship vs Ship Combat',
	category: 'Combat',
	description: 'Small isolated GameWorld running FleetSimulation and CombatVfxSystem.',
	create: () => new ShipCombatTestScene(),
});

registerFeatureTest({
	id: 'planet-lod',
	name: 'Planet LOD',
	category: 'Planets',
	description: 'Inspect Planet renderer LOD and terrain stats in isolation.',
	create: () => new PlanetLodTestScene(),
});

registerFeatureTest({
	id: 'rendering-postfx',
	name: 'PostProcessing',
	category: 'Rendering',
	description: 'Standard lighting/material scene for GTAO, SSR, Bloom and exposure tuning.',
	create: () => new PostFxTestScene(),
});
