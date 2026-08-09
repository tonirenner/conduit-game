import * as THREE from 'three';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { disposeObject3D } from '../../DebugPrimitives';
import { Planet } from '../../../../planet/Planet';
import { generatePlanetDefinition } from '../../../../planet/generation/PlanetGenerator';
import { createPlanetRenderProfile } from '../../../../planet/rendering/PlanetRenderProfile';
import type { PlanetClass } from '../../../../planet/model/PlanetDefinition';

const PLANET_CLASSES: PlanetClass[] = [
	'barren',
	'rocky',
	'terrestrial',
	'ocean',
	'desert',
	'ice',
	'lava',
	'toxic',
	'carbon',
	'metal_rich',
	'gas_giant',
	'ice_giant',
];

export class PlanetLodTestScene implements FeatureTestScene {
	readonly id = 'planet-lod';
	readonly name = 'Planet LOD';
	readonly category = 'Planets' as const;
	readonly description = 'Production Planet renderer with LOD stats.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private planet: Planet | null = null;
	private stats: HTMLElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'ocean';

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'PlanetLodTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 3.2, 9.5);
		context.controls.target.set(0, 0, 0);
		context.controls.enablePan = false;
		context.controls.update();
		this.createUi(context.uiRoot);
		this.createPlanet();
	}

	update(deltaSeconds: number): void {
		if (!this.context || !this.planet) {
			return;
		}

		this.planet.update(this.context.camera.position, deltaSeconds);
		this.planet.setRenderQuality('idle');
		this.updateStats();
	}

	dispose(): void {
		this.planet?.dispose();
		this.planet = null;
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		this.createPlanet();
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Class ` +
			`<select data-planet-class>${PLANET_CLASSES.map((planetClass) => (
				`<option value="${planetClass}"${planetClass === this.planetClass ? ' selected' : ''}>${formatPlanetClass(planetClass)}</option>`
			)).join('')}</select></label>` +
			`<label style="display:block;margin:6px 0;">Seed ` +
			`<input data-seed type="number" value="${this.seed}" style="width:110px;"></label>` +
			`<button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button>` +
			`<div data-planet-stats style="margin-top:8px;opacity:.78"></div>`;
		this.stats = root.querySelector<HTMLElement>('[data-planet-stats]');

		root.querySelector<HTMLButtonElement>('[data-apply-planet]')
			?.addEventListener('click', () => {
				const input = root.querySelector<HTMLInputElement>('[data-seed]');
				const select = root.querySelector<HTMLSelectElement>('[data-planet-class]');
				const nextSeed = Number(input?.value ?? this.seed);

				this.seed = Number.isFinite(nextSeed) ? Math.max(1, Math.floor(nextSeed)) : this.seed;
				this.planetClass = isPlanetClass(select?.value)
					? select.value
					: this.planetClass;
				this.createPlanet();
			});
	}

	private createPlanet(): void {
		if (!this.context) {
			return;
		}

		this.planet?.dispose();
		this.planet = null;
		this.root.clear();
		this.context.clearReport();

		const definition = generatePlanetDefinition(this.seed, {
			name: `LOD ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});
		const profile = createPlanetRenderProfile(definition);
		this.planet = new Planet(
			3,
			this.context.rendererMode,
			null,
			{},
			definition,
			profile,
		);
		this.root.add(this.planet.group);
		this.context.report({
			status: 'pass',
			label: 'planet created',
			detail: `${definition.class} / seed ${definition.seed}`,
		});
	}

	private updateStats(): void {
		if (!this.planet || !this.context || !this.stats) {
			return;
		}

		const terrain = this.planet.getTerrainStats();
		const distance = this.context.camera.position.length();

		this.stats.innerHTML =
			`class: ${this.planetClass}<br>` +
			`distance: ${distance.toFixed(2)}<br>` +
			`patches: ${terrain.visibleMeshes}/${terrain.totalPatches}<br>` +
			`max lod: ${terrain.maxLevel}<br>` +
			`splits: ${terrain.balance.splits}<br>` +
			`violations: ${terrain.balance.violations}`;
	}
}

function isPlanetClass(value: string | undefined): value is PlanetClass {
	return PLANET_CLASSES.includes(value as PlanetClass);
}

function formatPlanetClass(planetClass: PlanetClass): string {
	return planetClass
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
