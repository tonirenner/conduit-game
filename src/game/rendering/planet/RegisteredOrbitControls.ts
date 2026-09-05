import {
	OrbitControls as ThreeOrbitControls,
} from 'three/examples/jsm/controls/OrbitControls.js';

let activeOrbitControls: ThreeOrbitControls | null = null;

/**
 * Drop-in OrbitControls subclass used by the game build.
 *
 * It keeps the active camera/control pair discoverable by the game-facing
 * planet runtime without coupling GamePrototypeScene to the planet camera
 * implementation. Behavior is otherwise the original Three.js OrbitControls.
 */
export class OrbitControls extends ThreeOrbitControls {
	constructor(
		...args: ConstructorParameters<typeof ThreeOrbitControls>
	) {
		super(...args);
		activeOrbitControls = this;
	}

	dispose(): void {
		if (activeOrbitControls === this) activeOrbitControls = null;
		super.dispose();
	}
}

export function getActiveOrbitControls(): ThreeOrbitControls | null {
	return activeOrbitControls;
}
