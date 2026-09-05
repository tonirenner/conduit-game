import * as THREE from 'three';
import { Planet as LegacyPlanet } from '../../../packages/conduit-planet/src/Planet';
import type { PlanetDefinition } from '../../../packages/conduit-planet/src/model';
import type { PlanetRenderFeatures } from '../../../packages/conduit-planet/src/rendering/PlanetRenderFeatures';
import type { PlanetRenderProfile } from '../../../packages/conduit-planet/src/rendering/PlanetRenderProfile';
import type {
	PlanetRendererMode,
	PlanetRenderQuality,
	PlanetRenderTuning,
} from '../../../packages/conduit-planet/src/Planet';
import { SystemPlanetViewRuntime } from './SystemPlanetViewRuntime';
import { getActiveOrbitControls } from './planet/RegisteredOrbitControls';

export * from '../../../packages/conduit-planet/src/rendering/index';

/**
 * Source-compatible Planet type for existing game code.
 *
 * The value export below is a constructor proxy. Type positions intentionally
 * remain the legacy Planet surface so the large GamePrototypeScene does not
 * need a mechanical type rewrite during the production runtime migration.
 */
export type Planet = LegacyPlanet;

let activeModernGamePlanet: ModernGamePlanetFacade | null = null;

class ModernGamePlanetFacade {
	readonly group: THREE.Group;
	readonly modernRuntime: SystemPlanetViewRuntime;

	constructor(
		private readonly radius: number,
		rendererMode: PlanetRendererMode,
		definition: PlanetDefinition,
		profile: PlanetRenderProfile,
	) {
		this.modernRuntime = new SystemPlanetViewRuntime(
			definition,
			profile,
			radius,
			rendererMode,
			new THREE.Vector3(0, 0, radius * 3),
		);
		this.group = this.modernRuntime.group;
	}

	update(cameraRenderPosition: THREE.Vector3, deltaSeconds: number): void {
		this.syncCameraOwnership();
		this.modernRuntime.update(cameraRenderPosition, deltaSeconds);
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.modernRuntime.setSunDirection(direction);
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		this.modernRuntime.setRenderQuality(quality);
	}

	setRenderTuning(tuning: Partial<PlanetRenderTuning>): void {
		this.modernRuntime.setRenderTuning(tuning);
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.modernRuntime.setHorizonCullingEnabled(enabled);
	}

	setPatchFrustumCullingEnabled(enabled: boolean): void {
		this.modernRuntime.setPatchFrustumCullingEnabled(enabled);
	}

	dispose(): void {
		if (activeModernGamePlanet === this) {
			activeModernGamePlanet = null;
		}
		this.modernRuntime.endCameraInteraction(false);
		this.modernRuntime.dispose();
	}

	private syncCameraOwnership(): void {
		const controls = getActiveOrbitControls();
		if (!controls) return;

		const camera = controls.object;
		if (!(camera instanceof THREE.PerspectiveCamera)) return;

		const focusTolerance = Math.max(
			0.02,
			(this.group.userData.systemRenderRadius as number | undefined ?? this.radius) * 0.08,
		);
		const targetDistance = controls.target.distanceTo(this.group.position);
		const matchesExistingPlanetFocus =
			controls.enableRotate &&
			controls.enableZoom &&
			targetDistance <= focusTolerance;

		if (activeModernGamePlanet !== this && matchesExistingPlanetFocus) {
			activeModernGamePlanet?.modernRuntime.endCameraInteraction(false);
			activeModernGamePlanet = this;
			this.modernRuntime.beginCameraInteraction(camera, controls);
			return;
		}

		if (activeModernGamePlanet !== this) return;

		const gameReturnedToPan = !controls.enableRotate || !controls.enableZoom;
		const externalOrbitTargetChanged =
			controls.enabled &&
			!this.modernRuntime.isFreeLookActive() &&
			targetDistance > Math.max(focusTolerance, this.radius * 0.5);

		if (gameReturnedToPan || externalOrbitTargetChanged) {
			this.modernRuntime.endCameraInteraction(false);
			activeModernGamePlanet = null;
		}
	}
}

function createModernGamePlanet(
	radius: number,
	rendererMode: PlanetRendererMode,
	definition: PlanetDefinition,
	profile: PlanetRenderProfile,
): LegacyPlanet {
	const facade = new ModernGamePlanetFacade(
		radius,
		rendererMode,
		definition,
		profile,
	);

	/**
	 * Forward compatibility/debug methods that are not part of the narrow game
	 * facade to the internal Planet retained by PlanetViewRuntime. This keeps
	 * existing callers observationally compatible while surface/view ownership
	 * is modern.
	 */
	return new Proxy(facade as unknown as LegacyPlanet, {
		get(target, property, receiver) {
			if (Reflect.has(target as object, property)) {
				const value = Reflect.get(target as object, property, receiver);
				return typeof value === 'function'
					? value.bind(facade)
					: value;
			}

			const legacyPlanet = facade.modernRuntime.runtime.planet as unknown as Record<PropertyKey, unknown>;
			const value = legacyPlanet[property];
			return typeof value === 'function'
				? value.bind(legacyPlanet)
				: value;
		},
	}) as LegacyPlanet;
}

const PlanetConstructor = new Proxy(LegacyPlanet, {
	construct(target, argumentList, newTarget) {
		const [
			radius,
			rendererMode = 'webgl',
			_terrainTextureSet,
			features = {},
			definition = null,
			profile = null,
		] = argumentList as [
			number,
			PlanetRendererMode?,
			unknown?,
			Partial<PlanetRenderFeatures>?,
			PlanetDefinition | null?,
			PlanetRenderProfile | null?,
		];

		if (features?.nearSurfaceTerrain === true) {
			if (rendererMode !== 'webgpu') {
				throw new Error(
					'Production Game planet runtime requires WebGPU; legacy NearSurface fallback is disabled.',
				);
			}
			if (!definition || !profile) {
				throw new Error(
					'Production Game planet runtime requires PlanetDefinition and PlanetRenderProfile.',
				);
			}

			return createModernGamePlanet(
				radius,
				rendererMode,
				definition,
				profile,
			);
		}

		return Reflect.construct(target, argumentList, newTarget);
	},
});

export const Planet = PlanetConstructor as typeof LegacyPlanet;
