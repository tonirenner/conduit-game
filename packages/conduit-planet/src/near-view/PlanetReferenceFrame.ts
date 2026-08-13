import * as THREE from 'three';

export type PlanetReferenceFrameUpdate = {
	shifted: boolean;
	shiftMeters: THREE.Vector3;
	shiftCount: number;
};

export class PlanetReferenceFrame {
	readonly originPlanetMeters = new THREE.Vector3();
	private shiftCount = 0;

	constructor(
		initialOriginPlanetMeters: THREE.Vector3,
		readonly shiftThresholdMeters = 2_000,
	) {
		this.originPlanetMeters.copy(initialOriginPlanetMeters);
	}

	toRenderPosition(
		planetPositionMeters: THREE.Vector3,
		target = new THREE.Vector3(),
	): THREE.Vector3 {
		return target.subVectors(
			planetPositionMeters,
			this.originPlanetMeters,
		);
	}

	toPlanetPosition(
		renderPosition: THREE.Vector3,
		target = new THREE.Vector3(),
	): THREE.Vector3 {
		return target.addVectors(renderPosition, this.originPlanetMeters);
	}

	update(observerPlanetMeters: THREE.Vector3): PlanetReferenceFrameUpdate {
		const shiftMeters = observerPlanetMeters.clone()
			.sub(this.originPlanetMeters);

		if (shiftMeters.lengthSq() <= this.shiftThresholdMeters ** 2) {
			return {
				shifted: false,
				shiftMeters: new THREE.Vector3(),
				shiftCount: this.shiftCount,
			};
		}

		this.originPlanetMeters.copy(observerPlanetMeters);
		this.shiftCount++;

		return {
			shifted: true,
			shiftMeters,
			shiftCount: this.shiftCount,
		};
	}

	getShiftCount(): number {
		return this.shiftCount;
	}
}
