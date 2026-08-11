import * as THREE from 'three';

export type NamedNodeKind =
	| 'engine'
	| 'turretYaw'
	| 'muzzle'
	| 'launcherMuzzle'
	| 'spawn'
	| 'dock'
	| 'rally';

export type NamedNodeMatch = {
	kind: NamedNodeKind;
	node: THREE.Object3D;
	name: string;
};

export function findNamedNodes(
	root: THREE.Object3D,
	kinds: readonly NamedNodeKind[] = [
		'engine',
		'turretYaw',
		'muzzle',
		'launcherMuzzle',
		'spawn',
		'dock',
		'rally',
	],
): NamedNodeMatch[] {
	const enabledKinds = new Set(kinds);
	const matches: NamedNodeMatch[] = [];

	root.traverse((node) => {
		for (const kind of enabledKinds) {
			if (matchesNamedNodeKind(node, kind)) {
				matches.push({
					kind,
					node,
					name: node.name,
				});
			}
		}
	});

	return matches;
}

export function findNodesByKind(
	root: THREE.Object3D,
	kind: NamedNodeKind,
): THREE.Object3D[] {
	return findNamedNodes(root, [kind]).map((match) => match.node);
}

export function findFirstNodeByKind(
	root: THREE.Object3D,
	kind: NamedNodeKind,
): THREE.Object3D | null {
	return findNodesByKind(root, kind)[0] ?? null;
}

export function matchesNamedNodeKind(
	node: THREE.Object3D,
	kind: NamedNodeKind,
): boolean {
	const name = node.name.toLowerCase();

	switch (kind) {
		case 'engine':
			return isEngineNodeName(name);
		case 'turretYaw':
			return isTurretYawNodeName(name);
		case 'muzzle':
			return isMuzzleNodeName(name);
		case 'launcherMuzzle':
			return isLauncherMuzzleNodeName(name);
		case 'spawn':
			return /^spawn(?:_\d+)?$/.test(name);
		case 'dock':
			return /^dock(?:_\d+)?$/.test(name);
		case 'rally':
			return name === 'rally_origin' || /^rally(?:_\d+)?$/.test(name);
	}
}

export function isEngineNodeName(name: string): boolean {
	if (
		name === 'enginevfx' ||
		name.startsWith('engine_core_') ||
		name.startsWith('engine_plume_')
	) {
		return false;
	}

	return (
		/^engine_\d+$/.test(name) ||
		/^engine_main_\d+$/.test(name) ||
		/^engine[-_][-\d.]+$/.test(name)
	);
}

export function isTurretYawNodeName(name: string): boolean {
	return name === 'turret_yaw' || /^turret_\d+_yaw$/.test(name);
}

export function isMuzzleNodeName(name: string): boolean {
	return (
		name === 'muzzle' ||
		/^muzzle_\d+$/.test(name) ||
		/^turret_\d+_muzzle(?:_(?:left|right))?$/.test(name)
	);
}

export function isLauncherMuzzleNodeName(name: string): boolean {
	return (
		name === 'launcher_muzzle' ||
		name === 'rocket_muzzle' ||
		/^launcher_\d+_muzzle$/.test(name) ||
		/^rocket_muzzle_\d+$/.test(name) ||
		/^missile_muzzle_\d+$/.test(name) ||
		/^rocket_launcher_\d+$/.test(name)
	);
}
