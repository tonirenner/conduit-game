import * as THREE from 'three';
import { createDummyTurret } from '../rendering/DummyAssetFactory';
import type { FactionId, ShipDefinition, ShipRole } from '../model/GameWorld';

export function createInspectableShipModel(
	role: ShipRole,
	factionId: FactionId = 'player',
): THREE.Group {
	const root = new THREE.Group();
	const model = createLabShipModel(role, factionId);

	root.name = `${role} test ship`;
	model.name = role === 'frigate' ? 'FrigateShipModel' : `${role} model`;
	root.add(model);
	addNodeMarkers(root, role);
	return root;
}

function createLabShipModel(
	role: ShipRole,
	factionId: FactionId,
): THREE.Group {
	const group = new THREE.Group();
	const dimensions = getShipDimensions(role);
	const hull = new THREE.Mesh(
		new THREE.BoxGeometry(
			dimensions.width,
			dimensions.height,
			dimensions.length,
		),
		createHullMaterial(factionId),
	);
	const bow = new THREE.Mesh(
		new THREE.BoxGeometry(
			dimensions.width * 0.62,
			dimensions.height * 0.72,
			dimensions.length * 0.16,
		),
		createBowMaterial(factionId),
	);

	hull.name = 'LabShipHull';
	bow.name = 'LabShipBow';
	bow.position.z = -dimensions.length * 0.58;
	group.add(hull, bow);

	if (role === 'carrier' || role === 'frigate') {
		const turret = createDummyTurret(factionId);
		turret.position.set(
			0,
			dimensions.height * 0.68,
			-dimensions.length * 0.08,
		);
		group.add(turret);
	}

	if (role === 'carrier') {
		for (const [index, x] of [-0.42, 0.42].entries()) {
			const launcher = createLauncherPod(factionId);
			launcher.name = `launcher_0${index + 1}`;
			launcher.position.set(
				x,
				dimensions.height * 0.42,
				-dimensions.length * 0.18,
			);
			group.add(launcher);
		}
	}

	return group;
}

function createLauncherPod(factionId: FactionId): THREE.Group {
	const pod = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(0.22, 0.12, 0.48),
		createLauncherMaterial(factionId),
	);
	const muzzle = new THREE.Object3D();

	body.name = 'LauncherPodBody';
	muzzle.name = 'launcher_muzzle';
	muzzle.position.set(0, 0, -0.30);
	pod.add(body, muzzle);
	return pod;
}

export function createTestShipDefinition(
	id: string,
	role: ShipRole,
	factionId: FactionId,
	position: THREE.Vector3,
): ShipDefinition {
	const hull = getHull(role);
	const maxSpeed = getMaxSpeed(role);

	return {
		id,
		name: id,
		role,
		factionId,
		nodeId: 'test-system',
		position: {
			x: position.x,
			y: position.y,
			z: position.z,
		},
		velocity: {
			x: 0,
			y: 0,
			z: 0,
		},
		systemPosition: {
			x: position.x,
			y: position.y,
			z: position.z,
		},
		systemVelocity: {
			x: 0,
			y: 0,
			z: 0,
		},
		hull,
		maxHull: hull,
		maxSpeed,
		strategicMaxSpeed: maxSpeed / 1000,
		turnRate: role === 'carrier' ? 1.35 : 2.8,
	};
}

function addNodeMarkers(root: THREE.Group, role: ShipRole): void {
	if (role === 'carrier' || role === 'frigate') {
		const turret = root.getObjectByName('turret_yaw');

		if (turret) {
			const alias = new THREE.Object3D();
			alias.name = 'turret_01_yaw';
			turret.add(alias);
		}

		const muzzle = root.getObjectByName('muzzle');

		if (muzzle) {
			const alias = new THREE.Object3D();
			alias.name = 'muzzle_01';
			muzzle.add(alias);
		}
	}

	for (const [index, x] of [-0.22, 0.22].entries()) {
		const engine = new THREE.Object3D();
		engine.name = `engine_0${index + 1}`;
		engine.position.set(x, -0.06, 1.28);
		root.add(engine);
	}
}

function getShipDimensions(role: ShipRole): {
	width: number;
	height: number;
	length: number;
} {
	switch (role) {
		case 'carrier':
			return {
				width: 1.5,
				height: 0.54,
				length: 4.6,
			};

		case 'frigate':
			return {
				width: 0.85,
				height: 0.31,
				length: 2.5,
			};

		case 'constructor':
			return {
				width: 0.58,
				height: 0.25,
				length: 1.7,
			};

		case 'fighter':
			return {
				width: 0.48,
				height: 0.18,
				length: 1.2,
			};

		case 'scout':
			return {
				width: 0.42,
				height: 0.16,
				length: 1.1,
			};
	}
}

function createHullMaterial(factionId: FactionId): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: factionId === 'player' ? 0x5d7782 : 0x8d5f58,
		emissive: factionId === 'player' ? 0x071a22 : 0x260b08,
		emissiveIntensity: 0.10,
		roughness: 0.58,
		metalness: 0.48,
	});
}

function createBowMaterial(factionId: FactionId): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: factionId === 'player' ? 0x78929d : 0xa87870,
		emissive: 0x000000,
		emissiveIntensity: 0,
		roughness: 0.62,
		metalness: 0.38,
	});
}

function createLauncherMaterial(factionId: FactionId): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: factionId === 'player' ? 0x4f626b : 0x70514e,
		emissive: factionId === 'player' ? 0x061018 : 0x140806,
		emissiveIntensity: 0.05,
		roughness: 0.58,
		metalness: 0.24,
	});
}

function getHull(role: ShipRole): number {
	switch (role) {
		case 'carrier':
			return 260;
		case 'frigate':
			return 160;
		case 'constructor':
			return 95;
		case 'fighter':
			return 90;
		case 'scout':
			return 70;
	}
}

function getMaxSpeed(role: ShipRole): number {
	switch (role) {
		case 'carrier':
			return 3200;
		case 'frigate':
			return 4600;
		case 'constructor':
			return 5400;
		case 'fighter':
			return 7400;
		case 'scout':
			return 8200;
	}
}
