import * as THREE from 'three';

import type {
	ShipDefinition,
	ShipRole,
} from '../model/GameWorld';

type ShipMeshMap = Map<string, THREE.Object3D>;

type EngineVfxInstance = {
	root: THREE.Group;
	cores: THREE.Mesh[];
	plumes: THREE.Mesh[];
	role: ShipRole;
};

const ENGINE_ROOT_NAME = 'EngineVFXRoot';

export class EngineVfxSystem {
	private elapsedSeconds = 0;

	update(
		ships: ShipDefinition[],
		systemMeshes: ShipMeshMap,
		strategicMeshes: ShipMeshMap,
		deltaSeconds: number,
		viewMode: 'strategic' | 'system',
	): void {
		this.elapsedSeconds += Math.max(0, deltaSeconds);

		for (const ship of ships) {
			const mesh =
				viewMode === 'system'
					? systemMeshes.get(ship.id)
					: strategicMeshes.get(ship.id);

			if (!mesh || !mesh.visible) {
				continue;
			}

			const instance = this.ensureInstance(
				mesh,
				ship.role,
			);

			if (!instance) {
				continue;
			}

			this.updateInstance(
				instance,
				ship,
				viewMode,
				deltaSeconds,
			);
		}
	}

	private ensureInstance(
		shipObject: THREE.Object3D,
		role: ShipRole,
	): EngineVfxInstance | null {
		const existing = shipObject.getObjectByName(ENGINE_ROOT_NAME);

		if (
			existing instanceof THREE.Group &&
			existing.userData.engineVfxInstance
		) {
			return existing.userData.engineVfxInstance as EngineVfxInstance;
		}

		/*
		 * Frigate is a real GLB and loads asynchronously. Never attach the old
		 * hard-coded fallback engines to the ship root. Wait until the real model
		 * exists, then derive rear engine positions from its actual bounds.
		 */
		if (role === 'frigate') {
			const frigateModel = shipObject.getObjectByName('FrigateShipModel');

			if (!frigateModel) {
				return null;
			}

			const layout = this.createFrigateLayoutFromModel(
				shipObject,
				frigateModel,
			);
			const instance = this.createInstance(role, layout);

			shipObject.add(instance.root);
			instance.root.userData.engineVfxInstance = instance;
			return instance;
		}

		const instance = this.createInstance(
			role,
			getFallbackEngineLayout(role),
		);

		shipObject.add(instance.root);
		instance.root.userData.engineVfxInstance = instance;
		return instance;
	}

	private createFrigateLayoutFromModel(
		shipRoot: THREE.Object3D,
		model: THREE.Object3D,
	): EngineLayout {
		shipRoot.updateMatrixWorld(true);
		model.updateMatrixWorld(true);

		const worldBox = new THREE.Box3().setFromObject(model);

		if (worldBox.isEmpty()) {
			return getFallbackEngineLayout('frigate');
		}

		const corners = [
			new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
			new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
			new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
			new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
			new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
			new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
			new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
			new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
		].map((point) => shipRoot.worldToLocal(point));

		const localBox = new THREE.Box3().setFromPoints(corners);
		const size = new THREE.Vector3();
		const center = new THREE.Vector3();

		localBox.getSize(size);
		localBox.getCenter(center);

		/*
		 * frigate.glb flies toward local -Z, therefore +Z is the stern.
		 * Place two small exhausts just behind the real model bounds.
		 */
		const sternZ = localBox.max.z + Math.max(size.z * 0.012, 0.015);
		const xOffset = Math.max(size.x * 0.22, 0.035);
		const y = center.y - size.y * 0.08;
		const coreRadius = THREE.MathUtils.clamp(size.x * 0.035, 0.018, 0.055);
		const plumeLength = THREE.MathUtils.clamp(size.z * 0.12, 0.12, 0.42);

		return {
			points: [
				{ x: center.x - xOffset, y, z: sternZ },
				{ x: center.x + xOffset, y, z: sternZ },
			],
			coreRadius,
			plumeLength,
		};
	}

	private createInstance(
		role: ShipRole,
		layout: EngineLayout,
	): EngineVfxInstance {
		const root = new THREE.Group();
		const cores: THREE.Mesh[] = [];
		const plumes: THREE.Mesh[] = [];

		root.name = ENGINE_ROOT_NAME;
		root.renderOrder = 30;

		for (let index = 0; index < layout.points.length; index++) {
			const point = layout.points[index];
			const coreMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color().setRGB(0.10, 0.62, 1.55),
				transparent: true,
				opacity: 0.56,
				depthTest: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			});
			const plumeMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color().setRGB(0.05, 0.34, 1.35),
				transparent: true,
				opacity: 0.28,
				depthTest: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
			});

			const core = new THREE.Mesh(
				new THREE.SphereGeometry(layout.coreRadius, 10, 6),
				coreMaterial,
			);
			const plume = new THREE.Mesh(
				new THREE.ConeGeometry(
					layout.coreRadius * 0.72,
					layout.plumeLength,
					10,
					1,
					true,
				),
				plumeMaterial,
			);

			core.position.set(point.x, point.y, point.z);
			plume.rotation.x = -Math.PI * 0.5;
			plume.position.set(
				point.x,
				point.y,
				point.z + layout.plumeLength * 0.48,
			);

			core.name = `engine_core_${index + 1}`;
			plume.name = `engine_plume_${index + 1}`;
			core.renderOrder = 31;
			plume.renderOrder = 30;

			root.add(core, plume);
			cores.push(core);
			plumes.push(plume);
		}

		return { root, cores, plumes, role };
	}

	private updateInstance(
		instance: EngineVfxInstance,
		ship: ShipDefinition,
		viewMode: 'strategic' | 'system',
		deltaSeconds: number,
	): void {
		const velocity = viewMode === 'system' ? ship.systemVelocity : ship.velocity;
		const maxSpeed = viewMode === 'system' ? ship.maxSpeed : ship.strategicMaxSpeed;
		const speed = Math.sqrt(
			velocity.x * velocity.x +
			velocity.y * velocity.y +
			velocity.z * velocity.z,
		);
		const rawThrottle = maxSpeed > 0
			? THREE.MathUtils.clamp(speed / maxSpeed, 0, 1)
			: 0;
		const previousThrottle =
			typeof instance.root.userData.engineThrottle === 'number'
				? instance.root.userData.engineThrottle as number
				: rawThrottle;
		const smoothing = 1 - Math.exp(-5.5 * Math.max(0, deltaSeconds));
		const throttle = THREE.MathUtils.lerp(previousThrottle, rawThrottle, smoothing);

		instance.root.userData.engineThrottle = throttle;

		const phase = hashString01(ship.id) * Math.PI * 2;
		const pulse = 1 + Math.sin(this.elapsedSeconds * 8.0 + phase) * 0.035;
		const energy = THREE.MathUtils.lerp(0.10, 1.0, throttle) * pulse;
		const plumeLengthScale = THREE.MathUtils.lerp(0.22, 1.85, Math.pow(throttle, 0.72)) * pulse;
		const plumeWidthScale = THREE.MathUtils.lerp(0.62, 1.05, throttle);

		for (const core of instance.cores) {
			core.scale.setScalar(THREE.MathUtils.lerp(0.62, 1.12, energy));
			const material = core.material as THREE.MeshBasicMaterial;
			material.opacity = THREE.MathUtils.lerp(0.18, 0.72, energy);
		}

		for (const plume of instance.plumes) {
			plume.scale.set(plumeWidthScale, plumeLengthScale, plumeWidthScale);
			const material = plume.material as THREE.MeshBasicMaterial;
			material.opacity = THREE.MathUtils.lerp(0.035, 0.38, Math.pow(energy, 0.92));
		}
	}
}

type EngineLayout = {
	points: Array<{ x: number; y: number; z: number }>;
	coreRadius: number;
	plumeLength: number;
};

function getFallbackEngineLayout(role: ShipRole): EngineLayout {
	switch (role) {
		case 'carrier':
			return {
				points: [
					{ x: -0.42, y: -0.08, z: 1.42 },
					{ x: 0.42, y: -0.08, z: 1.42 },
				],
				coreRadius: 0.075,
				plumeLength: 0.46,
			};
		case 'frigate':
			return {
				points: [
					{ x: -0.18, y: -0.03, z: 0.74 },
					{ x: 0.18, y: -0.03, z: 0.74 },
				],
				coreRadius: 0.04,
				plumeLength: 0.24,
			};
		case 'constructor':
			return {
				points: [
					{ x: -0.12, y: 0, z: 0.54 },
					{ x: 0.12, y: 0, z: 0.54 },
				],
				coreRadius: 0.038,
				plumeLength: 0.22,
			};
		case 'fighter':
			return {
				points: [{ x: 0, y: 0, z: 0.42 }],
				coreRadius: 0.032,
				plumeLength: 0.18,
			};
		case 'scout':
			return {
				points: [{ x: 0, y: 0, z: 0.38 }],
				coreRadius: 0.030,
				plumeLength: 0.16,
			};
	}
}

function hashString01(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}
