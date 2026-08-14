import * as THREE from 'three';

export type PerspectiveApproachProfileOptions = {
	referenceRadius: number;
	farFov?: number;
	approachFov?: number;
	surfaceFov?: number;
	approachStartHeight?: number;
	surfaceStartHeight?: number;
	surfaceEndHeight?: number;
	response?: number;
};

/**
 * Keeps large-scale approach shots visually compressed without switching
 * cameras. Heights are normalized by referenceRadius so the profile works
 * independently from world scale.
 */
export class PerspectiveApproachProfile {
	private readonly originalFov: number;
	private readonly farFov: number;
	private readonly approachFov: number;
	private readonly surfaceFov: number;
	private readonly approachStartHeight: number;
	private readonly surfaceStartHeight: number;
	private readonly surfaceEndHeight: number;
	private readonly response: number;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly options: PerspectiveApproachProfileOptions,
	) {
		this.originalFov = camera.fov;
		this.farFov = options.farFov ?? 46;
		this.approachFov = options.approachFov ?? 34;
		this.surfaceFov = options.surfaceFov ?? 48;
		this.approachStartHeight = options.approachStartHeight ?? 2.1;
		this.surfaceStartHeight = options.surfaceStartHeight ?? 0.35;
		this.surfaceEndHeight = options.surfaceEndHeight ?? 0.06;
		this.response = options.response ?? 7;
	}

	update(deltaSeconds: number): void {
		const radius = Math.max(1e-6, this.options.referenceRadius);
		const normalizedHeight = Math.max(0, this.camera.position.length() / radius - 1);
		const targetFov = this.resolveTargetFov(normalizedHeight);
		const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) * this.response);
		const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, alpha);

		if (Math.abs(nextFov - this.camera.fov) < 0.001) return;
		this.camera.fov = nextFov;
		this.camera.updateProjectionMatrix();
	}

	restore(): void {
		if (Math.abs(this.camera.fov - this.originalFov) < 0.001) return;
		this.camera.fov = this.originalFov;
		this.camera.updateProjectionMatrix();
	}

	private resolveTargetFov(normalizedHeight: number): number {
		if (normalizedHeight >= this.approachStartHeight) return this.farFov;

		if (normalizedHeight >= this.surfaceStartHeight) {
			const t = THREE.MathUtils.smoothstep(
				normalizedHeight,
				this.surfaceStartHeight,
				this.approachStartHeight,
			);
			return THREE.MathUtils.lerp(this.approachFov, this.farFov, t);
		}

		if (normalizedHeight > this.surfaceEndHeight) {
			const t = THREE.MathUtils.smoothstep(
				normalizedHeight,
				this.surfaceEndHeight,
				this.surfaceStartHeight,
			);
			return THREE.MathUtils.lerp(this.surfaceFov, this.approachFov, t);
		}

		return this.surfaceFov;
	}
}
