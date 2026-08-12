import * as THREE from 'three';
import {
	createDebugLine,
	createDebugPoint,
	disposeObject3D,
	setDebugLinePoints,
} from '@conduit/web3d/debug';
import type { CombatEvent, CombatWeaponKind } from '../../../model/GameWorld';
import { CombatVfxSystem } from '../../../rendering/CombatVfxSystem';
import {
	discoverWeaponMountLayout,
	findWeaponOriginNode,
	weaponUsesYawTurret,
	type WeaponMountLayout,
} from '../../../rendering/WeaponMountLayout';
import { createInspectableShipModel, createTestShipDefinition } from '../../TestShipFactory';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';

const WEAPON_KINDS: CombatWeaponKind[] = [
	'laser',
	'railgun',
	'missile',
	'rocket',
];

type TargetMotion = 'static' | 'circle' | 'horizontal' | 'vertical';

export class WeaponFireTestScene implements FeatureTestScene {
	readonly id = 'combat-weapon-fire';
	readonly name = 'Weapon Fire';
	readonly category = 'Combat' as const;
	readonly description = 'Fire each weapon kind through production CombatVfxSystem from discovered mount nodes.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private readonly shipMeshes = new Map<string, THREE.Object3D>();
	private readonly originTargetLine = createDebugLine('WeaponOriginToTarget', 0xffd28f);
	private readonly originMarker = createDebugPoint('WeaponOrigin', 0xffd28f, 0.055);
	private readonly targetMarker = createDebugPoint('WeaponTarget', 0xff7f8a, 0.22);
	private combatVfx: CombatVfxSystem | null = null;
	private sourceObject: THREE.Object3D | null = null;
	private mountLayout: WeaponMountLayout | null = null;
	private selectedWeapon: CombatWeaponKind = 'railgun';
	private autoFire = true;
	private targetMotion: TargetMotion = 'circle';
	private targetSpeed = 0.55;
	private elapsed = 0;
	private fireElapsed = 0;
	private fireCounter = 0;
	private readonly sourceShip = createTestShipDefinition(
		'weapon-fire-source',
		'carrier',
		'player',
		new THREE.Vector3(0, 0, 0),
	);
	private readonly targetShip = createTestShipDefinition(
		'weapon-fire-target',
		'fighter',
		'opponent',
		new THREE.Vector3(0, 0, -5),
	);

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'WeaponFireTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 4.6, 9);
		context.controls.target.set(0, 0, 0);
		context.controls.update();

		this.sourceObject = createInspectableShipModel('carrier', 'player');
		this.targetMarker.position.set(0, 0, -5);
		this.targetShip.systemPosition.z = -5;
		this.root.add(
			this.sourceObject,
			this.targetMarker,
			this.originMarker,
			this.originTargetLine,
		);

		this.mountLayout = discoverWeaponMountLayout(this.sourceObject);
		this.shipMeshes.set(this.sourceShip.id, this.sourceObject);
		this.shipMeshes.set(this.targetShip.id, this.targetMarker);
		this.combatVfx = new CombatVfxSystem({
			parent: this.root,
			getShipObject: (shipId) => this.shipMeshes.get(shipId) ?? null,
		});

		this.reportLayout(context);
		this.createUi(context.uiRoot);
		this.updateDebug();
	}

	update(deltaSeconds: number): void {
		this.elapsed += deltaSeconds * this.targetSpeed;
		this.updateTarget();
		this.combatVfx?.trackTargets(
			[this.sourceShip, this.targetShip],
			deltaSeconds,
		);

		if (this.autoFire) {
			this.fireElapsed += deltaSeconds;

			if (this.fireElapsed >= 0.62) {
				this.fireElapsed = 0;
				this.fire();
			}
		}

		this.combatVfx?.update(deltaSeconds);
		this.updateDebug();
	}

	dispose(): void {
		this.combatVfx?.dispose();
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
		this.sourceObject = null;
		this.mountLayout = null;
	}

	reset(): void {
		this.autoFire = true;
		this.targetMotion = 'circle';
		this.targetSpeed = 0.55;
		this.elapsed = 0;
		this.fireElapsed = 0;
		this.fireCounter = 0;
		this.combatVfx?.dispose();
		const autoFireInput = this.context?.uiRoot
			.querySelector<HTMLInputElement>('[data-auto-fire]');

		if (autoFireInput) {
			autoFireInput.checked = true;
		}

		const motionInput = this.context?.uiRoot
			.querySelector<HTMLSelectElement>('[data-target-motion]');
		const speedInput = this.context?.uiRoot
			.querySelector<HTMLInputElement>('[data-target-speed]');

		if (motionInput) {
			motionInput.value = this.targetMotion;
		}

		if (speedInput) {
			speedInput.value = `${this.targetSpeed}`;
		}

		this.updateDebug();
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Weapon ` +
			`<select data-weapon>${WEAPON_KINDS.map((kind) => (
				`<option value="${kind}"${kind === this.selectedWeapon ? ' selected' : ''}>${kind}</option>`
			)).join('')}</select></label>` +
			`<button data-fire-single style="margin:4px;padding:6px 8px;">Single Shot</button>` +
			`<label style="display:block;margin:6px 0;">` +
			`<input data-auto-fire type="checkbox" checked> Auto Fire</label>` +
			`<label style="display:block;margin:6px 0;">Target Motion ` +
			`<select data-target-motion>` +
			`<option value="circle">Circle</option>` +
			`<option value="horizontal">Horizontal</option>` +
			`<option value="vertical">Vertical</option>` +
			`<option value="static">Static</option>` +
			`</select></label>` +
			`<label style="display:block;margin:6px 0;">Target Speed ` +
			`<input data-target-speed type="range" min="0" max="2" step="0.05" value="${this.targetSpeed}" style="width:150px;"></label>` +
			`<div data-weapon-info style="margin-top:8px;opacity:.78;line-height:1.35"></div>`;

		root.querySelector<HTMLSelectElement>('[data-weapon]')
			?.addEventListener('change', (event) => {
				this.selectedWeapon =
					(event.currentTarget as HTMLSelectElement).value as CombatWeaponKind;
				this.reportSelectedWeapon();
				this.updateDebug();
			});

		root.querySelector<HTMLButtonElement>('[data-fire-single]')
			?.addEventListener('click', () => this.fire());

		root.querySelector<HTMLInputElement>('[data-auto-fire]')
			?.addEventListener('change', (event) => {
				this.autoFire = (event.currentTarget as HTMLInputElement).checked;
				this.fireElapsed = 0;
			});

		root.querySelector<HTMLSelectElement>('[data-target-motion]')
			?.addEventListener('change', (event) => {
				this.targetMotion =
					(event.currentTarget as HTMLSelectElement).value as TargetMotion;
			});

		root.querySelector<HTMLInputElement>('[data-target-speed]')
			?.addEventListener('input', (event) => {
				this.targetSpeed = Number((event.currentTarget as HTMLInputElement).value);
			});
	}

	private updateTarget(): void {
		const position = this.targetShip.systemPosition;

		switch (this.targetMotion) {
			case 'static':
				position.x = 0;
				position.y = 0;
				position.z = -5;
				break;
			case 'horizontal':
				position.x = Math.sin(this.elapsed) * 4.5;
				position.y = 0.4;
				position.z = -5;
				break;
			case 'vertical':
				position.x = 0;
				position.y = 0.5 + Math.sin(this.elapsed) * 2.2;
				position.z = -5;
				break;
			case 'circle':
				position.x = Math.cos(this.elapsed) * 4.5;
				position.y = 0.45 + Math.sin(this.elapsed * 0.7) * 1.1;
				position.z = -5 + Math.sin(this.elapsed) * 1.8;
				break;
		}

		this.targetMarker.position.set(position.x, position.y, position.z);
	}

	private fire(): void {
		const event: CombatEvent = {
			id: `weapon-fire-${this.fireCounter++}`,
			type: 'turret_fire',
			sourceShipId: this.sourceShip.id,
			targetShipId: this.targetShip.id,
			weaponKind: this.selectedWeapon,
			damage: 0,
		};

		this.combatVfx?.consume([event]);
		this.updateDebug();
	}

	private updateDebug(): void {
		if (!this.sourceObject) {
			return;
		}

		const originNode =
			findWeaponOriginNode(this.sourceObject, this.selectedWeapon) ??
			this.sourceObject;
		const origin = new THREE.Vector3();
		const target = new THREE.Vector3();

		originNode.getWorldPosition(origin);
		this.targetMarker.getWorldPosition(target);
		this.originMarker.position.copy(origin);
		setDebugLinePoints(this.originTargetLine, origin, target);

		const info = this.context?.uiRoot.querySelector<HTMLElement>('[data-weapon-info]');

		if (info) {
			info.innerHTML =
				`Weapon: ${this.selectedWeapon}<br>` +
				`Yaw: ${weaponUsesYawTurret(this.selectedWeapon) ? 'yes' : 'no'}<br>` +
				`Origin: ${originNode.name || 'ship origin'}<br>` +
				`Shots: ${this.fireCounter}`;
		}
	}

	private reportLayout(context: FeatureTestContext): void {
		const layout = this.mountLayout;

		if (!layout) {
			return;
		}

		context.report({
			status: layout.yawTurrets.length > 0 ? 'pass' : 'warn',
			label: 'yaw turret nodes',
			detail: `${layout.yawTurrets.length}`,
		});
		context.report({
			status: layout.muzzles.length > 0 ? 'pass' : 'warn',
			label: 'weapon muzzle nodes',
			detail: `${layout.muzzles.length}`,
		});
		context.report({
			status: layout.launcherMuzzles.length > 0 ? 'pass' : 'warn',
			label: 'launcher muzzle nodes',
			detail: `${layout.launcherMuzzles.length}`,
		});
		this.reportSelectedWeapon();
	}

	private reportSelectedWeapon(): void {
		if (!this.context || !this.sourceObject) {
			return;
		}

		const origin = findWeaponOriginNode(this.sourceObject, this.selectedWeapon);
		const usesYaw = weaponUsesYawTurret(this.selectedWeapon);

		this.context.report({
			status: origin ? 'pass' : 'warn',
			label: `${this.selectedWeapon} origin`,
			detail: `${origin?.name ?? 'ship origin'} | yaw ${usesYaw ? 'yes' : 'no'}`,
		});
	}
}
