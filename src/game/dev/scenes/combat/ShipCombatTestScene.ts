import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { createInspectableShipModel, createTestShipDefinition } from '../../TestShipFactory';
import { CombatVfxSystem } from '../../../rendering/CombatVfxSystem';
import { updateFleetSimulation } from '../../../simulation/FleetSimulation';
import type { GameWorld } from '../../../model/GameWorld';

export class ShipCombatTestScene implements FeatureTestScene {
	readonly id = 'combat-ship-vs-ship';
	readonly name = 'Ship vs Ship Combat';
	readonly category = 'Combat' as const;
	readonly description = 'Isolated GameWorld running production FleetSimulation combat.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private readonly shipMeshes = new Map<string, THREE.Object3D>();
	private combatVfx: CombatVfxSystem | null = null;
	private world = this.createWorld();

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'ShipCombatTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 5.5, 12);
		context.controls.target.set(0, 0, 0);
		context.controls.update();
		this.combatVfx = new CombatVfxSystem({
			parent: this.root,
			getShipObject: (shipId) => this.shipMeshes.get(shipId) ?? null,
		});
		this.createUi(context.uiRoot);
		this.reset();
	}

	update(deltaSeconds: number): void {
		this.world = updateFleetSimulation(this.world, deltaSeconds);
		this.syncMeshes();
		this.combatVfx?.trackTargets(this.world.ships, deltaSeconds);
		this.combatVfx?.consume(this.world.combatEvents ?? []);
		this.combatVfx?.update(deltaSeconds);
	}

	dispose(): void {
		this.combatVfx?.dispose();
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		this.world = this.createWorld();
		disposeObject3D(this.root);
		this.root.clear();
		this.shipMeshes.clear();

		for (const ship of this.world.ships) {
			const object = createInspectableShipModel(ship.role, ship.factionId);
			object.position.set(
				ship.systemPosition.x / 1000,
				ship.systemPosition.y / 1000,
				ship.systemPosition.z / 1000,
			);
			this.root.add(object);
			this.shipMeshes.set(ship.id, object);
		}

		this.context?.clearReport();
		this.context?.report({
			status: 'pass',
			label: 'test world created',
			detail: `${this.world.ships.length} ships`,
		});
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<button data-reset-fight style="margin:4px;padding:6px 8px;">Reset Fight</button>` +
			`<div data-hull style="margin-top:8px;opacity:.78"></div>`;

		root.querySelector<HTMLButtonElement>('[data-reset-fight]')
			?.addEventListener('click', () => this.reset());
	}

	private syncMeshes(): void {
		for (const ship of this.world.ships) {
			const object = this.shipMeshes.get(ship.id);

			if (!object) {
				continue;
			}

			object.position.set(
				ship.systemPosition.x / 1000,
				ship.systemPosition.y / 1000,
				ship.systemPosition.z / 1000,
			);
		}

		const hull = this.context?.uiRoot.querySelector<HTMLElement>('[data-hull]');

		if (hull) {
			hull.innerHTML = this.world.ships.map((ship) => (
				`${ship.name}: ${Math.ceil(ship.hull)}/${ship.maxHull}`
			)).join('<br>');
		}
	}

	private createWorld(): GameWorld {
		const player = createTestShipDefinition(
			'combat-player-carrier',
			'carrier',
			'player',
			new THREE.Vector3(-4200, 0, 0),
		);
		const opponent = createTestShipDefinition(
			'combat-opponent-frigate',
			'frigate',
			'opponent',
			new THREE.Vector3(4200, 0, 0),
		);

		return {
			seed: 2001,
			nodes: [],
			lanes: [],
			ships: [player, opponent],
			fleets: [
				{
					id: 'combat-player-fleet',
					name: 'Player Test Fleet',
					factionId: 'player',
					nodeId: 'test-system',
					shipIds: [player.id],
					order: {
						type: 'attack_fleet',
						targetFleetId: 'combat-opponent-fleet',
					},
				},
				{
					id: 'combat-opponent-fleet',
					name: 'Opponent Test Fleet',
					factionId: 'opponent',
					nodeId: 'test-system',
					shipIds: [opponent.id],
					order: {
						type: 'attack_fleet',
						targetFleetId: 'combat-player-fleet',
					},
				},
			],
			stations: [],
			selectedFleetId: 'combat-player-fleet',
			combatEvents: [],
			shipOrderOverrides: {},
		};
	}
}
