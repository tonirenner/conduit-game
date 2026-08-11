import * as THREE from 'three';

export type StudioLightingRigState = {
	keyIntensity: number;
	keyColor: THREE.ColorRepresentation;
	keyAzimuthDegrees: number;
	keyElevationDegrees: number;
	fillIntensity: number;
	fillColor: THREE.ColorRepresentation;
};

export class StudioLightingRig {
	readonly group = new THREE.Group();
	readonly keyLight: THREE.DirectionalLight;
	readonly fillLight: THREE.DirectionalLight;

	constructor(state: StudioLightingRigState) {
		this.group.name = 'StudioLightingRig';

		this.keyLight = new THREE.DirectionalLight(
			state.keyColor,
			state.keyIntensity,
		);
		this.keyLight.name = 'Studio Key Light';

		this.fillLight = new THREE.DirectionalLight(
			state.fillColor,
			state.fillIntensity,
		);
		this.fillLight.name = 'Studio Fill Light';

		this.group.add(this.keyLight, this.fillLight);
		this.apply(state);
	}

	apply(state: StudioLightingRigState): void {
		this.keyLight.intensity = state.keyIntensity;
		this.keyLight.color.set(state.keyColor);
		this.keyLight.position.copy(
			directionFromAngles(
				state.keyAzimuthDegrees,
				state.keyElevationDegrees,
			).multiplyScalar(6),
		);

		this.fillLight.intensity = state.fillIntensity;
		this.fillLight.color.set(state.fillColor);
		this.fillLight.position.copy(
			directionFromAngles(
				state.keyAzimuthDegrees + 145,
				Math.max(8, state.keyElevationDegrees * 0.45),
			).multiplyScalar(5),
		);
	}

	dispose(): void {
		this.group.remove(this.keyLight, this.fillLight);
	}
}

export function directionFromAngles(
	azimuthDegrees: number,
	elevationDegrees: number,
): THREE.Vector3 {
	const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
	const elevation = THREE.MathUtils.degToRad(elevationDegrees);
	const horizontal = Math.cos(elevation);

	return new THREE.Vector3(
		Math.sin(azimuth) * horizontal,
		Math.sin(elevation),
		Math.cos(azimuth) * horizontal,
	).normalize();
}
