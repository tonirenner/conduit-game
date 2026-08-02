import * as THREE from 'three';

export type DynamicEnvironmentProbeOptions = {
	scene: THREE.Scene;
	renderer: unknown;
	sourceGroup: THREE.Object3D;
	excludedObjects?: THREE.Object3D[];
	captureOnlyObjects?: THREE.Object3D[];
	resolution?: number;
	near?: number;
	far?: number;
	updateIntervalSeconds?: number;
	environmentIntensity?: number;
	debug?: boolean;
};

export class DynamicEnvironmentProbe {
	private readonly cubeTarget: THREE.WebGLCubeRenderTarget;
	private readonly cubeCamera: THREE.CubeCamera;
	private readonly excludedObjects: THREE.Object3D[];
	private readonly captureOnlyObjects: THREE.Object3D[];
	private readonly updateIntervalSeconds: number;
	private readonly environmentIntensity: number;
	private readonly previousSourcePosition = new THREE.Vector3();
	private readonly previousSourceVisible = new Map<THREE.Object3D, boolean>();
	private readonly previousCaptureOnlyVisible = new Map<THREE.Object3D, boolean>();
	private elapsedSeconds = Number.POSITIVE_INFINITY;
	private disposed = false;
	private disabled = false;

	constructor(
		private readonly options: DynamicEnvironmentProbeOptions,
	) {
		this.excludedObjects = options.excludedObjects ?? [];
		this.captureOnlyObjects = options.captureOnlyObjects ?? [];
		this.updateIntervalSeconds = options.updateIntervalSeconds ?? 3.5;
		this.environmentIntensity = options.environmentIntensity ?? 0.85;

		this.cubeTarget = new THREE.WebGLCubeRenderTarget(
			options.resolution ?? 128,
			{
				type: THREE.HalfFloatType,
				generateMipmaps: true,
				minFilter: THREE.LinearMipmapLinearFilter,
			},
		);

		this.cubeTarget.texture.name = 'DynamicEnvironmentProbeTexture';
		this.cubeTarget.texture.mapping = THREE.CubeReflectionMapping;

		this.cubeCamera = new THREE.CubeCamera(
			options.near ?? 0.1,
			options.far ?? 5000,
			this.cubeTarget,
		);

		this.cubeCamera.name = 'DynamicEnvironmentProbeCamera';
		this.cubeCamera.visible = false;

		this.options.scene.add(this.cubeCamera);
		this.applyEnvironmentTexture();
	}

	update(
		deltaSeconds: number,
		position: THREE.Vector3,
		force = false,
	): void {
		if (this.disposed || this.disabled) {
			return;
		}

		this.elapsedSeconds += Math.max(0, deltaSeconds);

		if (!force && this.elapsedSeconds < this.updateIntervalSeconds) {
			return;
		}

		this.elapsedSeconds = 0;
		this.capture(position);
	}

	capture(position: THREE.Vector3): void {
		if (this.disposed || this.disabled) {
			return;
		}

		this.previousSourcePosition.copy(this.options.sourceGroup.position);
		this.cubeCamera.position.copy(position);

		this.previousSourceVisible.clear();
		this.previousCaptureOnlyVisible.clear();

		for (const object of this.captureOnlyObjects) {
			this.previousCaptureOnlyVisible.set(
				object,
				object.visible,
			);
			object.visible = true;
		}

		for (const object of this.excludedObjects) {
			this.previousSourceVisible.set(
				object,
				object.visible,
			);
			object.visible = false;
		}

		/*
		 * Your skydome/backdrop follows the main camera.
		 * For the environment capture we temporarily center it around the cube camera.
		 */
		this.options.sourceGroup.position.copy(position);
		this.options.sourceGroup.updateMatrixWorld(true);

		try {
			this.cubeCamera.update(
				this.options.renderer as THREE.WebGLRenderer,
				this.options.scene,
			);
			this.applyEnvironmentTexture();
		} catch (error) {
			this.disabled = true;

			if (this.options.debug) {
				console.warn(
					'[DynamicEnvironmentProbe] disabled after cube capture failed.',
					error,
				);
			}
		} finally {
			this.options.sourceGroup.position.copy(this.previousSourcePosition);
			this.options.sourceGroup.updateMatrixWorld(true);

			for (const [
				           object,
				           visible,
			           ] of this.previousSourceVisible) {
				object.visible = visible;
			}

			for (const [
				           object,
				           visible,
			           ] of this.previousCaptureOnlyVisible) {
				object.visible = visible;
			}
		}
	}

	forceUpdate(position: THREE.Vector3): void {
		this.elapsedSeconds = Number.POSITIVE_INFINITY;
		this.update(
			0,
			position,
			true,
		);
	}

	getTexture(): THREE.CubeTexture {
		return this.cubeTarget.texture;
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.options.scene.remove(this.cubeCamera);

		if (this.options.scene.environment === this.cubeTarget.texture) {
			this.options.scene.environment = null;
		}

		this.cubeTarget.dispose();
	}

	private applyEnvironmentTexture(): void {
		this.options.scene.environment = this.cubeTarget.texture;

		/*
		 * scene.environmentIntensity exists in newer Three builds.
		 * Keep this as dynamic property so older versions still compile.
		 */
		(this.options.scene as THREE.Scene & {
			environmentIntensity?: number;
		}).environmentIntensity = this.environmentIntensity;
	}
}
