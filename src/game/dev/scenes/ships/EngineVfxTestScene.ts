import * as THREE from 'three';
import { createDebugPoint, disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { createInspectableShipModel, createTestShipDefinition } from '../../TestShipFactory';
import { EngineVfxSystem } from '../../../rendering/EngineVfxSystem';

export class EngineVfxTestScene implements FeatureTestScene {
	readonly id = 'ship-engine-vfx';
	readonly name = 'Engine VFX';
	readonly category = 'Ships' as const;
	readonly description = 'Production EngineVfxSystem driven by controllable ship velocity.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private readonly engineVfx = new EngineVfxSystem();
	private readonly systemMeshes = new Map<string, THREE.Object3D>();
	private readonly strategicMeshes = new Map<string, THREE.Object3D>();
	private ship = createTestShipDefinition(
		'engine-test-frigate',
		'frigate',
		'player',
		new THREE.Vector3(),
	);
	private speedFactor = 0.45;

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'EngineVfxTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 2.6, 7);
		context.controls.target.set(0, 0, 0);
		context.controls.update();

		const shipObject = createInspectableShipModel('frigate', 'player');
		this.root.add(shipObject);
		this.systemMeshes.set(this.ship.id, shipObject);

		for (const engine of this.findEngineNodes(shipObject)) {
			const marker = createDebugPoint(engine.name, 0x77ffb0, 0.045);
			engine.getWorldPosition(marker.position);
			this.root.add(marker);
		}

		context.report({
			status: this.findEngineNodes(shipObject).length > 0 ? 'pass' : 'warn',
			label: 'engine nodes',
			detail: `${this.findEngineNodes(shipObject).length}`,
		});
		this.createUi(context.uiRoot);
	}

	update(deltaSeconds: number): void {
		this.ship = {
			...this.ship,
			systemVelocity: {
				x: 0,
				y: 0,
				z: -this.ship.maxSpeed * this.speedFactor,
			},
		};
		this.engineVfx.update(
			[this.ship],
			this.systemMeshes,
			this.strategicMeshes,
			deltaSeconds,
			'system',
		);
	}

	dispose(): void {
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		this.speedFactor = 0.45;
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Speed ` +
			`<input data-speed type="range" min="0" max="1" step="0.01" value="${this.speedFactor}" style="width:150px;"></label>`;

		root.querySelector<HTMLInputElement>('[data-speed]')
			?.addEventListener('input', (event) => {
				this.speedFactor = Number((event.currentTarget as HTMLInputElement).value);
			});
	}

	private findEngineNodes(root: THREE.Object3D): THREE.Object3D[] {
		const nodes: THREE.Object3D[] = [];

		root.traverse((node) => {
			if (node.name.startsWith('engine_')) {
				nodes.push(node);
			}
		});

		return nodes;
	}
}
