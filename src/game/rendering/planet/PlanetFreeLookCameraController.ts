import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlanetApproachCameraController } from './PlanetApproachCameraController';

const LOOK_SENSITIVITY = THREE.MathUtils.degToRad(0.14);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const WHEEL_RESPONSE = 0.0018;
const MIN_ALTITUDE_METERS = 250;
const MAX_ALTITUDE_METERS = 60_000_000;
const EXIT_BLEND_SECONDS = 0.45;
const BASE_TANGENTIAL_SPEED_METERS_PER_SECOND = 450;
const MAX_TANGENTIAL_SPEED_METERS_PER_SECOND = 120_000;
const BASE_VERTICAL_SPEED_METERS_PER_SECOND = 350;
const MAX_VERTICAL_SPEED_METERS_PER_SECOND = 140_000;
const FAST_MOVE_MULTIPLIER = 4;

const MOVEMENT_KEYS = new Set([
	'KeyW',
	'KeyA',
	'KeyS',
	'KeyD',
	'KeyQ',
	'KeyE',
	'ShiftLeft',
	'ShiftRight',
]);

export class PlanetFreeLookCameraController {
	private readonly defaultControlsEnabled: boolean;
	private readonly defaultEnableDamping: boolean;
	private readonly renderUnitsPerMeter: number;
	private readonly radialUp = new THREE.Vector3();
	private readonly right = new THREE.Vector3();
	private readonly radialDirection = new THREE.Vector3();
	private readonly nextRadialDirection = new THREE.Vector3();
	private readonly forward = new THREE.Vector3();
	private readonly tangentRight = new THREE.Vector3();
	private readonly movement = new THREE.Vector3();
	private readonly cameraOffset = new THREE.Vector3();
	private readonly manualQuaternion = new THREE.Quaternion();
	private readonly yawQuaternion = new THREE.Quaternion();
	private readonly pitchQuaternion = new THREE.Quaternion();
	private readonly transportQuaternion = new THREE.Quaternion();
	private readonly exitStartQuaternion = new THREE.Quaternion();
	private readonly exitTargetQuaternion = new THREE.Quaternion();
	private readonly lookMatrix = new THREE.Matrix4();
	private readonly pressedKeys = new Set<string>();

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
		event.stopPropagation();
		this.pointerId = event.pointerId;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;
		this.controls.domElement.setPointerCapture?.(event.pointerId);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.active || this.exiting || event.pointerId !== this.pointerId) return;
		event.preventDefault();
		event.stopPropagation();

		const deltaX = event.clientX - this.pointerX;
		const deltaY = event.clientY - this.pointerY;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;

		this.applyLookDelta(deltaX, deltaY);
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		if (event.pointerId !== this.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		this.releasePointer();
	};

	private readonly onWheel = (event: WheelEvent): void => {
		if (!this.active || this.exiting) return;
		event.preventDefault();
		event.stopPropagation();
		this.applyRadialZoom(event.deltaY);
	};

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (!this.active || this.exiting || !MOVEMENT_KEYS.has(event.code)) return;
		if (isEditableTarget(event.target)) return;
		event.preventDefault();
		this.pressedKeys.add(event.code);
	};

	private readonly onKeyUp = (event: KeyboardEvent): void => {
		if (!MOVEMENT_KEYS.has(event.code)) return;
		this.pressedKeys.delete(event.code);
	};

	private readonly onWindowBlur = (): void => {
		this.pressedKeys.clear();
	};

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly controls: OrbitControls,
		private readonly approachController: PlanetApproachCameraController,
		private readonly renderRadius: number,
		private readonly radiusMeters: number,
		private readonly center: THREE.Vector3 = new THREE.Vector3(),
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
		window.addEventListener('keydown', this.onKeyDown);
		window.addEventListener('keyup', this.onKeyUp);
		window.addEventListener('blur', this.onWindowBlur);
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
			this.applyKeyboardMovement(dt);
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
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('keyup', this.onKeyUp);
		window.removeEventListener('blur', this.onWindowBlur);
		this.pressedKeys.clear();
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
		this.pressedKeys.clear();
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
		this.pressedKeys.clear();
		this.exiting = true;
		this.exitElapsed = 0;
		this.exitStartQuaternion.copy(this.manualQuaternion);
	}

	private finishOrbitHandoff(): void {
		this.exiting = false;
		this.active = false;
		this.pitch = 0;
		this.pressedKeys.clear();

		this.controls.target.copy(this.center);
		this.approachController.setManualViewActive(false);
		this.controls.enableDamping = this.defaultEnableDamping;
		this.controls.enabled = this.defaultControlsEnabled;
		this.controls.update();
	}

	private applyKeyboardMovement(dt: number): void {
		const delta = THREE.MathUtils.clamp(dt, 0, 0.1);
		if (delta <= 0 || this.pressedKeys.size === 0) return;

		const forwardInput =
			(this.pressedKeys.has('KeyW') ? 1 : 0) -
			(this.pressedKeys.has('KeyS') ? 1 : 0);
		const rightInput =
			(this.pressedKeys.has('KeyD') ? 1 : 0) -
			(this.pressedKeys.has('KeyA') ? 1 : 0);
		const verticalInput =
			(this.pressedKeys.has('KeyE') ? 1 : 0) -
			(this.pressedKeys.has('KeyQ') ? 1 : 0);

		if (forwardInput === 0 && rightInput === 0 && verticalInput === 0) return;

		const distance = this.cameraOffset.copy(this.camera.position).sub(this.center).length();
		if (distance < 1e-12) return;

		let altitudeMeters = THREE.MathUtils.clamp(
			(distance - this.renderRadius) / this.renderUnitsPerMeter,
			MIN_ALTITUDE_METERS,
			MAX_ALTITUDE_METERS,
		);
		const speedMultiplier =
			this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')
				? FAST_MOVE_MULTIPLIER
				: 1;

		this.radialDirection.copy(this.cameraOffset).normalize();

		if (forwardInput !== 0 || rightInput !== 0) {
			this.forward
				.set(0, 0, -1)
				.applyQuaternion(this.manualQuaternion)
				.addScaledVector(
					this.radialDirection,
					-this.forward.dot(this.radialDirection),
				);
			if (this.forward.lengthSq() < 1e-10) {
				this.forward
					.set(0, 1, 0)
					.addScaledVector(
						this.radialDirection,
						-this.radialDirection.y,
					);
			}
			this.forward.normalize();

			this.tangentRight
				.set(1, 0, 0)
				.applyQuaternion(this.manualQuaternion)
				.addScaledVector(
					this.radialDirection,
					-this.tangentRight.dot(this.radialDirection),
				);
			if (this.tangentRight.lengthSq() < 1e-10) {
				this.tangentRight
					.crossVectors(this.forward, this.radialDirection)
					.normalize();
			} else {
				this.tangentRight.normalize();
			}

			this.movement
				.set(0, 0, 0)
				.addScaledVector(this.forward, forwardInput)
				.addScaledVector(this.tangentRight, rightInput);

			if (this.movement.lengthSq() > 1e-10) {
				this.movement.normalize();
				const tangentialSpeed = THREE.MathUtils.clamp(
					BASE_TANGENTIAL_SPEED_METERS_PER_SECOND + altitudeMeters * 0.02,
					BASE_TANGENTIAL_SPEED_METERS_PER_SECOND,
					MAX_TANGENTIAL_SPEED_METERS_PER_SECOND,
				) * speedMultiplier;
				const angularDistance =
					(tangentialSpeed * delta) /
					Math.max(1, this.radiusMeters + altitudeMeters);

				this.nextRadialDirection
					.copy(this.radialDirection)
					.addScaledVector(this.movement, angularDistance)
					.normalize();

				this.transportQuaternion.setFromUnitVectors(
					this.radialDirection,
					this.nextRadialDirection,
				);
				this.manualQuaternion
					.premultiply(this.transportQuaternion)
					.normalize();
				this.radialDirection.copy(this.nextRadialDirection);
			}
		}

		if (verticalInput !== 0) {
			const verticalSpeed = THREE.MathUtils.clamp(
				BASE_VERTICAL_SPEED_METERS_PER_SECOND + altitudeMeters * 0.025,
				BASE_VERTICAL_SPEED_METERS_PER_SECOND,
				MAX_VERTICAL_SPEED_METERS_PER_SECOND,
			) * speedMultiplier;
			altitudeMeters = THREE.MathUtils.clamp(
				altitudeMeters + verticalInput * verticalSpeed * delta,
				MIN_ALTITUDE_METERS,
				MAX_ALTITUDE_METERS,
			);
		}

		this.camera.position
			.copy(this.center)
			.addScaledVector(
				this.radialDirection,
				this.renderRadius + altitudeMeters * this.renderUnitsPerMeter,
			);
	}

	private applyLookDelta(deltaX: number, deltaY: number): void {
		this.radialUp.copy(this.camera.position).sub(this.center);
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
		const distance = this.cameraOffset.copy(this.camera.position).sub(this.center).length();
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

		this.radialDirection.copy(this.cameraOffset).normalize();
		this.camera.position
			.copy(this.center)
			.addScaledVector(
				this.radialDirection,
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

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		target.isContentEditable
	);
}
