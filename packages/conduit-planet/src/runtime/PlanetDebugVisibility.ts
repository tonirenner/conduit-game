import type * as THREE from 'three';

export type PlanetDebugLayerVisibility = Partial<{
	surface: boolean;
	atmosphere: boolean;
	clouds: boolean;
	gasLayer: boolean;
	rings: boolean;
	moons: boolean;
	nearSurfaceTerrain: boolean;
	toxicHaze: boolean;
}>;

export type PlanetDebugVisibilityTargets = {
	surface: Array<THREE.Object3D | null | undefined>;
	atmosphere: Array<THREE.Object3D | null | undefined>;
	clouds: Array<THREE.Object3D | null | undefined>;
	gasLayer?: THREE.Object3D | null;
	nearSurfaceTerrain?: THREE.Object3D | null;
	toxicHaze?: THREE.Object3D | null;
	setRingVisibility?: (visible: boolean) => void;
	setMoonVisibility?: (visible: boolean) => void;
};

export function applyPlanetDebugLayerVisibility(
	visibility: PlanetDebugLayerVisibility,
	targets: PlanetDebugVisibilityTargets,
): void {
	if (visibility.surface !== undefined) {
		setObjectsVisible(targets.surface, visibility.surface);
	}

	if (visibility.atmosphere !== undefined) {
		setObjectsVisible(targets.atmosphere, visibility.atmosphere);
	}

	if (visibility.clouds !== undefined) {
		setObjectsVisible(targets.clouds, visibility.clouds);
	}

	if (visibility.gasLayer !== undefined && targets.gasLayer) {
		targets.gasLayer.visible = visibility.gasLayer;
	}

	if (visibility.rings !== undefined) {
		targets.setRingVisibility?.(visibility.rings);
	}

	if (visibility.moons !== undefined) {
		targets.setMoonVisibility?.(visibility.moons);
	}

	if (
		visibility.nearSurfaceTerrain !== undefined &&
		targets.nearSurfaceTerrain
	) {
		targets.nearSurfaceTerrain.visible = visibility.nearSurfaceTerrain;
	}

	if (visibility.toxicHaze !== undefined && targets.toxicHaze) {
		targets.toxicHaze.visible = visibility.toxicHaze;
	}
}

function setObjectsVisible(
	objects: Array<THREE.Object3D | null | undefined>,
	visible: boolean,
): void {
	for (const object of objects) {
		if (object) {
			object.visible = visible;
		}
	}
}
