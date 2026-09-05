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
	readonly group = new THREE.Group();
	modernRuntime: SystemPlanetViewRuntime | null = null;

	private readonly preview: THREE.Group;
	private readonly pendingSunDirection = new THREE.Vector3(1, 0.15, 0.35);
	private pendingRenderQuality: PlanetRenderQuality = 'idle';
	private pendingRenderTuning: Partial<PlanetRenderTuning> = {};
	private pendingHorizonCulling = false;
	private pendingPatchFrustumCulling = false;

	constructor(
		private readonly radius: number,
		private readonly rendererMode: PlanetRendererMode,
		private readonly definition: PlanetDefinition,
		private readonly profile: PlanetRenderProfile,
	) {
		this.group.name = 'SystemPlanetLazyRuntime';
		this.preview = createOverviewPlanet(definition, radius);
		this.group.add(this.preview);
	}

	update(cameraRenderPosition: THREE.Vector3, deltaSeconds: number): void {
		this.syncCameraOwnership();
		if (!this.modernRuntime) {
			this.preview.rotation.y += Math.max(0, deltaSeconds) * 0.035;
			return;
		}
		this.modernRuntime.update(cameraRenderPosition, deltaSeconds);
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.pendingSunDirection.copy(direction);
		this.modernRuntime?.setSunDirection(direction);
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		this.pendingRenderQuality = quality;
		this.modernRuntime?.setRenderQuality(quality);
	}

	setRenderTuning(tuning: Partial<PlanetRenderTuning>): void {
		this.pendingRenderTuning = {
			...this.pendingRenderTuning,
			...tuning,
		};
		this.modernRuntime?.setRenderTuning(tuning);
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.pendingHorizonCulling = enabled;
		this.modernRuntime?.setHorizonCullingEnabled(enabled);
	}

	setPatchFrustumCullingEnabled(enabled: boolean): void {
		this.pendingPatchFrustumCulling = enabled;
		this.modernRuntime?.setPatchFrustumCullingEnabled(enabled);
	}

	dispose(): void {
		if (activeModernGamePlanet === this) {
			activeModernGamePlanet = null;
		}
		this.modernRuntime?.endCameraInteraction(false);
		this.modernRuntime?.dispose();
		this.modernRuntime = null;
		disposeOverviewPlanet(this.preview);
		this.group.clear();
	}

	private ensureModernRuntime(camera: THREE.PerspectiveCamera): SystemPlanetViewRuntime {
		if (this.modernRuntime) return this.modernRuntime;

		const localCameraPosition = camera.position.clone().sub(this.group.position);
		const runtime = new SystemPlanetViewRuntime(
			this.definition,
			this.profile,
			this.radius,
			this.rendererMode,
			localCameraPosition,
		);

		disposeOverviewPlanet(this.preview);
		this.preview.removeFromParent();
		runtime.group.position.set(0, 0, 0);
		this.group.add(runtime.group);
		this.modernRuntime = runtime;

		runtime.setSunDirection(this.pendingSunDirection);
		runtime.setRenderQuality(this.pendingRenderQuality);
		runtime.setRenderTuning(this.pendingRenderTuning);
		runtime.setHorizonCullingEnabled(this.pendingHorizonCulling);
		runtime.setPatchFrustumCullingEnabled(this.pendingPatchFrustumCulling);
		return runtime;
	}

	private syncCameraOwnership(): void {
		const controls = getActiveOrbitControls();
		if (!controls) return;

		const camera = controls.object;
		if (!(camera instanceof THREE.PerspectiveCamera)) return;

		const systemRenderRadius =
			(this.group.userData.systemRenderRadius as number | undefined) ??
			this.radius;
		const focusTolerance = Math.max(0.02, systemRenderRadius * 0.08);
		const targetDistance = controls.target.distanceTo(this.group.position);
		const matchesExistingPlanetFocus =
			controls.enableRotate &&
			controls.enableZoom &&
			targetDistance <= focusTolerance;

		if (activeModernGamePlanet !== this && matchesExistingPlanetFocus) {
			activeModernGamePlanet?.modernRuntime?.endCameraInteraction(false);
			activeModernGamePlanet = this;
			const runtime = this.ensureModernRuntime(camera);
			runtime.beginCameraInteraction(camera, controls, this.group.position);
			return;
		}

		if (activeModernGamePlanet !== this) return;

		const gameReturnedToPan = !controls.enableRotate || !controls.enableZoom;
		const externalOrbitTargetChanged =
			controls.enabled &&
			!(this.modernRuntime?.isFreeLookActive() ?? false) &&
			targetDistance > Math.max(focusTolerance, this.radius * 0.5);

		if (gameReturnedToPan || externalOrbitTargetChanged) {
			this.modernRuntime?.endCameraInteraction(false);
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

	return new Proxy(facade as unknown as LegacyPlanet, {
		get(target, property, receiver) {
			if (Reflect.has(target as object, property)) {
				const value = Reflect.get(target as object, property, receiver);
				return typeof value === 'function'
					? value.bind(facade)
					: value;
			}

			const legacyPlanet = facade.modernRuntime?.runtime.planet as
				| Record<PropertyKey, unknown>
				| undefined;
			if (!legacyPlanet) return undefined;
			const value = legacyPlanet[property];
			return typeof value === 'function'
				? value.bind(legacyPlanet)
				: value;
		},
	}) as LegacyPlanet;
}

function createOverviewPlanet(
	definition: PlanetDefinition,
	radius: number,
): THREE.Group {
	const group = new THREE.Group();
	group.name = 'SystemPlanetOverviewProxy';

	const style = getOverviewStyle(definition.class);
	const body = new THREE.Mesh(
		new THREE.SphereGeometry(radius, 24, 12),
		new THREE.MeshStandardMaterial({
			color: style.color,
			emissive: style.emissive,
			emissiveIntensity: style.emissiveIntensity,
			roughness: style.roughness,
			metalness: style.metalness,
		}),
	);
	body.name = 'SystemPlanetOverviewBody';
	group.add(body);

	if (definition.rings?.enabled) {
		const ring = new THREE.Mesh(
			new THREE.RingGeometry(radius * 1.35, radius * 2.15, 36),
			new THREE.MeshBasicMaterial({
				color: 0xb7b1a2,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.34,
				depthWrite: false,
			}),
		);
		ring.rotation.x = Math.PI * 0.5;
		group.add(ring);
	}

	return group;
}

function disposeOverviewPlanet(group: THREE.Group): void {
	group.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		object.geometry.dispose();
		const materials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of materials) material.dispose();
	});
}

function getOverviewStyle(planetClass: PlanetDefinition['class']): {
	color: THREE.ColorRepresentation;
	emissive: THREE.ColorRepresentation;
	emissiveIntensity: number;
	roughness: number;
	metalness: number;
} {
	switch (planetClass) {
		case 'ocean': return { color: 0x0876c8, emissive: 0x00182a, emissiveIntensity: 0.08, roughness: 0.50, metalness: 0.02 };
		case 'terrestrial': return { color: 0x4da76a, emissive: 0x06180c, emissiveIntensity: 0.06, roughness: 0.72, metalness: 0.02 };
		case 'desert': return { color: 0xc98a45, emissive: 0x1d0d03, emissiveIntensity: 0.06, roughness: 0.88, metalness: 0.01 };
		case 'ice': return { color: 0xbfdff2, emissive: 0x07131b, emissiveIntensity: 0.08, roughness: 0.44, metalness: 0.02 };
		case 'ice_giant': return { color: 0x80c9f4, emissive: 0x071a2a, emissiveIntensity: 0.10, roughness: 0.40, metalness: 0.01 };
		case 'lava': return { color: 0x7f140a, emissive: 0xff2b08, emissiveIntensity: 0.24, roughness: 0.62, metalness: 0.05 };
		case 'toxic': return { color: 0x8aa28f, emissive: 0x1a2316, emissiveIntensity: 0.10, roughness: 0.76, metalness: 0.01 };
		case 'carbon': return { color: 0x252321, emissive: 0x050403, emissiveIntensity: 0.04, roughness: 0.82, metalness: 0.08 };
		case 'metal_rich': return { color: 0x9d9788, emissive: 0x0b0b0b, emissiveIntensity: 0.04, roughness: 0.46, metalness: 0.38 };
		case 'gas_giant': return { color: 0xc69054, emissive: 0x1b0e05, emissiveIntensity: 0.06, roughness: 0.58, metalness: 0.01 };
		case 'rocky': return { color: 0x766f68, emissive: 0x070707, emissiveIntensity: 0.03, roughness: 0.90, metalness: 0.04 };
		case 'barren': return { color: 0x8d7a65, emissive: 0x080503, emissiveIntensity: 0.03, roughness: 0.92, metalness: 0.03 };
	}
}

const PlanetConstructor = new Proxy(LegacyPlanet, {
	construct(target, argumentList, newTarget) {
		const radius = argumentList[0] as number;
		const rendererMode =
			(argumentList[1] as PlanetRendererMode | undefined) ?? 'webgl';
		const features =
			(argumentList[3] as Partial<PlanetRenderFeatures> | undefined) ?? {};
		const definition =
			(argumentList[4] as PlanetDefinition | null | undefined) ?? null;
		const profile =
			(argumentList[5] as PlanetRenderProfile | null | undefined) ?? null;

		if (features.nearSurfaceTerrain === true) {
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
