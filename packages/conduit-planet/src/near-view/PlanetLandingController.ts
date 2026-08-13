import * as THREE from 'three';
import type { PlanetTerrainSampler, PlanetSurfaceSample } from './PlanetTerrainSampler';

export type PlanetApproachState =
	| 'orbit'
	| 'atmosphere'
	| 'surfaceFlight'
	| 'landed';

export type PlanetLandingConfig = {
	contactClearanceMeters: number;
	footprintRadiusMeters: number;
	maxLandingVerticalSpeed: number;
	maxLandingHorizontalSpeed: number;
	maxLandingSlopeDegrees: number;
};

export type PlanetLandingResult = {
	state: PlanetApproachState;
	altitudeAboveTerrainMeters: number;
	verticalSpeed: number;
	horizontalSpeed: number;
	slopeDegrees: number;
	hardContact: boolean;
	canLand: boolean;
	surface: PlanetSurfaceSample;
	correctedPosition: THREE.Vector3 | null;
};

const DEFAULT_CONFIG: PlanetLandingConfig = {
	contactClearanceMeters: 2.4,
	footprintRadiusMeters: 3.8,
	maxLandingVerticalSpeed: 8,
	maxLandingHorizontalSpeed: 18,
	maxLandingSlopeDegrees: 18,
};

export class PlanetLandingController {
	private state: PlanetApproachState = 'orbit';

	constructor(
		private readonly sampler: PlanetTerrainSampler,
		private readonly config: PlanetLandingConfig = DEFAULT_CONFIG,
	) {}

	update(
		positionPlanetMeters: THREE.Vector3,
		velocityMetersPerSecond: THREE.Vector3,
		requestLanding: boolean,
	): PlanetLandingResult {
		const radialUp = positionPlanetMeters.clone().normalize();
		const contacts = this.sampleFootprint(radialUp);
		const surface = contacts.reduce((highest, candidate) =>
			candidate.surfaceRadiusMeters > highest.surfaceRadiusMeters
				? candidate
				: highest,
		);
		const contactSurfaceRadius = Math.max(
			...contacts.map((contact) => contact.surfaceRadiusMeters),
		);
		const altitudeAboveTerrainMeters =
			positionPlanetMeters.length() - contactSurfaceRadius;
		const verticalSpeed = velocityMetersPerSecond.dot(radialUp);
		const horizontalVelocity = velocityMetersPerSecond.clone()
			.addScaledVector(radialUp, -verticalSpeed);
		const horizontalSpeed = horizontalVelocity.length();
		const slopeDegrees = Math.max(...contacts.map((contact) =>
			THREE.MathUtils.radToDeg(
				Math.acos(THREE.MathUtils.clamp(
					contact.normal.dot(contact.direction),
					-1,
					1,
				)),
			),
		));
		const touching =
			altitudeAboveTerrainMeters <= this.config.contactClearanceMeters;
		const canLand =
			requestLanding &&
			touching &&
			contacts.every((contact) => !contact.isWater) &&
			Math.abs(verticalSpeed) <= this.config.maxLandingVerticalSpeed &&
			horizontalSpeed <= this.config.maxLandingHorizontalSpeed &&
			slopeDegrees <= this.config.maxLandingSlopeDegrees;
		const hardContact =
			touching &&
			verticalSpeed < -this.config.maxLandingVerticalSpeed;

		if (canLand) {
			this.state = 'landed';
		} else if (altitudeAboveTerrainMeters > 100_000) {
			this.state = 'orbit';
		} else if (altitudeAboveTerrainMeters > 12_000) {
			this.state = 'atmosphere';
		} else {
			this.state = 'surfaceFlight';
		}

		const correctedPosition = touching
			? radialUp.multiplyScalar(
					contactSurfaceRadius + this.config.contactClearanceMeters,
			)
			: null;

		return {
			state: this.state,
			altitudeAboveTerrainMeters,
			verticalSpeed,
			horizontalSpeed,
			slopeDegrees,
			hardContact,
			canLand,
			surface,
			correctedPosition,
		};
	}

	takeOff(): void {
		if (this.state === 'landed') {
			this.state = 'surfaceFlight';
		}
	}

	getState(): PlanetApproachState {
		return this.state;
	}

	private sampleFootprint(radialUp: THREE.Vector3): PlanetSurfaceSample[] {
		const reference = Math.abs(radialUp.y) < 0.92
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		const right = new THREE.Vector3().crossVectors(reference, radialUp).normalize();
		const forward = new THREE.Vector3().crossVectors(radialUp, right).normalize();
		const angularRadius =
			this.config.footprintRadiusMeters /
			this.sampler.radiusMeters;
		const directions = [
			radialUp,
			radialUp.clone().addScaledVector(right, angularRadius).normalize(),
			radialUp.clone().addScaledVector(right, -angularRadius).normalize(),
			radialUp.clone().addScaledVector(forward, angularRadius).normalize(),
			radialUp.clone().addScaledVector(forward, -angularRadius).normalize(),
		];

		return directions.map((direction) => this.sampler.sample(direction));
	}
}
