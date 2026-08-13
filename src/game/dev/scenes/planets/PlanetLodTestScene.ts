import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { generatePlanetDefinition } from '@conduit/planet/generation';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import {
	Planet,
	createPlanetRenderProfile,
	type PlanetRenderProfile,
} from '@conduit/planet/rendering';
import {
	PlanetSurfaceViewRuntime,
	getPlanetRadiusMeters,
	type PlanetSurfaceViewUpdate,
} from '@conduit/planet/near-view';

const LAB_PLANET_RADIUS = 3;
const SURFACE_RUNTIME_CREATE_METERS = 70_000;
const SURFACE_RUNTIME_RELEASE_METERS = 90_000;
const CUBE_SPHERE_MIN_DISTANCE = LAB_PLANET_RADIUS * 1.12;

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
	readonly description = 'Seamless orbit-to-surface planet renderer test.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private planet: Planet | null = null;
	private definition: PlanetDefinition | null = null;
	private profile: PlanetRenderProfile | null = null;
	private surfaceRuntime: PlanetSurfaceViewRuntime | null = null;
	private surfaceUpdate: PlanetSurfaceViewUpdate | null = null;
	private stats: HTMLElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'desert';

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'PlanetLodTestScene';
		context.scene.add(this.root);

		context.camera.position.set(0, 3.2, 9.5);
		context.camera.near = 0.00001;
		context.camera.far = 2_000;
		context.camera.updateProjectionMatrix();

		context.controls.target.set(0, 0, 0);
		context.controls.enablePan = false;
		context.controls.minDistance = LAB_PLANET_RADIUS + 0.00001;
		context.controls.maxDistance = 80;
		context.controls.zoomSpeed = 0.65;
		context.controls.update();

		this.createUi(context.uiRoot);
		this.createPlanet();
	}

	update(deltaSeconds: number): void {
		if (!this.context || !this.planet || !this.definition) return;

		const cameraPosition = this.context.camera.position;
		const physicalRadiusMeters = getPlanetRadiusMeters(this.definition);
		const approximateAltitudeMeters = Math.max(
			0,
			(cameraPosition.length() / LAB_PLANET_RADIUS - 1) * physicalRadiusMeters,
		);

		if (
			this.isLandableSurfaceClass(this.definition.class) &&
			!this.surfaceRuntime &&
			approximateAltitudeMeters < SURFACE_RUNTIME_CREATE_METERS
		) {
			this.surfaceRuntime = new PlanetSurfaceViewRuntime(
				this.definition,
				LAB_PLANET_RADIUS,
				cameraPosition,
			);
			this.root.add(this.surfaceRuntime.group);
		}

		if (
			this.surfaceRuntime &&
			approximateAltitudeMeters > SURFACE_RUNTIME_RELEASE_METERS
		) {
			this.root.remove(this.surfaceRuntime.group);
			this.surfaceRuntime.dispose();
			this.surfaceRuntime = null;
			this.surfaceUpdate = null;
		}

		this.surfaceUpdate = this.surfaceRuntime?.update(cameraPosition) ?? null;

		const lodCamera = cameraPosition.clone();
		if (lodCamera.length() < CUBE_SPHERE_MIN_DISTANCE) {
			lodCamera.setLength(CUBE_SPHERE_MIN_DISTANCE);
		}

		this.planet.group.visible =
			!this.surfaceUpdate || this.surfaceUpdate.transition.planetVisible;
		this.planet.update(lodCamera, deltaSeconds);
		this.planet.setRenderQuality('idle');

		this.updateStats(approximateAltitudeMeters);
	}

	dispose(): void {
		if (this.surfaceRuntime) {
			this.root.remove(this.surfaceRuntime.group);
			this.surfaceRuntime.dispose();
			this.surfaceRuntime = null;
		}

		this.planet?.dispose();
		this.planet = null;
		this.definition = null;
		this.profile = null;
		this.surfaceUpdate = null;
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
			`<div style="margin-top:8px;opacity:.75;line-height:1.45">` +
			`Mouse/scroll as before. Keep zooming toward the planet: orbit geometry is capped and local meter terrain takes over automatically.` +
			`</div>` +
			`<div data-planet-stats style="margin-top:10px;line-height:1.5"></div>`;

		this.stats = root.querySelector<HTMLElement>('[data-planet-stats]');

		root.querySelector<HTMLButtonElement>('[data-apply-planet]')
			?.addEventListener('click', () => {
				const input = root.querySelector<HTMLInputElement>('[data-seed]');
				const select = root.querySelector<HTMLSelectElement>('[data-planet-class]');
				const nextSeed = Number(input?.value ?? this.seed);

				this.seed = Number.isFinite(nextSeed)
					? Math.max(1, Math.floor(nextSeed))
					: this.seed;
				this.planetClass = isPlanetClass(select?.value)
					? select.value
					: this.planetClass;
				this.createPlanet();
			});
	}

	private createPlanet(): void {
		if (!this.context) return;

		if (this.surfaceRuntime) {
			this.root.remove(this.surfaceRuntime.group);
			this.surfaceRuntime.dispose();
			this.surfaceRuntime = null;
		}

		this.planet?.dispose();
		this.planet = null;
		this.definition = null;
		this.profile = null;
		this.surfaceUpdate = null;
		this.root.clear();
		this.context.clearReport();

		this.definition = generatePlanetDefinition(this.seed, {
			name: `LOD ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});
		this.profile = createPlanetRenderProfile(this.definition);

		this.planet = new Planet(
			LAB_PLANET_RADIUS,
			this.context.rendererMode,
			null,
			{
				moonSystem: true,
				gasCloudParticles:
					this.definition.class === 'gas_giant' ||
					this.definition.class === 'ice_giant',
				nearSurfaceTerrain: false,
			},
			this.definition,
			this.profile,
		);

		this.planet.setAutoRotationEnabled(false);
		this.root.add(this.planet.group);

		this.context.camera.position.set(0, 3.2, 9.5);
		this.context.controls.target.set(0, 0, 0);
		this.context.controls.update();

		this.context.report({
			status: 'pass',
			label: 'seamless planet view',
			detail: `${this.definition.class} / seed ${this.definition.seed}`,
		});
	}

	private updateStats(approximateAltitudeMeters: number): void {
		if (!this.stats || !this.planet) return;

		const terrain = this.planet.getTerrainStats();
		const local = this.surfaceUpdate;
		const transition = local?.transition;

		this.stats.innerHTML =
			`mode: ${local ? 'surface handoff active' : 'orbit'}<br>` +
			`approx altitude: ${(approximateAltitudeMeters / 1000).toFixed(2)} km<br>` +
			`cube sphere: ${terrain.visibleMeshes}/${terrain.totalPatches} patches · LOD ${terrain.maxLevel} · ${terrain.profile}<br>` +
			`local terrain: ${local?.terrain.visibleChunks ?? 0} visible / ${local?.terrain.cachedChunks ?? 0} cached<br>` +
			`local coverage: ${((local?.terrain.coverageRadiusMeters ?? 0) / 1000).toFixed(1)} km<br>` +
			`planet/local weights: ${(transition?.planetWeight ?? 1).toFixed(2)} / ${(transition?.terrainWeight ?? 0).toFixed(2)}`;
	}

	private isLandableSurfaceClass(planetClass: PlanetClass): boolean {
		return planetClass !== 'gas_giant' && planetClass !== 'ice_giant';
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
