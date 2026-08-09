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

		const nodeLayout = this.createLayoutFromEngineNodes(
			shipObject,
			role,
		);

		if (nodeLayout) {
			const instance = this.createInstance(role, nodeLayout);

			shipObject.add(instance.root);
			instance.root.userData.engineVfxInstance = instance;
			return instance;
		}

		/*
		 * Frigate is a real GLB and loads asynchronously. If no explicit
		 * engine_01 style nodes exist yet, wait until the real model exists,
		 * then derive rear engine positions from its actual bounds.
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

	private createLayoutFromEngineNodes(
		shipRoot: THREE.Object3D,
		role: ShipRole,
	): EngineLayout | null {
		const engineNodes = findEngineNodes(shipRoot);

		if (engineNodes.length === 0) {
			return null;
		}

		shipRoot.updateMatrixWorld(true);

		const worldBox = new THREE.Box3().setFromObject(shipRoot);
		const size = new THREE.Vector3();
		worldBox.getSize(size);

		return {
			points: engineNodes.map((node) => {
				const worldPosition = new THREE.Vector3();
				node.getWorldPosition(worldPosition);
				const localPosition = shipRoot.worldToLocal(worldPosition);

				return {
					x: localPosition.x,
					y: localPosition.y,
					z: localPosition.z,
				};
			}),
			coreRadius: getNodeCoreRadius(role, size),
			plumeLength: getNodePlumeLength(role, size),
		};
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
		const plumeTexture = createPlumeTexture();

		root.name = ENGINE_ROOT_NAME;
		root.renderOrder = 30;

		for (let index = 0; index < layout.points.length; index++) {
			const point = layout.points[index];
			const coreMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color().setRGB(0.22, 0.76, 1.0),
				transparent: true,
				opacity: 0.42,
				depthTest: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			});
			const plumeMaterial = new THREE.MeshBasicMaterial({
				map: plumeTexture,
				color: new THREE.Color().setRGB(0.18, 0.56, 1.0),
				transparent: true,
				opacity: 0.20,
				depthTest: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
			});

			const core = new THREE.Mesh(
				new THREE.SphereGeometry(layout.coreRadius, 14, 8),
				coreMaterial,
			);
			const plume = new THREE.Mesh(
				new THREE.PlaneGeometry(1, 1),
				plumeMaterial,
			);

			core.position.set(point.x, point.y, point.z);
			plume.rotation.y = -Math.PI * 0.5;
			plume.position.set(
				point.x,
				point.y,
				point.z + layout.plumeLength * 0.5,
			);
			plume.scale.set(
				layout.plumeLength,
				layout.coreRadius * 4.2,
				1,
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
		const plumeLengthScale = THREE.MathUtils.lerp(0.35, 1.65, Math.pow(throttle, 0.72)) * pulse;
		const plumeWidthScale = THREE.MathUtils.lerp(0.72, 1.18, throttle);

		for (const core of instance.cores) {
			core.scale.setScalar(THREE.MathUtils.lerp(0.70, 1.20, energy));
			const material = core.material as THREE.MeshBasicMaterial;
			material.opacity = THREE.MathUtils.lerp(0.12, 0.54, energy);
		}

		for (const plume of instance.plumes) {
			const baseLength =
				typeof plume.userData.baseLength === 'number'
					? plume.userData.baseLength as number
					: plume.scale.x;
			const baseWidth =
				typeof plume.userData.baseWidth === 'number'
					? plume.userData.baseWidth as number
					: plume.scale.y;

			plume.userData.baseLength = baseLength;
			plume.userData.baseWidth = baseWidth;
			plume.scale.set(
				baseLength * plumeLengthScale,
				baseWidth * plumeWidthScale,
				1,
			);

			const material = plume.material as THREE.MeshBasicMaterial;
			material.opacity = THREE.MathUtils.lerp(0.025, 0.28, Math.pow(energy, 0.92));
		}
	}
}

function createPlumeTexture(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;
	const context = canvas.getContext('2d');

	if (context) {
		const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
		gradient.addColorStop(0.00, 'rgba(255,255,255,0.96)');
		gradient.addColorStop(0.12, 'rgba(130,230,255,0.72)');
		gradient.addColorStop(0.46, 'rgba(38,120,255,0.24)');
		gradient.addColorStop(1.00, 'rgba(0,0,0,0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		const vertical = context.createLinearGradient(0, 0, 0, canvas.height);
		vertical.addColorStop(0.00, 'rgba(255,255,255,0)');
		vertical.addColorStop(0.42, 'rgba(255,255,255,0.82)');
		vertical.addColorStop(0.50, 'rgba(255,255,255,1)');
		vertical.addColorStop(0.58, 'rgba(255,255,255,0.82)');
		vertical.addColorStop(1.00, 'rgba(255,255,255,0)');
		context.globalCompositeOperation = 'destination-in';
		context.fillStyle = vertical;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return texture;
}

function findEngineNodes(root: THREE.Object3D): THREE.Object3D[] {
	const nodes: THREE.Object3D[] = [];

	root.traverse((node) => {
		if (/^engine_\d+$/.test(node.name)) {
			nodes.push(node);
		}
	});

	return nodes;
}

function getNodeCoreRadius(
	role: ShipRole,
	modelSize: THREE.Vector3,
): number {
	const fallback = getFallbackEngineLayout(role).coreRadius;

	return THREE.MathUtils.clamp(
		Math.max(modelSize.x, modelSize.y) * 0.035,
		fallback * 0.55,
		fallback * 1.25,
	);
}

function getNodePlumeLength(
	role: ShipRole,
	modelSize: THREE.Vector3,
): number {
	const fallback = getFallbackEngineLayout(role).plumeLength;

	return THREE.MathUtils.clamp(
		modelSize.z * 0.16,
		fallback * 0.75,
		fallback * 1.65,
	);
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
