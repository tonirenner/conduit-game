import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlanetApproachCameraController } from './PlanetApproachCameraController';

const LOOK_SENSITIVITY = THREE.MathUtils.degToRad(0.14);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const WHEEL_RESPONSE = 0.0018;
const MIN_ALTITUDE_METERS = 250;
const MAX_ALTITUDE_METERS = 60_000_000;
const EXIT_BLEND_SECONDS = 0.45;

/**
 * Owns the camera only while the planet view is outside pure orbit.
 *
 * OrbitControls is completely disabled during free-look ownership. Left-drag
 * changes only orientation. The wheel changes radial altitude, so looking away
 * from the planet can never make zoom accidentally fly sideways through the
 * terrain. When pure orbit returns, orientation is blended back toward the
 * planet centre before OrbitControls is re-enabled.
 *
 * Feature Lab calls OrbitControls.update() globally before scene.update(). That
 * call can still rewrite a camera quaternion even when controls.enabled=false,
 * so the manual quaternion is persisted independently and restored every frame
 * after the global controls update.
 */
export class PlanetFreeLookCameraController {
	private readonly defaultControlsEnabled: boolean;
	private readonly defaultEnableDamping: boolean;
	private readonly renderUnitsPerMeter: number;
	private readonly radialUp = new THREE.Vector3();
	private readonly right = new THREE.Vector3();
	private readonly radialDirection = new THREE.Vector3();
	private readonly manualQuaternion = new THREE.Quaternion();
	private readonly yawQuaternion = new THREE.Quaternion();
	private readonly pitchQuaternion = new THREE.Quaternion();
	private readonly exitStartQuaternion = new THREE.Quaternion();
	private readonly exitTargetQuaternion = new THREE.Quaternion();
	private readonly lookMatrix = new THREE.Matrix4();
	private readonly center = new THREE.Vector3();

	private active = false;
	private exiting = false;
	private exitElapsed = 0;
	private pointerId: number | null = null;
	private pointerX = 0;
	private pointerY = 0;
	private pitch = 0;

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (!this.active || this.exiting || event.button !== 0 || this.pointerId !== null) return;
		event.preventDefault();
		this.pointerId = event.pointerId;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;
		this.controls.domElement.setPointerCapture?.(event.pointerId);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.active || this.exiting || event.pointerId !== this.pointerId) return;
		event.preventDefault();

		const deltaX = event.clientX - this.pointerX;
		const deltaY = event.clientY - this.pointerY;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;

		this.applyLookDelta(deltaX, deltaY);
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		if (event.pointerId !== this.pointerId) return;
		this.releasePointer();
	};

	private readonly onWheel = (event: WheelEvent): void => {
		if (!this.active || this.exiting) return;
		event.preventDefault();
		this.applyRadialZoom(event.deltaY);
	};

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly controls: OrbitControls,
		private readonly approachController: PlanetApproachCameraController,
		private readonly renderRadius: number,
		private readonly radiusMeters: number,
	) {
		this.defaultControlsEnabled = controls.enabled;
		this.defaultEnableDamping = controls.enableDamping;
		this.renderUnitsPerMeter = renderRadius / Math.max(1, radiusMeters);

		const element = this.controls.domElement;
		element.addEventListener('pointerdown', this.onPointerDown, true);
		element.addEventListener('pointermove', this.onPointerMove, true);
		element.addEventListener('pointerup', this.onPointerUp, true);
		element.addEventListener('pointercancel', this.onPointerUp, true);
		element.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
	}

	setNonOrbitActive(nonOrbit: boolean): void {
		if (nonOrbit) {
			if (!this.active || this.exiting) this.beginOwnership();
			return;
		}

		if (this.active && !this.exiting) this.beginOrbitHandoff();
	}

	update(dt: number): void {
		if (!this.active) return;

		if (!this.exiting) {
			// Restore ownership after FeatureLab's global OrbitControls.update().
			this.camera.quaternion.copy(this.manualQuaternion).normalize();
			return;
		}

		this.exitElapsed += Math.max(0, dt);
		const t = THREE.MathUtils.clamp(this.exitElapsed / EXIT_BLEND_SECONDS, 0, 1);
		const smooth = t * t * (3 - 2 * t);

		this.resolveOrbitQuaternion(this.exitTargetQuaternion);
		this.camera.quaternion
			.copy(this.exitStartQuaternion)
			.slerp(this.exitTargetQuaternion, smooth)
			.normalize();

		if (t >= 1) this.finishOrbitHandoff();
	}

	isActive(): boolean {
		return this.active;
	}

	dispose(): void {
		const element = this.controls.domElement;
		element.removeEventListener('pointerdown', this.onPointerDown, true);
		element.removeEventListener('pointermove', this.onPointerMove, true);
		element.removeEventListener('pointerup', this.onPointerUp, true);
		element.removeEventListener('pointercancel', this.onPointerUp, true);
		element.removeEventListener('wheel', this.onWheel, true);
		this.releasePointer();
		this.exiting = false;
		this.active = false;
		this.pitch = 0;
		this.approachController.setManualViewActive(false);
		this.controls.enabled = this.defaultControlsEnabled;
		this.controls.enableDamping = this.defaultEnableDamping;
	}

	private beginOwnership(): void {
		this.releasePointer();
		this.exiting = false;
		this.exitElapsed = 0;
		this.pitch = 0;
		this.active = true;
		this.manualQuaternion.copy(this.camera.quaternion);
		this.approachController.setManualViewActive(true);
		this.controls.enabled = false;
		this.controls.enableDamping = false;
	}

	private beginOrbitHandoff(): void {
		this.releasePointer();
		this.exiting = true;
		this.exitElapsed = 0;
		this.exitStartQuaternion.copy(this.manualQuaternion);
	}

	private finishOrbitHandoff(): void {
		this.exiting = false;
		this.active = false;
		this.pitch = 0;

		this.controls.target.copy(this.center);
		this.approachController.setManualViewActive(false);
		this.controls.enableDamping = this.defaultEnableDamping;
		this.controls.enabled = this.defaultControlsEnabled;
		this.controls.update();
	}

	private applyLookDelta(deltaX: number, deltaY: number): void {
		this.radialUp.copy(this.camera.position);
		if (this.radialUp.lengthSq() < 1e-12) this.radialUp.set(0, 1, 0);
		else this.radialUp.normalize();

		const yaw = -deltaX * LOOK_SENSITIVITY;
		this.yawQuaternion.setFromAxisAngle(this.radialUp, yaw);
		this.manualQuaternion.premultiply(this.yawQuaternion).normalize();

		const requestedPitch = this.pitch - deltaY * LOOK_SENSITIVITY;
		const clampedPitch = THREE.MathUtils.clamp(requestedPitch, -MAX_PITCH, MAX_PITCH);
		const pitchDelta = clampedPitch - this.pitch;
		this.pitch = clampedPitch;

		if (Math.abs(pitchDelta) > 1e-10) {
			this.right
				.set(1, 0, 0)
				.applyQuaternion(this.manualQuaternion)
				.normalize();
			this.pitchQuaternion.setFromAxisAngle(this.right, pitchDelta);
			this.manualQuaternion.premultiply(this.pitchQuaternion).normalize();
		}

		this.camera.quaternion.copy(this.manualQuaternion);
	}

	private applyRadialZoom(deltaY: number): void {
		const distance = this.camera.position.length();
		if (distance < 1e-12) return;

		const altitudeMeters = Math.max(
			MIN_ALTITUDE_METERS,
			(distance - this.renderRadius) / this.renderUnitsPerMeter,
		);
		const factor = Math.exp(deltaY * WHEEL_RESPONSE);
		const nextAltitudeMeters = THREE.MathUtils.clamp(
			altitudeMeters * factor,
			MIN_ALTITUDE_METERS,
			MAX_ALTITUDE_METERS,
		);

		this.radialDirection.copy(this.camera.position).normalize();
		this.camera.position
			.copy(this.radialDirection)
			.multiplyScalar(
				this.renderRadius + nextAltitudeMeters * this.renderUnitsPerMeter,
			);
	}

	private resolveOrbitQuaternion(target: THREE.Quaternion): void {
		this.radialUp.copy(this.camera.up);
		if (this.radialUp.lengthSq() < 1e-12) this.radialUp.set(0, 1, 0);
		else this.radialUp.normalize();

		this.lookMatrix.lookAt(this.camera.position, this.center, this.radialUp);
		target.setFromRotationMatrix(this.lookMatrix).normalize();
	}

	private releasePointer(): void {
		if (this.pointerId === null) return;
		this.controls.domElement.releasePointerCapture?.(this.pointerId);
		this.pointerId = null;
	}
}
