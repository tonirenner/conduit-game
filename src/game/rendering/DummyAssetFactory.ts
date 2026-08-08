import * as THREE from 'three';
import type {
	FactionId,
	OrbitalStationType,
	ShipRole,
} from '../model/GameWorld';

export function createDummyStationModel(
	type: OrbitalStationType,
	factionId: FactionId = 'player',
): THREE.Group {
	switch (type) {
		case 'shipyard_large':
			return createLargeShipyard(factionId);

		case 'refinery':
			return createRefinery(factionId);

		case 'research':
			return createResearchStation(factionId);

		case 'headquarters':
			return createHeadquarters(factionId);

		case 'shipyard':
		case 'shipyard_small':
			return createSmallShipyard(factionId);
	}
}

export function createDummyShipModel(
	role: ShipRole,
	factionId: FactionId = 'player',
): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);

	const length =
		role === 'carrier'
			? 4.6
			: role === 'frigate'
				? 2.5
				: role === 'constructor'
					? 1.7
					: 1.2;

	const width =
		role === 'carrier'
			? 1.5
			: role === 'frigate'
				? 0.85
				: 0.48;

	const hull = new THREE.Mesh(
		new THREE.BoxGeometry(width, width * 0.36, length),
		material,
	);

	const nose = new THREE.Mesh(
		new THREE.ConeGeometry(width * 0.52, length * 0.28, 4),
		material.clone(),
	);

	nose.rotation.x = Math.PI * 0.5;
	nose.position.z = -length * 0.62;

	group.add(hull, nose);

	if (role === 'carrier' || role === 'frigate') {
		const turret = createDummyTurret(factionId);

		turret.position.set(0, width * 0.28, -length * 0.1);
		group.add(turret);
	}

	group.name = `Dummy ${role}`;
	return group;
}

export function createDummyTurret(
	factionId: FactionId = 'player',
): THREE.Group {
	const yaw = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.22, 0.27, 0.12, 10),
		hullMaterial(factionId),
	);
	const barrel = new THREE.Mesh(
		new THREE.BoxGeometry(0.10, 0.10, 0.62),
		hullMaterial(factionId),
	);
	const muzzle = new THREE.Object3D();

	yaw.name = 'turret_yaw';
	base.position.y = 0.06;
	barrel.position.set(0, 0.13, -0.27);
	muzzle.name = 'muzzle';
	muzzle.position.set(0, 0.13, -0.62);

	yaw.add(base, barrel, muzzle);
	return yaw;
}

export function makePlacementGhost(
	object: THREE.Object3D,
): THREE.Object3D {
	object.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) {
			return;
		}

		const source = Array.isArray(child.material)
			? child.material[0]
			: child.material;

		const color =
			source && 'color' in source && source.color instanceof THREE.Color
				? source.color.clone()
				: new THREE.Color(0x7fd9ff);

		child.material = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.32,
			depthWrite: false,
			depthTest: true,
			wireframe: false,
		});
	});

	return object;
}

export function setPlacementGhostValidity(
	object: THREE.Object3D,
	valid: boolean,
): void {
	const color = new THREE.Color(valid ? 0x61ff9b : 0xff5f6d);

	object.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) {
			return;
		}

		const materials = Array.isArray(child.material)
			? child.material
			: [child.material];

		for (const material of materials) {
			if ('color' in material && material.color instanceof THREE.Color) {
				material.color.copy(color);
			}
		}
	});
}

function createSmallShipyard(factionId: FactionId): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);
	const spine = new THREE.Mesh(
		new THREE.BoxGeometry(3.4, 0.48, 0.62),
		material,
	);
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(1.15, 0.10, 10, 36),
		metalMaterial(),
	);

	ring.rotation.y = Math.PI * 0.5;
	group.add(spine, ring);
	group.name = 'Dummy Small Shipyard';
	return group;
}

function createLargeShipyard(factionId: FactionId): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);

	const spine = new THREE.Mesh(
		new THREE.BoxGeometry(6.2, 0.72, 0.92),
		material,
	);
	group.add(spine);

	for (const side of [-1, 1]) {
		const arm = new THREE.Mesh(
			new THREE.BoxGeometry(4.6, 0.34, 0.42),
			material.clone(),
		);
		arm.position.set(0, side * 1.25, 0);
		group.add(arm);
	}

	for (const x of [-2.4, 0, 2.4]) {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(1.55, 0.11, 10, 40),
			metalMaterial(),
		);
		ring.rotation.y = Math.PI * 0.5;
		ring.position.x = x;
		group.add(ring);
	}

	group.name = 'Dummy Large Shipyard';
	return group;
}

function createRefinery(factionId: FactionId): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);
	const core = new THREE.Mesh(
		new THREE.CylinderGeometry(0.65, 0.82, 2.8, 12),
		material,
	);
	core.rotation.z = Math.PI * 0.5;
	group.add(core);

	for (const y of [-0.9, 0.9]) {
		for (const z of [-0.75, 0.75]) {
			const tank = new THREE.Mesh(
				new THREE.CylinderGeometry(0.34, 0.34, 1.8, 12),
				metalMaterial(),
			);
			tank.rotation.z = Math.PI * 0.5;
			tank.position.set(0.25, y, z);
			group.add(tank);
		}
	}

	group.name = 'Dummy Refinery';
	return group;
}

function createResearchStation(factionId: FactionId): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);

	const core = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.72, 1),
		material,
	);
	const ringA = new THREE.Mesh(
		new THREE.TorusGeometry(1.45, 0.07, 8, 44),
		metalMaterial(),
	);
	const ringB = ringA.clone();

	ringA.rotation.x = Math.PI * 0.5;
	ringB.rotation.z = Math.PI * 0.5;

	const mast = new THREE.Mesh(
		new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8),
		material.clone(),
	);

	group.add(core, ringA, ringB, mast);
	group.name = 'Dummy Research Station';
	return group;
}

function createHeadquarters(factionId: FactionId): THREE.Group {
	const group = new THREE.Group();
	const material = hullMaterial(factionId);
	const core = new THREE.Mesh(
		new THREE.OctahedronGeometry(1.2, 1),
		material,
	);
	group.add(core);

	for (let index = 0; index < 4; index++) {
		const angle = index * Math.PI * 0.5;
		const arm = new THREE.Mesh(
			new THREE.BoxGeometry(2.7, 0.28, 0.42),
			material.clone(),
		);
		arm.rotation.y = angle;
		arm.position.set(
			Math.cos(angle) * 1.5,
			0,
			Math.sin(angle) * 1.5,
		);
		group.add(arm);
	}

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(2.5, 0.08, 8, 48),
		metalMaterial(),
	);
	ring.rotation.x = Math.PI * 0.5;
	group.add(ring);

	group.name = 'Dummy Headquarters';
	return group;
}

function hullMaterial(factionId: FactionId): THREE.MeshStandardMaterial {
	const player = factionId === 'player';

	return new THREE.MeshStandardMaterial({
		color: player ? 0x668a98 : 0x9a655d,
		emissive: player ? 0x0c2631 : 0x310f0b,
		emissiveIntensity: 0.22,
		roughness: 0.48,
		metalness: 0.62,
	});
}

function metalMaterial(): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: 0x8a949b,
		roughness: 0.42,
		metalness: 0.72,
	});
}
