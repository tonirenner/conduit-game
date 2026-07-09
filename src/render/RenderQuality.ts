import * as THREE from 'three';

export type RenderQualityState = 'moving' | 'idle';

export interface RenderQualityOptions {
	minPixelRatio?: number;
	movingPixelRatio?: number;
	idlePixelRatio?: number;
	idleDelaySeconds?: number;
	positionEpsilon?: number;
	rotationEpsilon?: number;
}

export class RenderQuality {
	private readonly minPixelRatio: number;
	private readonly movingPixelRatio: number;
	private readonly idlePixelRatio: number;
	private readonly idleDelaySeconds: number;
	private readonly positionEpsilon: number;
	private readonly rotationEpsilon: number;

	private readonly lastCameraPosition   = new THREE.Vector3();
	private readonly lastCameraQuaternion = new THREE.Quaternion();

	private idleTimer         = 0;
	private currentPixelRatio = -1;

	public state: RenderQualityState = 'idle';

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly camera: THREE.Camera,
		options: RenderQualityOptions = {},
	) {
		this.minPixelRatio    = options.minPixelRatio ?? 0.85;
		this.movingPixelRatio = options.movingPixelRatio ?? 1.0;
		this.idlePixelRatio   = options.idlePixelRatio ?? 1.35;
		this.idleDelaySeconds = options.idleDelaySeconds ?? 0.45;
		this.positionEpsilon  = options.positionEpsilon ?? 0.0008;
		this.rotationEpsilon  = options.rotationEpsilon ?? 0.00002;

		this.lastCameraPosition.copy(this.camera.position);
		this.lastCameraQuaternion.copy(this.camera.quaternion);

		this.applyPixelRatio(this.idlePixelRatio);
	}

	update(deltaSeconds: number): void {
		const cameraMoved = this.hasCameraMoved();

		if (cameraMoved) {
			this.idleTimer = 0;
			this.state     = 'moving';

			this.applyPixelRatio(this.movingPixelRatio);
			this.storeCameraState();

			return;
		}

		this.idleTimer += deltaSeconds;

		if (this.idleTimer >= this.idleDelaySeconds) {
			this.state = 'idle';
			this.applyPixelRatio(this.idlePixelRatio);
		}

		this.storeCameraState();
	}

	forceMoving(): void {
		this.idleTimer = 0;
		this.state     = 'moving';

		this.applyPixelRatio(this.movingPixelRatio);
		this.storeCameraState();
	}

	forceIdle(): void {
		this.idleTimer = this.idleDelaySeconds;
		this.state     = 'idle';

		this.applyPixelRatio(this.idlePixelRatio);
		this.storeCameraState();
	}

	getPixelRatio(): number {
		return this.currentPixelRatio;
	}

	private hasCameraMoved(): boolean {
		const positionDelta =
			      this.camera.position.distanceToSquared(this.lastCameraPosition);

		const quaternionDelta =
			      1.0 -
			      Math.abs(this.camera.quaternion.dot(this.lastCameraQuaternion));

		return (
			positionDelta > this.positionEpsilon ||
			quaternionDelta > this.rotationEpsilon
		);
	}

	private storeCameraState(): void {
		this.lastCameraPosition.copy(this.camera.position);
		this.lastCameraQuaternion.copy(this.camera.quaternion);
	}

	private applyPixelRatio(targetPixelRatio: number): void {
		const devicePixelRatio = window.devicePixelRatio || 1;

		const pixelRatio = THREE.MathUtils.clamp(
			Math.min(devicePixelRatio, targetPixelRatio),
			this.minPixelRatio,
			devicePixelRatio,
		);

		if (Math.abs(pixelRatio - this.currentPixelRatio) < 0.001) {
			return;
		}

		this.currentPixelRatio = pixelRatio;
		this.renderer.setPixelRatio(pixelRatio);
	}
}
