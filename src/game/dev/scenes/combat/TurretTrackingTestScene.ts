import * as THREE from 'three';
import {
	createDebugLine,
	createDebugPoint,
	disposeObject3D,
	setDebugLinePoints,
} from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { createInspectableShipModel, createTestShipDefinition } from '../../TestShipFactory';
import { CombatVfxSystem } from '../../../rendering/CombatVfxSystem';

type TargetMotion = 'static' | 'circle' | 'horizontal' | 'vertical';

export class TurretTrackingTestScene implements FeatureTestScene {
	readonly id = 'combat-turret-tracking';
	readonly name = 'Turret Tracking';
	readonly category = 'Combat' as const;
	readonly description = 'Production CombatVfxSystem tracks a moving target.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private readonly shipMeshes = new Map<string, THREE.Object3D>();
	private combatVfx: CombatVfxSystem | null = null;
	private elapsed = 0;
	private motion: TargetMotion = 'circle';
	private targetSpeed = 0.65;
	private readonly ship = createTestShipDefinition(
		'turret-source',
		'frigate',
		'player',
		new THREE.Vector3(0, 0, 0),
	);
	private readonly target = createTestShipDefinition(
		'turret-target',
		'fighter',
		'opponent',
		new THREE.Vector3(0, 0, -5),
	);
	private shipObject: THREE.Object3D | null = null;
	private targetObject: THREE.Object3D | null = null;
	private shipTargetLine = createDebugLine('ShipToTarget', 0x8fe7ff);
	private muzzleTargetLine = createDebugLine('MuzzleToTarget', 0xffd28f);

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'TurretTrackingTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 5, 10);
		context.controls.target.set(0, 0, 0);
		context.controls.update();

		this.shipObject = createInspectableShipModel('frigate', 'player');
		this.targetObject = createDebugPoint('TargetDummy', 0xff7f8a, 0.22);
		this.root.add(this.shipObject, this.targetObject, this.shipTargetLine, this.muzzleTargetLine);
		this.shipMeshes.set(this.ship.id, this.shipObject);
		this.shipMeshes.set(this.target.id, this.targetObject);
		this.combatVfx = new CombatVfxSystem({
			parent: this.root,
			getShipObject: (shipId) => this.shipMeshes.get(shipId) ?? null,
		});

		context.report({
			status: this.shipObject.getObjectByName('turret_yaw') ? 'pass' : 'fail',
			label: 'turret_yaw exists',
		});
		context.report({
			status: this.shipObject.getObjectByName('muzzle') ? 'pass' : 'warn',
			label: 'muzzle exists',
		});
		this.createUi(context.uiRoot);
	}

	update(deltaSeconds: number): void {
		this.elapsed += deltaSeconds * this.targetSpeed;
		this.updateTarget();

		this.combatVfx?.trackTargets(
			[this.ship, this.target],
			deltaSeconds,
		);
		this.combatVfx?.update(deltaSeconds);
		this.updateDebugLines();
	}

	dispose(): void {
		this.combatVfx?.dispose();
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		this.elapsed = 0;
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Target Motion ` +
			`<select data-motion>` +
			`<option value="circle">Circle</option>` +
			`<option value="horizontal">Horizontal</option>` +
			`<option value="vertical">Vertical</option>` +
			`<option value="static">Static</option>` +
			`</select></label>` +
			`<label style="display:block;margin:6px 0;">Target Speed ` +
			`<input data-speed type="range" min="0" max="2" step="0.05" value="${this.targetSpeed}" style="width:150px;"></label>`;

		root.querySelector<HTMLSelectElement>('[data-motion]')
			?.addEventListener('change', (event) => {
				this.motion = (event.currentTarget as HTMLSelectElement).value as TargetMotion;
			});

		root.querySelector<HTMLInputElement>('[data-speed]')
			?.addEventListener('input', (event) => {
				this.targetSpeed = Number((event.currentTarget as HTMLInputElement).value);
			});
	}

	private updateTarget(): void {
		const position = this.target.systemPosition;

		switch (this.motion) {
			case 'static':
				position.x = 0;
				position.y = 0;
				position.z = -5;
				break;
			case 'horizontal':
				position.x = Math.sin(this.elapsed) * 5;
				position.y = 0;
				position.z = -5;
				break;
			case 'vertical':
				position.x = 0;
				position.y = Math.sin(this.elapsed) * 2.5;
				position.z = -5;
				break;
			case 'circle':
				position.x = Math.cos(this.elapsed) * 5;
				position.y = Math.sin(this.elapsed * 0.7) * 1.2;
				position.z = Math.sin(this.elapsed) * 5;
				break;
		}

		this.targetObject?.position.set(position.x, position.y, position.z);
	}

	private updateDebugLines(): void {
		if (!this.shipObject || !this.targetObject) {
			return;
		}

		const source = new THREE.Vector3();
		const target = new THREE.Vector3();
		this.shipObject.getWorldPosition(source);
		this.targetObject.getWorldPosition(target);
		setDebugLinePoints(this.shipTargetLine, source, target);

		const muzzle = this.shipObject.getObjectByName('muzzle') ?? this.shipObject;
		const muzzlePosition = new THREE.Vector3();
		muzzle.getWorldPosition(muzzlePosition);
		setDebugLinePoints(this.muzzleTargetLine, muzzlePosition, target);
	}
}
