import * as THREE from 'three';
import {
	findFirstNodeByKind,
	findNodesByKind,
} from '@conduit/web3d/assets';
import type { CombatWeaponKind } from '../model/GameWorld';

export type WeaponMountLayout = {
	yawTurrets: THREE.Object3D[];
	muzzles: THREE.Object3D[];
	launcherMuzzles: THREE.Object3D[];
};

export function discoverWeaponMountLayout(
	source: THREE.Object3D,
): WeaponMountLayout {
	return {
		yawTurrets: findNodesByKind(source, 'turretYaw'),
		muzzles: findNodesByKind(source, 'muzzle'),
		launcherMuzzles: findNodesByKind(source, 'launcherMuzzle'),
	};
}

export function weaponUsesYawTurret(
	weaponKind: CombatWeaponKind,
): boolean {
	return weaponKind === 'laser' || weaponKind === 'railgun';
}

export function aimYawTurretsAtWorldTarget(
	source: THREE.Object3D,
	targetWorld: THREE.Vector3,
	deltaSeconds?: number,
): void {
	const layout = discoverWeaponMountLayout(source);

	for (const turret of layout.yawTurrets) {
		if (!turret.parent) {
			continue;
		}

		const desiredYaw = getLocalYawToWorldTarget(
			turret,
			targetWorld,
		);
		const currentYaw = turret.rotation.y;

		if (deltaSeconds === undefined) {
			turret.rotation.y = desiredYaw;
			continue;
		}

		const delta = THREE.MathUtils.euclideanModulo(
			desiredYaw - currentYaw + Math.PI,
			Math.PI * 2,
		) - Math.PI;
		const step = Math.min(1, deltaSeconds * 5.5);

		turret.rotation.y = currentYaw + delta * step;
	}
}

export function findWeaponOriginNode(
	source: THREE.Object3D,
	weaponKind: CombatWeaponKind,
): THREE.Object3D | null {
	if (weaponKind === 'missile' || weaponKind === 'rocket') {
		return findFirstNodeByKind(source, 'launcherMuzzle');
	}

	return findFirstNodeByKind(source, 'muzzle');
}

export function getWeaponOriginWorldPosition(
	source: THREE.Object3D,
	weaponKind: CombatWeaponKind,
): THREE.Vector3 {
	const position = new THREE.Vector3();
	const node = findWeaponOriginNode(source, weaponKind);

	(node ?? source).getWorldPosition(position);
	return position;
}

function getLocalYawToWorldTarget(
	turret: THREE.Object3D,
	targetWorld: THREE.Vector3,
): number {
	const parent = turret.parent;

	if (!parent) {
		return turret.rotation.y;
	}

	const localTarget = parent.worldToLocal(targetWorld.clone());
	const dx = localTarget.x - turret.position.x;
	const dz = localTarget.z - turret.position.z;

	return Math.atan2(-dx, -dz);
}
