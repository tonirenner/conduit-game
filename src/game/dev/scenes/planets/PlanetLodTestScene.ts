import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { generatePlanetDefinition } from '@conduit/planet/generation';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import {
	createPlanetRenderProfile,
	type PlanetRenderProfile,
} from '@conduit/planet/rendering';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import {
	PLANET_CLIMATE_DEBUG_MODES,
	drawPlanetClimateDebugMap,
} from '@conduit/planet/diagnostics';
import type { ClimateDebugMode } from '@conduit/planet/climate';
import { PLANET_VIEW_BANDS, PlanetViewRuntime } from '@conduit/planet/view';
import { PlanetApproachCameraController } from './PlanetApproachCameraController';
import { PlanetFreeLookCameraController } from './PlanetFreeLookCameraController';

const LAB_PLANET_RADIUS = 3;
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
	readonly description = 'Validate optimized Orbit, Regional and Surface view handoffs.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private runtime: PlanetViewRuntime | null = null;
	private approachCamera: PlanetApproachCameraController | null = null;
	private freeLookCamera: PlanetFreeLookCameraController | null = null;
	private definition: PlanetDefinition | null = null;
	private profile: PlanetRenderProfile | null = null;
	private stats: HTMLElement | null = null;
	private climateCanvas: HTMLCanvasElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'desert';
	private climateDebugMode: ClimateDebugMode = 'biome';

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

	update(dt: number): void {
		if (!this.context || !this.runtime) return;

		this.approachCamera?.update(dt);
		this.runtime.update(this.context.camera.position, dt);

		const viewState = this.runtime.getState();
		const cameraState = this.approachCamera?.getState();
		if (this.freeLookCamera && cameraState) {
			// Enter free-look as soon as the renderer leaves pure orbit. On the way
			// back out, keep ownership until the approach camera itself has returned
			// to its orbit state. This hysteresis prevents controller thrashing in the
			// orbit/regional overlap band.
			const shouldOwnCamera = this.freeLookCamera.isActive()
				? cameraState.mode !== 'orbit'
				: viewState.phase !== 'orbit';
			this.freeLookCamera.setNonOrbitActive(shouldOwnCamera);
			this.freeLookCamera.update(dt);
		}

		this.updateStats();
	}

	reset(): void {
		this.createPlanet();
	}

	dispose(): void {
		this.freeLookCamera?.dispose();
		this.freeLookCamera = null;
		this.approachCamera?.dispose();
		this.approachCamera = null;
		this.runtime?.dispose();
		this.runtime = null;
		this.definition = null;
		this.profile = null;
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	private createPlanet(): void {
		if (!this.context) return;

		this.freeLookCamera?.dispose();
		this.freeLookCamera = null;
		this.approachCamera?.dispose();
		this.approachCamera = null;
		this.runtime?.dispose();
		this.runtime = null;
		this.root.clear();
		this.context.clearReport();

		const definition = generatePlanetDefinition(this.seed, {
			name: `LOD ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});
		const profile = createPlanetRenderProfile(definition);
		const radiusMeters = getPlanetRadiusMeters(definition);

		this.definition = definition;
		this.profile = profile;
		this.runtime = new PlanetViewRuntime(
			definition,
			profile,
			LAB_PLANET_RADIUS,
			this.context.rendererMode,
			this.context.camera.position,
		);
		this.root.add(this.runtime.group);
		this.approachCamera = new PlanetApproachCameraController(
			this.context.camera,
			this.context.controls,
			LAB_PLANET_RADIUS,
			radiusMeters,
		);
		this.freeLookCamera = new PlanetFreeLookCameraController(
			this.context.camera,
			this.context.controls,
			this.approachCamera,
			LAB_PLANET_RADIUS,
			radiusMeters,
		);
		this.context.report({
			status: 'pass',
			label: 'planet views created',
			detail: `${definition.class} / seed ${definition.seed}`,
		});
		this.context.report({
			status: 'info',
			label: 'camera handoff',
			detail: 'OrbitControls in orbit / LMB free-look + radial wheel outside orbit',
		});
		this.updateClimateMap();
		this.updateStats();
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML = `
			<label style="display:block;margin:6px 0;">Class
				<select data-planet-class>
					${PLANET_CLASSES.map((planetClass) => (
						`<option value="${planetClass}"${planetClass === this.planetClass ? ' selected' : ''}>${formatPlanetClass(planetClass)}</option>`
					)).join('')}
				</select>
			</label>
			<label style="display:block;margin:6px 0;">Seed
				<input data-seed type="number" value="${this.seed}" style="width:110px;">
			</label>
			<label style="display:block;margin:6px 0;">Climate Map
				<select data-climate-debug>
					${PLANET_CLIMATE_DEBUG_MODES.map((mode) => (
						`<option value="${mode}"${mode === this.climateDebugMode ? ' selected' : ''}>${formatDebugMode(mode)}</option>`
					)).join('')}
				</select>
			</label>
			<button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button>
			<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(143,231,255,.16);">
				<div style="color:#8fe7ff;margin-bottom:5px;">View architecture</div>
				<div>Orbit → Regional → Surface</div>
			</div>
			<canvas data-climate-map width="240" height="120" style="display:block;width:240px;height:120px;margin-top:8px;border:1px solid rgba(120,180,255,.35);border-radius:4px;image-rendering:pixelated;background:#05070a;"></canvas>
			<div data-planet-stats style="margin-top:8px;opacity:.82"></div>
		`;

		this.stats = root.querySelector('[data-planet-stats]');
		this.climateCanvas = root.querySelector('[data-climate-map]');

		root.querySelector<HTMLButtonElement>('[data-apply-planet]')?.addEventListener('click', () => {
			const seedInput = root.querySelector<HTMLInputElement>('[data-seed]');
			const classSelect = root.querySelector<HTMLSelectElement>('[data-planet-class]');
			const seed = Number(seedInput?.value ?? this.seed);
			this.seed = Number.isFinite(seed) ? Math.max(1, Math.floor(seed)) : this.seed;
			this.planetClass = isPlanetClass(classSelect?.value) ? classSelect.value : this.planetClass;
			this.createPlanet();
		});

		root.querySelector<HTMLSelectElement>('[data-climate-debug]')?.addEventListener('change', (event) => {
			this.climateDebugMode = (event.currentTarget as HTMLSelectElement).value as ClimateDebugMode;
			this.updateClimateMap();
		});
	}

	private updateStats(): void {
		if (!this.runtime || !this.definition || !this.profile || !this.stats) return;
		const state = this.runtime.getState();
		const cameraState = this.approachCamera?.getState();
		const terrain = this.runtime.planet.getTerrainStats();
		const radiusKm = getPlanetRadiusMeters(this.definition) / 1000;
		const isSurfacePlanet = this.profile.rendererKind === 'solid_surface';
		const optimizedOrbit = state.orbitRenderer === 'instanced-fixed';
		const clipmapSurface = state.surfaceRenderer === 'clipmap-local';

		this.stats.innerHTML = [
			`class: ${this.definition.class}`,
			`renderer: ${this.context?.rendererMode ?? 'n/a'}`,
			`real radius: ${radiusKm.toFixed(0)} km`,
			`surface views: ${isSurfacePlanet ? 'enabled' : 'orbit only'}`,
			'',
			'<b>approach camera</b>',
			`mode: ${cameraState?.mode ?? 'n/a'}`,
			`control: ${this.freeLookCamera?.isActive() ? 'FREE LOOK' : 'ORBIT CONTROLS'}`,
			`target blend: ${cameraState ? formatWeight(cameraState.targetBlend) : 'n/a'}`,
			`local up: ${cameraState ? formatWeight(cameraState.upBlend) : 'n/a'}`,
			`fov: ${cameraState ? `${cameraState.fov.toFixed(1)}°` : 'n/a'}`,
			`surface anchor: ${cameraState?.anchorActive ? 'LOCKED' : 'off'}`,
			'',
			'<b>view handoff</b>',
			`altitude: ${formatAltitude(state.altitudeMeters)}`,
			`phase: ${state.phase}`,
			`orbit: ${formatWeight(state.orbitWeight)}`,
			`regional: ${formatWeight(state.regionalWeight)} / ${state.regionalActive ? 'ACTIVE' : 'off'}`,
			`surface: ${formatWeight(state.surfaceWeight)} / ${state.surfaceActive ? 'ACTIVE' : 'off'}`,
			'',
			'<b>orbit view</b>',
			`renderer: ${state.orbitRenderer.toUpperCase()}`,
			optimizedOrbit
				? `draws: ${state.orbitDraws} / instances: ${state.orbitInstances}`
				: `legacy patches: ${terrain.visibleMeshes}/${terrain.totalPatches}`,
			optimizedOrbit
				? `fixed patch level: ${state.orbitPatchLevel} / grid: ${state.orbitGridSegments}x${state.orbitGridSegments}`
				: `max lod: ${terrain.maxLevel} / profile: ${terrain.profile}`,
			optimizedOrbit
				? `terrain LUT: ${state.orbitVolumeResolution}³ RGBA16F / runtime noise: OFF / indexed: YES`
				: 'terrain LUT: n/a',
			`legacy CubeSphere: ${optimizedOrbit ? 'FROZEN + HIDDEN' : state.orbitLodFrozen ? 'FROZEN AT HANDOFF' : 'live'}`,
			'',
			'<b>surface view</b>',
			`renderer: ${state.surfaceRenderer.toUpperCase()}`,
			clipmapSurface
				? `draws: ${state.surfaceDraws} / rings: ${state.surfaceRings}`
				: 'draws: 0 / rings: 0',
			clipmapSurface
				? `grid: ${state.surfaceGridCells} cells / outer half extent: ${(state.surfaceOuterHalfExtentMeters / 1000).toFixed(0)} km`
				: 'grid: n/a',
			clipmapSurface ? 'local frame: meters / indexed: YES' : 'local frame: n/a',
			'',
			'<b>bands</b>',
			`orbit→regional: ${formatAltitude(PLANET_VIEW_BANDS.orbitRegionalStartMeters)} → ${formatAltitude(PLANET_VIEW_BANDS.orbitRegionalEndMeters)}`,
			`regional→surface: ${formatAltitude(PLANET_VIEW_BANDS.regionalSurfaceStartMeters)} → ${formatAltitude(PLANET_VIEW_BANDS.regionalSurfaceEndMeters)}`,
		].join('<br>');
	}

	private updateClimateMap(): void {
		if (this.climateCanvas && this.definition) {
			drawPlanetClimateDebugMap(this.climateCanvas, this.definition, this.climateDebugMode);
		}
	}
}

function isPlanetClass(value: string | undefined): value is PlanetClass {
	return PLANET_CLASSES.includes(value as PlanetClass);
}

function formatPlanetClass(value: PlanetClass): string {
	return value
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function formatDebugMode(mode: ClimateDebugMode): string {
	return mode.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function formatWeight(value: number): string {
	return `${(value * 100).toFixed(0)}%`;
}

function formatAltitude(meters: number): string {
	return meters >= 1_000_000
		? `${(meters / 1_000_000).toFixed(2)} Mm`
		: `${(meters / 1000).toFixed(0)} km`;
}
