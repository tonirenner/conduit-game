import {
	OrbitControls as ThreeOrbitControls,
} from 'three/examples/jsm/controls/OrbitControls.js';

let activeOrbitControls: ThreeOrbitControls | null = null;
const externalCameraOwners = new WeakSet<ThreeOrbitControls>();

/**
 * Drop-in OrbitControls subclass used by the game build.
 *
 * It keeps the active camera/control pair discoverable by the game-facing
 * planet runtime without coupling GamePrototypeScene to the planet camera
 * implementation.
 *
 * While the shared Lab/Game planet free-look owns the camera, update() becomes
 * a no-op. This is required because GamePrototypeScene still calls
 * controls.update() later in the same frame from syncSystemOrbitCameraTarget().
 * Without this guard OrbitControls overwrites the free-look camera transform
 * immediately after the planet controller has applied it.
 */
export class OrbitControls extends ThreeOrbitControls {
	constructor(
		...args: ConstructorParameters<typeof ThreeOrbitControls>
	) {
		super(...args);
		activeOrbitControls = this;
	}

	update(deltaTime?: number): boolean {
		if (externalCameraOwners.has(this)) return false;
		return super.update(deltaTime);
	}

	dispose(): void {
		externalCameraOwners.delete(this);
		if (activeOrbitControls === this) activeOrbitControls = null;
		super.dispose();
	}
}

export function getActiveOrbitControls(): ThreeOrbitControls | null {
	return activeOrbitControls;
}

export function setOrbitControlsExternalCameraOwnership(
	controls: ThreeOrbitControls,
	owned: boolean,
): void {
	if (owned) {
		externalCameraOwners.add(controls);
		return;
	}

	externalCameraOwners.delete(controls);
}
