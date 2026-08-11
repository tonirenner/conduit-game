import * as THREE from 'three';
import { findNodesByKind } from '@conduit/web3d/assets';

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
	layoutSource: EngineLayoutSource;
};

const ENGINE_ROOT_NAME = 'EngineVFXRoot';
const DEFAULT_ENGINE_DIRECTION = Object.freeze({ x: 0, y: 0, z: 1 });

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
		const desiredLayout = this.createDesiredLayout(shipObject, role);

		/*
		 * Frigate is a real GLB and loads asynchronously. If no explicit
		 * engine nodes or real model bounds exist yet, wait instead of showing
		 * temporary fallback exhausts in the wrong place.
		 */
		if (!desiredLayout) {
			return null;
		}

		if (
			existing instanceof THREE.Group &&
			existing.userData.engineVfxInstance
		) {
			const instance = existing.userData.engineVfxInstance as EngineVfxInstance;

			if (
				instance.layoutSource.priority >= desiredLayout.source.priority
			) {
				return instance;
			}

			shipObject.remove(instance.root);
			disposeObject(instance.root);
		}

		const instance = this.createInstance(
			role,
			desiredLayout.layout,
			desiredLayout.source,
		);

		shipObject.add(instance.root);
		instance.root.userData.engineVfxInstance = instance;
		return instance;
	}

	private createDesiredLayout(
		shipObject: THREE.Object3D,
		role: ShipRole,
	): DesiredEngineLayout | null {
		const nodeLayout = this.createLayoutFromEngineNodes(
			shipObject,
			role,
		);

		if (nodeLayout) {
			return {
				layout: nodeLayout,
				source: ENGINE_LAYOUT_SOURCES.nodes,
			};
		}

		if (role === 'frigate') {
			const frigateModel = shipObject.getObjectByName('FrigateShipModel');

			if (!frigateModel) {
				return null;
			}

			return {
				layout: this.createBoundsLayoutFromModel(
					shipObject,
					frigateModel,
					'frigate',
					'min',
				),
				source: ENGINE_LAYOUT_SOURCES.modelBounds,
			};
		}

		if (role === 'carrier') {
			const capitalModel = shipObject.getObjectByName('CapitalShipModel');

			if (capitalModel) {
				return {
					layout: this.createBoundsLayoutFromModel(
						shipObject,
						capitalModel,
						'carrier',
						'max',
					),
					source: ENGINE_LAYOUT_SOURCES.modelBounds,
				};
			}
		}

		return {
			layout: getFallbackEngineLayout(role),
			source: ENGINE_LAYOUT_SOURCES.fallback,
		};
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
		const localBox = worldBoxToLocalBox(worldBox, shipRoot);
		const localCenter = new THREE.Vector3();

		worldBox.getSize(size);
		localBox.getCenter(localCenter);

		return {
			points: engineNodes.map((node) => {
				const worldPosition = new THREE.Vector3();
				node.getWorldPosition(worldPosition);
				const localPosition = shipRoot.worldToLocal(worldPosition);
				const direction = getEngineDirectionAwayFromCenter(
					localPosition,
					localCenter,
				);
				const anchorPosition = getEngineAnchorPosition(
					node,
					shipRoot,
					localPosition,
					direction,
				);

				return {
					x: anchorPosition.x,
					y: anchorPosition.y,
					z: anchorPosition.z,
					direction,
				};
			}),
			coreRadius: getNodeCoreRadius(role, size),
			plumeLength: getNodePlumeLength(role, size),
		};
	}

	private createBoundsLayoutFromModel(
		shipRoot: THREE.Object3D,
		model: THREE.Object3D,
		role: ShipRole,
		sternSide: 'min' | 'max',
	): EngineLayout {
		shipRoot.updateMatrixWorld(true);
		model.updateMatrixWorld(true);

		const worldBox = new THREE.Box3().setFromObject(model);

		if (worldBox.isEmpty()) {
			return getFallbackEngineLayout(role);
		}

		const localBox = worldBoxToLocalBox(worldBox, shipRoot);
		const size = new THREE.Vector3();
		const center = new THREE.Vector3();

		localBox.getSize(size);
		localBox.getCenter(center);

		/*
		 * Frigate GLB has its visible engine mesh at negative local Z after
		 * import normalization. The fallback lab ships still use positive Z.
		 */
		const sternSign = sternSide === 'min' ? -1 : 1;
		const sternZ =
			(sternSide === 'min' ? localBox.min.z : localBox.max.z) +
			Math.max(size.z * 0.012, 0.015) * sternSign;
		const direction = { x: 0, y: 0, z: sternSign };
		const xOffset = Math.max(size.x * 0.20, 0.035);
		const y = center.y - size.y * 0.08;
		const coreRadius = THREE.MathUtils.clamp(size.x * 0.035, 0.018, 0.055);
		const plumeLength = THREE.MathUtils.clamp(size.z * 0.12, 0.12, 0.42);

		return {
			points: [
				{ x: center.x - xOffset, y, z: sternZ, direction },
				{ x: center.x + xOffset, y, z: sternZ, direction },
			],
			coreRadius,
			plumeLength,
		};
	}

	private createInstance(
		role: ShipRole,
		layout: EngineLayout,
		layoutSource: EngineLayoutSource,
	): EngineVfxInstance {
		const root = new THREE.Group();
		const cores: THREE.Mesh[] = [];
		const plumes: THREE.Mesh[] = [];
		const plumeTexture = createPlumeTexture();

		root.name = ENGINE_ROOT_NAME;
		root.renderOrder = 30;

		for (let index = 0; index < layout.points.length; index++) {
			const point = layout.points[index];
			const direction = normalizeEngineDirection(point.direction);
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
			plume.quaternion.setFromUnitVectors(
				new THREE.Vector3(1, 0, 0),
				new THREE.Vector3(direction.x, direction.y, direction.z),
			);
			plume.position.set(
				point.x + direction.x * layout.plumeLength * 0.5,
				point.y + direction.y * layout.plumeLength * 0.5,
				point.z + direction.z * layout.plumeLength * 0.5,
			);
			plume.scale.set(
				layout.plumeLength,
				layout.coreRadius * 4.2,
				1,
			);

			core.name = `engine_core_${index + 1}`;
			plume.name = `engine_plume_${index + 1}`;
			plume.userData.engineBasePoint = { x: point.x, y: point.y, z: point.z };
			plume.userData.engineDirection = direction;
			core.renderOrder = 31;
			plume.renderOrder = 30;

			root.add(core, plume);
			cores.push(core);
			plumes.push(plume);
		}

		return { root, cores, plumes, role, layoutSource };
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
			const scaledLength = baseLength * plumeLengthScale;
			const basePoint =
				plume.userData.engineBasePoint as EnginePoint | undefined;
			const direction =
				plume.userData.engineDirection as EngineDirection | undefined;

			if (basePoint && direction) {
				plume.position.set(
					basePoint.x + direction.x * scaledLength * 0.5,
					basePoint.y + direction.y * scaledLength * 0.5,
					basePoint.z + direction.z * scaledLength * 0.5,
				);
			}

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
	return findNodesByKind(root, 'engine');
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
	points: EnginePoint[];
	coreRadius: number;
	plumeLength: number;
};

type EnginePoint = {
	x: number;
	y: number;
	z: number;
	direction?: EngineDirection;
};

type EngineDirection = {
	x: number;
	y: number;
	z: number;
};

type EngineLayoutSource = {
	id: 'fallback' | 'model-bounds' | 'nodes';
	priority: number;
};

type DesiredEngineLayout = {
	layout: EngineLayout;
	source: EngineLayoutSource;
};

const ENGINE_LAYOUT_SOURCES = {
	fallback: { id: 'fallback', priority: 1 },
	modelBounds: { id: 'model-bounds', priority: 2 },
	nodes: { id: 'nodes', priority: 3 },
} satisfies Record<string, EngineLayoutSource>;

function getFallbackEngineLayout(role: ShipRole): EngineLayout {
	switch (role) {
		case 'carrier':
			return {
				points: [
					{ x: -0.42, y: -0.08, z: 1.42, direction: DEFAULT_ENGINE_DIRECTION },
					{ x: 0.42, y: -0.08, z: 1.42, direction: DEFAULT_ENGINE_DIRECTION },
				],
				coreRadius: 0.075,
				plumeLength: 0.46,
			};
		case 'frigate':
			return {
				points: [
					{ x: -0.18, y: -0.03, z: 0.74, direction: DEFAULT_ENGINE_DIRECTION },
					{ x: 0.18, y: -0.03, z: 0.74, direction: DEFAULT_ENGINE_DIRECTION },
				],
				coreRadius: 0.04,
				plumeLength: 0.24,
			};
		case 'constructor':
			return {
				points: [
					{ x: -0.12, y: 0, z: 0.54, direction: DEFAULT_ENGINE_DIRECTION },
					{ x: 0.12, y: 0, z: 0.54, direction: DEFAULT_ENGINE_DIRECTION },
				],
				coreRadius: 0.038,
				plumeLength: 0.22,
			};
		case 'fighter':
			return {
				points: [{ x: 0, y: 0, z: 0.42, direction: DEFAULT_ENGINE_DIRECTION }],
				coreRadius: 0.032,
				plumeLength: 0.18,
			};
		case 'scout':
			return {
				points: [{ x: 0, y: 0, z: 0.38, direction: DEFAULT_ENGINE_DIRECTION }],
				coreRadius: 0.030,
				plumeLength: 0.16,
			};
	}
}

function worldBoxToLocalBox(
	worldBox: THREE.Box3,
	root: THREE.Object3D,
): THREE.Box3 {
	const corners = [
		new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
		new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
		new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
		new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
		new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
		new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
		new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
		new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
	].map((point) => root.worldToLocal(point));

	return new THREE.Box3().setFromPoints(corners);
}

function getEngineDirectionAwayFromCenter(
	localPosition: THREE.Vector3,
	localCenter: THREE.Vector3,
): EngineDirection {
	const dz = localPosition.z - localCenter.z;

	if (Math.abs(dz) > 0.0001) {
		return { x: 0, y: 0, z: Math.sign(dz) };
	}

	const direction = localPosition.clone().sub(localCenter);

	if (direction.lengthSq() <= 0.0001) {
		return { ...DEFAULT_ENGINE_DIRECTION };
	}

	direction.normalize();
	return {
		x: direction.x,
		y: direction.y,
		z: direction.z,
	};
}

function getEngineAnchorPosition(
	node: THREE.Object3D,
	shipRoot: THREE.Object3D,
	fallbackPosition: THREE.Vector3,
	direction: EngineDirection,
): THREE.Vector3 {
	const nodeBox = new THREE.Box3().setFromObject(node);

	if (nodeBox.isEmpty()) {
		return fallbackPosition;
	}

	const localBox = worldBoxToLocalBox(nodeBox, shipRoot);
	const center = new THREE.Vector3();
	localBox.getCenter(center);

	return new THREE.Vector3(
		getExtremeAlongDirection(localBox.min.x, localBox.max.x, center.x, direction.x),
		getExtremeAlongDirection(localBox.min.y, localBox.max.y, center.y, direction.y),
		getExtremeAlongDirection(localBox.min.z, localBox.max.z, center.z, direction.z),
	);
}

function getExtremeAlongDirection(
	min: number,
	max: number,
	center: number,
	direction: number,
): number {
	if (direction > 0.001) {
		return max;
	}

	if (direction < -0.001) {
		return min;
	}

	return center;
}

function normalizeEngineDirection(
	direction: EngineDirection | undefined,
): EngineDirection {
	const vector = new THREE.Vector3(
		direction?.x ?? DEFAULT_ENGINE_DIRECTION.x,
		direction?.y ?? DEFAULT_ENGINE_DIRECTION.y,
		direction?.z ?? DEFAULT_ENGINE_DIRECTION.z,
	);

	if (vector.lengthSq() <= 0.0001) {
		return { ...DEFAULT_ENGINE_DIRECTION };
	}

	vector.normalize();
	return { x: vector.x, y: vector.y, z: vector.z };
}

function disposeObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;

		if (mesh.geometry) {
			mesh.geometry.dispose();
		}

		const material = mesh.material;

		if (Array.isArray(material)) {
			for (const entry of material) {
				entry.dispose();
			}
		} else if (material) {
			material.dispose();
		}
	});
}

function hashString01(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}
