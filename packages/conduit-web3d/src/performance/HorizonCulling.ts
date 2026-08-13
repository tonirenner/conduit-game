import * as THREE from 'three';

export interface HorizonCullingOptions {
	enabled: boolean;
	debug: boolean;

	/**
	 * Sicherheitspuffer gegen Pop-in.
	 * Höher = weniger aggressives Culling.
	 */
	safetyMargin: number;

	/**
	 * Unter dieser Höhe cullen wir erstmal nicht.
	 * In Bodennähe ist Horizon-Culling riskanter.
	 */
	minCameraHeightForCulling: number;
}

export interface HorizonCullingStats {
	tested: number;
	visible: number;
	culled: number;
	forcedVisibleNearSurface: number;
	disabled: number;
}

export interface HorizonCullingDebugSample {
	center: THREE.Vector3;
	radius: number;
	visible: boolean;
	reason: HorizonCullingResultReason;
	distanceToCamera: number;
	horizonLimit: number;
	cameraHeight: number;
}

export type HorizonCullingResultReason =
	| 'disabled'
	| 'near-surface'
	| 'visible-front'
	| 'visible-margin'
	| 'culled-behind-horizon';

export interface HorizonCullingResult {
	visible: boolean;
	reason: HorizonCullingResultReason;
	distanceToCamera: number;
	horizonLimit: number;
	cameraHeight: number;
}

const DEFAULT_OPTIONS: HorizonCullingOptions = {
	enabled: true,
	debug: false,
	safetyMargin: 0.18,
	minCameraHeightForCulling: 0.22,
};

/**
 * Visibility test for bounding spheres positioned around an origin-centered sphere.
 */
export class HorizonCulling {
	private readonly options: HorizonCullingOptions;

	private readonly stats: HorizonCullingStats = {
		tested: 0,
		visible: 0,
		culled: 0,
		forcedVisibleNearSurface: 0,
		disabled: 0,
	};

	private readonly debugSamples: HorizonCullingDebugSample[] = [];

	constructor(
		private readonly planetRadius: number,
		options: Partial<HorizonCullingOptions> = {},
	) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};
	}

	setEnabled(enabled: boolean): void {
		this.options.enabled = enabled;
	}

	setDebug(debug: boolean): void {
		this.options.debug = debug;
	}

	isEnabled(): boolean {
		return this.options.enabled;
	}

	isDebugEnabled(): boolean {
		return this.options.debug;
	}

	resetFrameStats(): void {
		this.stats.tested = 0;
		this.stats.visible = 0;
		this.stats.culled = 0;
		this.stats.forcedVisibleNearSurface = 0;
		this.stats.disabled = 0;

		this.debugSamples.length = 0;
	}

	getStats(): HorizonCullingStats {
		return {
			...this.stats,
		};
	}

	getDebugSamples(): HorizonCullingDebugSample[] {
		return this.debugSamples;
	}

	testPatchSphere(
		cameraPosition: THREE.Vector3,
		patchCenter: THREE.Vector3,
		patchRadius: number,
	): HorizonCullingResult {
		this.stats.tested++;

		const cameraDistance = cameraPosition.length();
		const cameraHeight = cameraDistance - this.planetRadius;

		if (!this.options.enabled) {
			this.stats.disabled++;
			this.stats.visible++;

			return this.finishResult(
				{
					visible: true,
					reason: 'disabled',
					distanceToCamera: cameraPosition.distanceTo(patchCenter),
					horizonLimit: 0,
					cameraHeight,
				},
				patchCenter,
				patchRadius,
			);
		}

		if (cameraHeight < this.options.minCameraHeightForCulling) {
			this.stats.forcedVisibleNearSurface++;
			this.stats.visible++;

			return this.finishResult(
				{
					visible: true,
					reason: 'near-surface',
					distanceToCamera: cameraPosition.distanceTo(patchCenter),
					horizonLimit: 0,
					cameraHeight,
				},
				patchCenter,
				patchRadius,
			);
		}

		const cameraDirection = cameraPosition
			.clone()
			.normalize();

		const patchDirection = patchCenter
			.clone()
			.normalize();

		const dotToPatch = cameraDirection.dot(patchDirection);

		/**
		 * Horizon-Grenze:
		 *
		 * Bei einer Kugel ist der sichtbare Winkel vom Kamerapunkt abhängig.
		 * cos(theta) = R / cameraDistance
		 *
		 * Alles deutlich hinter dieser Grenze ist vom Planeten verdeckt.
		 */
		const horizonCos = this.planetRadius / cameraDistance;

		/**
		 * Patch-Radius als Winkelpuffer.
		 * Größere Patches bleiben länger sichtbar.
		 */
		const angularPatchMargin = Math.asin(
			THREE.MathUtils.clamp(
				(patchRadius / this.planetRadius) + this.options.safetyMargin,
				0,
				0.95,
			),
		);

		const horizonAngle = Math.acos(
			THREE.MathUtils.clamp(horizonCos, -1, 1),
		);

		const patchAngle = Math.acos(
			THREE.MathUtils.clamp(dotToPatch, -1, 1),
		);

		const horizonLimit = horizonAngle + angularPatchMargin;

		const visible = patchAngle <= horizonLimit;

		if (visible) {
			this.stats.visible++;

			const reason: HorizonCullingResultReason =
				      patchAngle <= horizonAngle
				      ? 'visible-front'
				      : 'visible-margin';

			return this.finishResult(
				{
					visible: true,
					reason,
					distanceToCamera: cameraPosition.distanceTo(patchCenter),
					horizonLimit,
					cameraHeight,
				},
				patchCenter,
				patchRadius,
			);
		}

		this.stats.culled++;

		return this.finishResult(
			{
				visible: false,
				reason: 'culled-behind-horizon',
				distanceToCamera: cameraPosition.distanceTo(patchCenter),
				horizonLimit,
				cameraHeight,
			},
			patchCenter,
			patchRadius,
		);
	}

	private finishResult(
		result: HorizonCullingResult,
		center: THREE.Vector3,
		radius: number,
	): HorizonCullingResult {
		if (this.options.debug) {
			this.debugSamples.push({
				                       center: center.clone(),
				                       radius,
				                       visible: result.visible,
				                       reason: result.reason,
				                       distanceToCamera: result.distanceToCamera,
				                       horizonLimit: result.horizonLimit,
				                       cameraHeight: result.cameraHeight,
			                       });
		}

		return result;
	}
}
