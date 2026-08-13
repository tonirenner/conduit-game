import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { generatePlanetDefinition, generatePlanetResourceProfile } from '@conduit/planet/generation';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import {
	Planet,
	createPlanetRenderProfile,
	getPlanetClassVisualProfile,
	OCEAN_COASTLINE_PROFILE,
	type PlanetRenderProfile,
	type SurfacePaletteKind,
} from '@conduit/planet/rendering';
import {
	PlanetSurfaceViewRuntime,
	getPlanetRadiusMeters,
	type PlanetSurfaceViewUpdate,
} from '@conduit/planet/near-view';
import {
	PLANET_CLIMATE_DEBUG_MODES,
	createPlanetClimateDiagnostics,
	drawPlanetClimateDebugMap,
	type PlanetClimateDiagnostics,
} from '@conduit/planet/diagnostics';
import type { ClimateDebugMode } from '@conduit/planet/climate';
import {
	getPlanetScaleDiagnostics,
	getSystemPlanetRenderRadius,
} from '../../../spatial/SpatialRenderScale';

const LAB_PLANET_RADIUS = 3;
const SURFACE_SCALE_START_METERS = 1_500_000;
const SURFACE_SCALE_END_METERS = 120_000;
const SURFACE_RUNTIME_CREATE_METERS = 90_000;
const SURFACE_RUNTIME_RELEASE_METERS = 140_000;

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

type PlanetLayerToggles = {
	surface: boolean;
	ocean: boolean;
	atmosphere: boolean;
	clouds: boolean;
	gasParticles: boolean;
	rings: boolean;
	moons: boolean;
	nearSurfaceTerrain: boolean;
	toxicHaze: boolean;
};

export class PlanetLodTestScene implements FeatureTestScene {
	readonly id = 'planet-lod';
	readonly name = 'Planet LOD';
	readonly category = 'Planets' as const;
	readonly description = 'Production Planet renderer with seamless orbit-to-surface scale handoff.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private planet: Planet | null = null;
	private definition: PlanetDefinition | null = null;
	private profile: PlanetRenderProfile | null = null;
	private climateDiagnostics: PlanetClimateDiagnostics | null = null;
	private surfaceRuntime: PlanetSurfaceViewRuntime | null = null;
	private surfaceUpdate: PlanetSurfaceViewUpdate | null = null;
	private surfaceAnchorDirection: THREE.Vector3 | null = null;
	private worldScale = 1;
	private scaleBlend = 0;
	private stats: HTMLElement | null = null;
	private climateCanvas: HTMLCanvasElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'ocean';
	private climateDebugMode: ClimateDebugMode = 'biome';
	private readonly layerToggles: PlanetLayerToggles = {
		surface: true,
		ocean: true,
		atmosphere: true,
		clouds: true,
		gasParticles: true,
		rings: true,
		moons: true,
		nearSurfaceTerrain: true,
		toxicHaze: true,
	};

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'PlanetLodTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 3.2, 9.5);
		context.camera.near = 0.01;
		context.camera.far = 2_000;
		context.camera.updateProjectionMatrix();
		context.controls.target.set(0, 0, 0);
		context.controls.enablePan = false;
		context.controls.update();
		this.createUi(context.uiRoot);
		this.createPlanet();
	}

	update(deltaSeconds: number): void {
		if (!this.context || !this.planet || !this.definition) {
			return;
		}

		const physicalRadiusMeters = getPlanetRadiusMeters(this.definition);
		let logicalCamera = this.context.camera.position.clone()
			.divideScalar(this.worldScale);
		let altitudeMeters = Math.max(
			0,
			(logicalCamera.length() / LAB_PLANET_RADIUS - 1) * physicalRadiusMeters,
		);

		this.updateWorldScale(logicalCamera, altitudeMeters, physicalRadiusMeters);

		logicalCamera = this.context.camera.position.clone()
			.divideScalar(this.worldScale);
		altitudeMeters = Math.max(
			0,
			(logicalCamera.length() / LAB_PLANET_RADIUS - 1) * physicalRadiusMeters,
		);

		this.updateSurfaceRuntime(altitudeMeters);
		this.surfaceUpdate = this.surfaceRuntime?.update(
			this.context.camera.position,
			this.worldScale,
		) ?? null;

		this.planet.group.visible =
			!this.surfaceUpdate || this.surfaceUpdate.transition.planetVisible;

		this.planet.update(logicalCamera, deltaSeconds);
		this.planet.setRenderQuality('idle');
		this.updateStats(altitudeMeters);
	}

	dispose(): void {
		this.disposeSurfaceRuntime();
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

	private updateWorldScale(
		logicalCamera: THREE.Vector3,
		altitudeMeters: number,
		physicalRadiusMeters: number,
	): void {
		if (!this.context || !this.planet) return;

		const canUseSurface =
			this.layerToggles.nearSurfaceTerrain &&
			this.isLandableSurfaceClass();
		const blend = canUseSurface
			? getSurfaceScaleBlend(altitudeMeters)
			: 0;
		const physicalWorldScale = physicalRadiusMeters / LAB_PLANET_RADIUS;
		const desiredScale = blend <= 0
			? 1
			: Math.exp(Math.log(physicalWorldScale) * blend);
		const scaleRatio = desiredScale / this.worldScale;

		if (Math.abs(scaleRatio - 1) > 0.000001) {
			this.context.camera.position.multiplyScalar(scaleRatio);
			this.context.controls.target.multiplyScalar(scaleRatio);
			this.worldScale = desiredScale;
			this.planet.group.scale.setScalar(this.worldScale);
		}

		if (blend > 0 && !this.surfaceAnchorDirection) {
			this.surfaceAnchorDirection = logicalCamera.clone().normalize();
		}

		if (blend <= 0.0001) {
			this.surfaceAnchorDirection = null;
			this.context.controls.target.set(0, 0, 0);
		} else if (this.surfaceAnchorDirection) {
			const surfaceRadiusWorld = LAB_PLANET_RADIUS * this.worldScale;
			this.context.controls.target.copy(this.surfaceAnchorDirection)
				.multiplyScalar(surfaceRadiusWorld * blend);
		}

		this.scaleBlend = blend;
		const metersToWorld =
			(LAB_PLANET_RADIUS / physicalRadiusMeters) * this.worldScale;
		this.context.camera.near = Math.max(0.01, metersToWorld * 0.25);
		this.context.camera.far = Math.max(
			2_000,
			this.context.camera.position.length() * 3,
		);
		this.context.camera.updateProjectionMatrix();
		this.context.controls.update();
	}

	private updateSurfaceRuntime(altitudeMeters: number): void {
		if (!this.context || !this.definition) return;
		const enabled =
			this.layerToggles.nearSurfaceTerrain &&
			this.isLandableSurfaceClass();

		if (
			enabled &&
			!this.surfaceRuntime &&
			altitudeMeters < SURFACE_RUNTIME_CREATE_METERS
		) {
			this.surfaceRuntime = new PlanetSurfaceViewRuntime(
				this.definition,
				LAB_PLANET_RADIUS,
				this.context.camera.position,
				this.worldScale,
			);
			this.root.add(this.surfaceRuntime.group);
		}

		if (
			this.surfaceRuntime &&
			(!enabled || altitudeMeters > SURFACE_RUNTIME_RELEASE_METERS)
		) {
			this.disposeSurfaceRuntime();
		}
	}

	private disposeSurfaceRuntime(): void {
		if (!this.surfaceRuntime) return;
		this.root.remove(this.surfaceRuntime.group);
		this.surfaceRuntime.dispose();
		this.surfaceRuntime = null;
		this.surfaceUpdate = null;
	}

	private isLandableSurfaceClass(): boolean {
		return this.profile?.rendererKind === 'solid_surface' &&
			this.definition?.class !== 'gas_giant' &&
			this.definition?.class !== 'ice_giant';
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Class ` +
			`<select data-planet-class>${PLANET_CLASSES.map((planetClass) => (
				`<option value="${planetClass}"${planetClass === this.planetClass ? ' selected' : ''}>${formatPlanetClass(planetClass)}</option>`
			)).join('')}</select></label>` +
			`<label style="display:block;margin:6px 0;">Seed ` +
			`<input data-seed type="number" value="${this.seed}" style="width:110px;"></label>` +
			`<label style="display:block;margin:6px 0;">Climate Map ` +
			`<select data-climate-debug>${PLANET_CLIMATE_DEBUG_MODES.map((mode) => (
				`<option value="${mode}"${mode === this.climateDebugMode ? ' selected' : ''}>${formatDebugMode(mode)}</option>`
			)).join('')}</select></label>` +
			`<button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button>` +
			`<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(120,180,255,.18);line-height:1.5;">` +
			this.createLayerToggleHtml('surface', 'Surface') +
			this.createLayerToggleHtml('ocean', 'Ocean Data') +
			this.createLayerToggleHtml('atmosphere', 'Atmosphere') +
			this.createLayerToggleHtml('clouds', 'Clouds') +
			this.createLayerToggleHtml('gasParticles', 'Gas Particles') +
			this.createLayerToggleHtml('rings', 'Rings') +
			this.createLayerToggleHtml('moons', 'Moons') +
			this.createLayerToggleHtml('nearSurfaceTerrain', 'Near Terrain / Seamless Surface') +
			this.createLayerToggleHtml('toxicHaze', 'Toxic Haze') +
			`</div>` +
			`<canvas data-climate-map width="240" height="120" style="display:block;width:240px;height:120px;margin-top:8px;border:1px solid rgba(120,180,255,.35);border-radius:4px;image-rendering:pixelated;background:#05070a;"></canvas>` +
			`<div data-planet-stats style="margin-top:8px;opacity:.78"></div>`;
		this.stats = root.querySelector<HTMLElement>('[data-planet-stats]');
		this.climateCanvas = root.querySelector<HTMLCanvasElement>('[data-climate-map]');

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

		root.querySelector<HTMLSelectElement>('[data-climate-debug]')
			?.addEventListener('change', (event) => {
				this.climateDebugMode =
					(event.currentTarget as HTMLSelectElement).value as ClimateDebugMode;
				this.updateClimateMap();
			});

		for (const key of Object.keys(this.layerToggles) as Array<keyof PlanetLayerToggles>) {
			root.querySelector<HTMLInputElement>(`[data-layer-toggle="${key}"]`)
				?.addEventListener('change', (event) => {
					this.layerToggles[key] =
						(event.currentTarget as HTMLInputElement).checked;
					this.createPlanet();
				});
		}
	}

	private createPlanet(): void {
		if (!this.context) return;

		this.disposeSurfaceRuntime();
		this.planet?.dispose();
		this.planet = null;
		this.definition = null;
		this.profile = null;
		this.climateDiagnostics = null;
		this.surfaceAnchorDirection = null;
		this.worldScale = 1;
		this.scaleBlend = 0;
		this.root.clear();
		this.context.clearReport();

		const generatedDefinition = generatePlanetDefinition(this.seed, {
			name: `LOD ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});
		const definition = this.createDebugDefinition(generatedDefinition);
		const profile = this.createDebugRenderProfile(
			createPlanetRenderProfile(definition),
		);
		this.definition = definition;
		this.profile = profile;
		this.climateDiagnostics = createPlanetClimateDiagnostics(definition);
		this.planet = new Planet(
			LAB_PLANET_RADIUS,
			this.context.rendererMode,
			null,
			{
				gasCloudParticles:
					this.layerToggles.gasParticles &&
					(
						definition.class === 'gas_giant' ||
						definition.class === 'ice_giant'
					),
				moonSystem: this.layerToggles.moons,
				// The legacy one-patch near layer is replaced by PlanetSurfaceViewRuntime here.
				nearSurfaceTerrain: false,
			},
			definition,
			profile,
		);
		this.planet.setDebugLayerVisibility({
			surface: this.layerToggles.surface,
			atmosphere: this.layerToggles.atmosphere,
			clouds: this.layerToggles.clouds,
			gasLayer: true,
			rings: this.layerToggles.rings,
			moons: this.layerToggles.moons,
			nearSurfaceTerrain: false,
			toxicHaze: this.layerToggles.toxicHaze,
		});
		this.root.add(this.planet.group);

		this.context.camera.position.set(0, 3.2, 9.5);
		this.context.controls.target.set(0, 0, 0);
		this.context.controls.update();

		this.context.report({
			status: 'pass',
			label: 'planet created',
			detail: `${definition.class} / seed ${definition.seed}`,
		});
		for (const warning of this.climateDiagnostics.warnings) {
			this.context.report({
				status: 'warn',
				label: 'climate diagnostic',
				detail: warning,
			});
		}
		this.updateClimateMap();
	}

	private createLayerToggleHtml(
		key: keyof PlanetLayerToggles,
		label: string,
	): string {
		return (
			`<label style="display:block;margin:2px 0;">` +
			`<input data-layer-toggle="${key}" type="checkbox"${this.layerToggles[key] ? ' checked' : ''}> ` +
			`${label}</label>`
		);
	}

	private createDebugDefinition(
		definition: PlanetDefinition,
	): PlanetDefinition {
		if (this.layerToggles.ocean) return definition;

		const debugDefinition = {
			...definition,
			composition: {
				...definition.composition,
				water: 0,
			},
			surface: {
				...definition.surface,
				hasOcean: false,
				oceanLevel: -1,
			},
			atmosphere: {
				...definition.atmosphere,
				cloudCoverage: this.layerToggles.clouds
					? definition.atmosphere.cloudCoverage
					: 0,
			},
		};

		return {
			...debugDefinition,
			resources: generatePlanetResourceProfile({
				planetClass: debugDefinition.class,
				composition: debugDefinition.composition,
				atmosphere: debugDefinition.atmosphere,
				surface: debugDefinition.surface,
				climate: debugDefinition.climate,
			}),
		};
	}

	private createDebugRenderProfile(
		profile: PlanetRenderProfile,
	): PlanetRenderProfile {
		return {
			...profile,
			enableOcean: profile.enableOcean && this.layerToggles.ocean,
			enableAtmosphere: profile.enableAtmosphere && this.layerToggles.atmosphere,
			enableClouds: profile.enableClouds && this.layerToggles.clouds,
			enableRings: profile.enableRings && this.layerToggles.rings,
			cloudCoverage: this.layerToggles.clouds ? profile.cloudCoverage : 0,
			atmosphereDensity: this.layerToggles.atmosphere ? profile.atmosphereDensity : 0,
		};
	}

	private updateStats(altitudeMeters: number): void {
		if (
			!this.planet ||
			!this.context ||
			!this.stats ||
			!this.definition ||
			!this.profile ||
			!this.climateDiagnostics
		) return;

		const terrain = this.planet.getTerrainStats();
		const logicalDistance = this.context.camera.position.length() / this.worldScale;
		const climate = this.definition.climate;
		const resources = this.definition.resources;
		const gasStats = this.planet.getGasGiantDebugStats();
		const visualProfile = getPlanetClassVisualProfile(
			this.profile.surfacePalette as SurfacePaletteKind,
		);
		const labScale = getPlanetScaleDiagnostics(
			this.definition.physical.radius,
			LAB_PLANET_RADIUS,
		);
		const gameRenderRadius = getSystemPlanetRenderRadius(
			this.definition.physical.radius,
			this.definition.class,
		);
		const gameScale = getPlanetScaleDiagnostics(
			this.definition.physical.radius,
			gameRenderRadius,
		);
		const local = this.surfaceUpdate?.terrain;
		const transition = this.surfaceUpdate?.transition;

		this.stats.innerHTML =
			`class: ${this.planetClass}<br>` +
			`renderer: ${this.context.rendererMode} / kind: ${this.profile.rendererKind}<br>` +
			`surface: ${this.profile.surfacePalette} / atmosphere: ${this.profile.atmospherePalette} / clouds: ${this.profile.cloudPalette}<br>` +
			`features: terrain ${formatBool(this.profile.enableTerrain)}, ocean ${formatBool(this.profile.enableOcean)}, atmosphere ${formatBool(this.profile.enableAtmosphere)}, clouds ${formatBool(this.profile.enableClouds)}, rings ${formatBool(this.profile.enableRings)}<br>` +
			`real radius: ${formatKilometers(labScale.physicalRadiusKilometers)} km<br>` +
			`lab radius: ${LAB_PLANET_RADIUS.toFixed(1)}u (${formatKilometers(labScale.kilometersPerRenderedUnit)} km/u)<br>` +
			`game radius: ${gameRenderRadius.toFixed(1)}u (${formatKilometers(gameScale.kilometersPerRenderedUnit)} km/u, ${formatScaleMultiplier(gameScale.visualScaleMultiplier)})<br>` +
			`orbit->surface altitude: ${(altitudeMeters / 1000).toFixed(1)} km<br>` +
			`world scale: ${formatScaleMultiplier(this.worldScale)} / blend ${(this.scaleBlend * 100).toFixed(0)}%<br>` +
			`logical distance: ${logicalDistance.toFixed(4)}u / controls distance: ${this.context.camera.position.distanceTo(this.context.controls.target).toFixed(1)}u<br>` +
			`cube patches: ${terrain.visibleMeshes}/${terrain.totalPatches} / LOD ${terrain.maxLevel}<br>` +
			`local terrain: ${local ? `${local.visibleChunks} visible / ${local.cachedChunks} cached / ${(local.coverageRadiusMeters / 1000).toFixed(1)} km coverage` : 'standby'}<br>` +
			`planet/local weight: ${transition ? `${transition.planetWeight.toFixed(2)} / ${transition.terrainWeight.toFixed(2)}` : '1.00 / 0.00'}<br>` +
			`ocean level: ${format01(this.profile.oceanLevel)} terrain roughness: ${format01(this.profile.terrainRoughness)} mountain: ${format01(this.profile.mountainScale)}<br>` +
			`atmo density: ${format01(this.profile.atmosphereDensity)} cloud coverage: ${format01(this.profile.cloudCoverage)}<br>` +
			`visual profile: night ${format01(visualProfile.nightAlbedo)}, ambient ${format01(visualProfile.ambientBoost)}, direct ${format01(visualProfile.directLightScale)}<br>` +
			`${gasStats ? `${formatGasGiantStats(gasStats)}<br>` : ''}` +
			`coast profile: water ${formatRange(OCEAN_COASTLINE_PROFILE.waterHintStart, OCEAN_COASTLINE_PROFILE.waterHintEnd)}, shelf ${formatRange(OCEAN_COASTLINE_PROFILE.shelfStart, OCEAN_COASTLINE_PROFILE.shelfEnd)}<br>` +
			`terrain profile: ${this.climateDiagnostics.terrainProfile}<br>` +
			`temp/humid/dry: ${format01(climate.temperature01)} / ${format01(climate.humidity)} / ${format01(climate.aridity)}<br>` +
			`resources: metal ${format01(resources.metal)}, rare ${format01(resources.rareMaterials)}, fuel ${format01(resources.fuel)}, water ${format01(resources.water)}`;
	}

	private updateClimateMap(): void {
		if (!this.climateCanvas || !this.definition) return;
		drawPlanetClimateDebugMap(
			this.climateCanvas,
			this.definition,
			this.climateDebugMode,
		);
	}
}

function getSurfaceScaleBlend(altitudeMeters: number): number {
	const t = THREE.MathUtils.clamp(
		(SURFACE_SCALE_START_METERS - altitudeMeters) /
		(SURFACE_SCALE_START_METERS - SURFACE_SCALE_END_METERS),
		0,
		1,
	);
	return t * t * (3 - 2 * t);
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

function format01(value: number): string {
	return value.toFixed(2);
}

function formatRange(from: number, to: number): string {
	return `${from.toFixed(2)}-${to.toFixed(2)}`;
}

function formatGasGiantStats(stats: NonNullable<ReturnType<Planet['getGasGiantDebugStats']>>): string {
	return (
		`gas layer: ${stats.kind}, shells ${stats.cloudShells}, ` +
		`particles ${stats.cloudParticles.enabled ? 'on' : 'off'} ${stats.cloudParticles.count}`
	);
}

function formatBool(value: boolean): string {
	return value ? 'on' : 'off';
}

function formatKilometers(value: number): string {
	if (Math.abs(value) >= 10_000) {
		return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}
	if (Math.abs(value) >= 100) return value.toFixed(0);
	return value.toFixed(1);
}

function formatScaleMultiplier(value: number): string {
	if (value === 0 || !Number.isFinite(value)) return 'n/a';
	if (Math.abs(value) < 0.001 || Math.abs(value) >= 10_000) {
		return `${value.toExponential(2)}x`;
	}
	return `${value.toFixed(4)}x`;
}
