import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TARGET_CAPTURE_METERS = 14_000_000;
const TARGET_RELEASE_METERS = 18_000_000;
const TARGET_FULL_METERS = 2_000_000;
const UP_BLEND_START_METERS = 8_000_000;
const UP_BLEND_END_METERS = 600_000;
const SURFACE_FOV_START_METERS = 1_500_000;
const SURFACE_FOV_END_METERS = 180_000;

const ORBIT_FOV = 46;
const REGIONAL_FOV = 34;
const SURFACE_FOV = 48;
const TARGET_DAMPING = 5.5;
const UP_DAMPING = 4.5;
const FOV_DAMPING = 5.0;
const NEAR_PLANE_DAMPING = 6.0;
const NEAR_PLANE_MIN_METERS = 2;
const NEAR_PLANE_MAX_METERS = 50_000;
const NEAR_PLANE_ALTITUDE_FACTOR = 0.08;

export type PlanetApproachCameraState = {
	altitudeMeters: number;
	mode: 'orbit' | 'approach' | 'surface';
	targetBlend: number;
	upBlend: number;
	fov: number;
	anchorActive: boolean;
};

export class PlanetApproachCameraController {
	private readonly defaultTarget: THREE.Vector3;
	private readonly defaultCameraUp: THREE.Vector3;
	private readonly defaultFov: number;
	private readonly defaultNear: number;
	private readonly defaultZoomSpeed: number;
	private readonly defaultRotateSpeed: number;
	private readonly defaultMinDistance: number;
	private readonly renderUnitsPerMeter: number;

	private anchorDirection: THREE.Vector3 | null = null;
	private anchorTangent = new THREE.Vector3(0, 1, 0);
	private readonly desiredTarget = new THREE.Vector3();
	private readonly desiredUp = new THREE.Vector3();
	private readonly radialUp = new THREE.Vector3();
	private readonly tangentCandidate = new THREE.Vector3();
	private readonly approachDirection = new THREE.Vector3();
	private readonly center = new THREE.Vector3();
	private manualViewActive = false;
	private state: PlanetApproachCameraState;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly controls: OrbitControls,
		private readonly renderRadius: number,
		private readonly radiusMeters: number,
	) {
		this.defaultTarget = controls.target.clone();
		this.defaultCameraUp = camera.up.clone().normalize();
		this.defaultFov = camera.fov;
		this.defaultNear = camera.near;
		this.defaultZoomSpeed = controls.zoomSpeed;
		this.defaultRotateSpeed = controls.rotateSpeed;
		this.defaultMinDistance = controls.minDistance;
		this.renderUnitsPerMeter = renderRadius / Math.max(1, radiusMeters);

		const surfaceMinDistance = Math.max(1e-6, 100 * this.renderUnitsPerMeter);
		if (this.controls.minDistance <= 0 || this.controls.minDistance > surfaceMinDistance) {
			this.controls.minDistance = surfaceMinDistance;
		}

		const altitudeMeters = this.getAltitudeMeters();
		this.state = {
			altitudeMeters,
			mode: 'orbit',
			targetBlend: 0,
			upBlend: 0,
			fov: camera.fov,
			anchorActive: false,
		};
	}

	setManualViewActive(active: boolean): void {
		this.manualViewActive = active;
	}

	update(dt: number): void {
		const delta = Math.min(0.1, Math.max(0, dt));
		const altitudeMeters = this.getAltitudeMeters();

		if (!this.anchorDirection && altitudeMeters <= TARGET_CAPTURE_METERS) {
			this.captureSurfaceAnchor();
		} else if (this.anchorDirection && altitudeMeters >= TARGET_RELEASE_METERS) {
			this.anchorDirection = null;
		}

		const targetBlend = this.anchorDirection
			? descendingSmoothstep(altitudeMeters, TARGET_CAPTURE_METERS, TARGET_FULL_METERS)
			: 0;
		const upBlend = targetBlend * descendingSmoothstep(
			altitudeMeters,
			UP_BLEND_START_METERS,
			UP_BLEND_END_METERS,
		);

		if (!this.manualViewActive) {
			this.updateTarget(altitudeMeters, targetBlend, delta);
			this.updateUp(upBlend, delta);
		}
		this.updateFovAndControlSpeeds(altitudeMeters, delta);
		this.updateNearPlane(altitudeMeters, delta);

		if (!this.manualViewActive) this.controls.update(delta);

		this.state = {
			altitudeMeters,
			mode: targetBlend <= 0.001
				? 'orbit'
				: altitudeMeters <= SURFACE_FOV_END_METERS
					? 'surface'
					: 'approach',
			targetBlend,
			upBlend,
			fov: this.camera.fov,
			anchorActive: Boolean(this.anchorDirection),
		};
	}

	getState(): PlanetApproachCameraState {
		return { ...this.state };
	}

	dispose(): void {
		this.manualViewActive = false;
		this.controls.target.copy(this.defaultTarget);
		this.controls.zoomSpeed = this.defaultZoomSpeed;
		this.controls.rotateSpeed = this.defaultRotateSpeed;
		this.controls.minDistance = this.defaultMinDistance;
		this.camera.up.copy(this.defaultCameraUp);
		this.camera.fov = this.defaultFov;
		this.camera.near = this.defaultNear;
		this.camera.updateProjectionMatrix();
		this.controls.update();
		this.anchorDirection = null;
	}

	private updateTarget(altitudeMeters: number, targetBlend: number, dt: number): void {
		this.desiredTarget.copy(this.center);
		if (this.anchorDirection && targetBlend > 0) {
			const horizonAngle = Math.acos(clamp01(
				this.radiusMeters / Math.max(this.radiusMeters, this.radiusMeters + altitudeMeters),
			));
			const lookAheadAngle = THREE.MathUtils.clamp(
				horizonAngle * 0.82,
				THREE.MathUtils.degToRad(0.25),
				THREE.MathUtils.degToRad(18),
			);
			this.approachDirection
				.copy(this.anchorDirection)
				.multiplyScalar(Math.cos(lookAheadAngle))
				.addScaledVector(this.anchorTangent, Math.sin(lookAheadAngle))
				.normalize();
			this.desiredTarget.copy(this.approachDirection).multiplyScalar(this.renderRadius * targetBlend);
		}
		this.controls.target.lerp(this.desiredTarget, dampingFactor(TARGET_DAMPING, dt));
	}

	private updateUp(upBlend: number, dt: number): void {
		this.radialUp.copy(this.camera.position);
		if (this.radialUp.lengthSq() < 1e-12) this.radialUp.set(0, 1, 0);
		else this.radialUp.normalize();
		this.desiredUp.copy(this.defaultCameraUp).lerp(this.radialUp, upBlend).normalize();
		this.camera.up.lerp(this.desiredUp, dampingFactor(UP_DAMPING, dt)).normalize();
	}

	private updateFovAndControlSpeeds(altitudeMeters: number, dt: number): void {
		const regionalBlend = descendingSmoothstep(altitudeMeters, TARGET_CAPTURE_METERS, TARGET_FULL_METERS);
		const surfaceBlend = descendingSmoothstep(altitudeMeters, SURFACE_FOV_START_METERS, SURFACE_FOV_END_METERS);
		let desiredFov = THREE.MathUtils.lerp(ORBIT_FOV, REGIONAL_FOV, regionalBlend);
		desiredFov = THREE.MathUtils.lerp(desiredFov, SURFACE_FOV, surfaceBlend);
		const nextFov = THREE.MathUtils.lerp(this.camera.fov, desiredFov, dampingFactor(FOV_DAMPING, dt));
		if (Math.abs(nextFov - this.camera.fov) > 0.001) {
			this.camera.fov = nextFov;
			this.camera.updateProjectionMatrix();
		}
		this.controls.zoomSpeed = THREE.MathUtils.lerp(1.0, 0.28, surfaceBlend);
		this.controls.rotateSpeed = THREE.MathUtils.lerp(0.55, 0.16, surfaceBlend);
	}

	private updateNearPlane(altitudeMeters: number, dt: number): void {
		const nearBlend = descendingSmoothstep(altitudeMeters, SURFACE_FOV_START_METERS, SURFACE_FOV_END_METERS);
		const targetNearMeters = THREE.MathUtils.clamp(
			altitudeMeters * NEAR_PLANE_ALTITUDE_FACTOR,
			NEAR_PLANE_MIN_METERS,
			NEAR_PLANE_MAX_METERS,
		);
		const surfaceNear = targetNearMeters * this.renderUnitsPerMeter;
		const desiredNear = THREE.MathUtils.lerp(this.defaultNear, Math.min(this.defaultNear, surfaceNear), nearBlend);
		const nextNear = THREE.MathUtils.lerp(this.camera.near, desiredNear, dampingFactor(NEAR_PLANE_DAMPING, dt));
		if (Math.abs(nextNear - this.camera.near) > 1e-8) {
			this.camera.near = Math.max(1e-7, nextNear);
			this.camera.updateProjectionMatrix();
		}
	}

	private captureSurfaceAnchor(): void {
		this.anchorDirection = this.camera.position.clone();
		if (this.anchorDirection.lengthSq() < 1e-12) this.anchorDirection.set(0, 0, 1);
		else this.anchorDirection.normalize();
		this.tangentCandidate
			.copy(this.camera.up)
			.addScaledVector(this.anchorDirection, -this.camera.up.dot(this.anchorDirection));
		if (this.tangentCandidate.lengthSq() < 1e-8) {
			const fallback = Math.abs(this.anchorDirection.y) < 0.9
				? new THREE.Vector3(0, 1, 0)
				: new THREE.Vector3(1, 0, 0);
			this.tangentCandidate
				.copy(fallback)
				.addScaledVector(this.anchorDirection, -fallback.dot(this.anchorDirection));
		}
		this.anchorTangent.copy(this.tangentCandidate).normalize();
	}

	private getAltitudeMeters(): number {
		return Math.max(0, (this.camera.position.length() / this.renderRadius - 1) * this.radiusMeters);
	}
}

function descendingSmoothstep(value: number, start: number, end: number): number {
	const t = clamp01((start - value) / Math.max(1, start - end));
	return t * t * (3 - 2 * t);
}

function dampingFactor(speed: number, dt: number): number {
	return 1 - Math.exp(-speed * dt);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
