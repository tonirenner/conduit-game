import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { Planet } from '../../../../planet/Planet';
import { generatePlanetDefinition } from '../../../../planet/generation/PlanetGenerator';
import { createPlanetRenderProfile } from '../../../../planet/rendering/PlanetRenderProfile';
import type { PlanetClass, PlanetDefinition } from '../../../../planet/model/PlanetDefinition';
import type { PlanetRenderProfile } from '../../../../planet/rendering/PlanetRenderProfile';
import {
	PLANET_CLIMATE_DEBUG_MODES,
	createPlanetClimateDiagnostics,
	drawPlanetClimateDebugMap,
	type PlanetClimateDiagnostics,
} from '../../../../planet/diagnostics/PlanetClimateDiagnostics';
import type { ClimateDebugMode } from '../../../../planet/Climate';
import {
	getPlanetScaleDiagnostics,
	getSystemPlanetRenderRadius,
} from '../../../spatial/SpatialRenderScale';

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
	private definition: PlanetDefinition | null = null;
	private profile: PlanetRenderProfile | null = null;
	private climateDiagnostics: PlanetClimateDiagnostics | null = null;
	private stats: HTMLElement | null = null;
	private climateCanvas: HTMLCanvasElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'ocean';
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
			`<label style="display:block;margin:6px 0;">Climate Map ` +
			`<select data-climate-debug>${PLANET_CLIMATE_DEBUG_MODES.map((mode) => (
				`<option value="${mode}"${mode === this.climateDebugMode ? ' selected' : ''}>${formatDebugMode(mode)}</option>`
			)).join('')}</select></label>` +
			`<button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button>` +
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
	}

	private createPlanet(): void {
		if (!this.context) {
			return;
		}

		this.planet?.dispose();
		this.planet = null;
		this.definition = null;
		this.profile = null;
		this.climateDiagnostics = null;
		this.root.clear();
		this.context.clearReport();

		const definition = generatePlanetDefinition(this.seed, {
			name: `LOD ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});
		const profile = createPlanetRenderProfile(definition);
		this.definition = definition;
		this.profile = profile;
		this.climateDiagnostics = createPlanetClimateDiagnostics(definition);
		this.planet = new Planet(
			3,
			this.context.rendererMode,
			null,
			{
				gasCloudParticles:
					definition.class === 'gas_giant' ||
					definition.class === 'ice_giant',
			},
			definition,
			profile,
		);
		this.root.add(this.planet.group);
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

	private updateStats(): void {
		if (
			!this.planet ||
			!this.context ||
			!this.stats ||
			!this.definition ||
			!this.profile ||
			!this.climateDiagnostics
		) {
			return;
		}

		const terrain = this.planet.getTerrainStats();
		const distance = this.context.camera.position.length();
		const climate = this.definition.climate;
		const labRenderRadius = 3;
		const gameRenderRadius = getSystemPlanetRenderRadius(
			this.definition.physical.radius,
			this.definition.class,
		);
		const labScale = getPlanetScaleDiagnostics(
			this.definition.physical.radius,
			labRenderRadius,
		);
		const gameScale = getPlanetScaleDiagnostics(
			this.definition.physical.radius,
			gameRenderRadius,
		);

		this.stats.innerHTML =
			`class: ${this.planetClass}<br>` +
			`renderer: ${this.context.rendererMode} / kind: ${this.profile.rendererKind}<br>` +
			`surface: ${this.profile.surfacePalette} / atmosphere: ${this.profile.atmospherePalette} / clouds: ${this.profile.cloudPalette}<br>` +
			`features: terrain ${formatBool(this.profile.enableTerrain)}, ocean ${formatBool(this.profile.enableOcean)}, atmosphere ${formatBool(this.profile.enableAtmosphere)}, clouds ${formatBool(this.profile.enableClouds)}, rings ${formatBool(this.profile.enableRings)}<br>` +
			`real radius: ${formatKilometers(labScale.physicalRadiusKilometers)} km<br>` +
			`lab radius: ${labRenderRadius.toFixed(1)}u (${formatKilometers(labScale.kilometersPerRenderedUnit)} km/u)<br>` +
			`game radius: ${gameRenderRadius.toFixed(1)}u (${formatKilometers(gameScale.kilometersPerRenderedUnit)} km/u, ${formatScaleMultiplier(gameScale.visualScaleMultiplier)})<br>` +
			`ocean level: ${format01(this.profile.oceanLevel)} terrain roughness: ${format01(this.profile.terrainRoughness)} mountain: ${format01(this.profile.mountainScale)}<br>` +
			`atmo density: ${format01(this.profile.atmosphereDensity)} cloud coverage: ${format01(this.profile.cloudCoverage)}<br>` +
			`terrain profile: ${this.climateDiagnostics.terrainProfile}<br>` +
			`temp: ${format01(climate.temperature01)} humid: ${format01(climate.humidity)} dry: ${format01(climate.aridity)}<br>` +
			`wind: ${format01(climate.windStrength)} storm: ${format01(climate.stormActivity)} cloud: ${format01(climate.cloudPersistence)}<br>` +
			`ash: ${format01(climate.ashLoad)} season: ${format01(climate.seasonality)}<br>` +
			`sample avg temp/humid/dry: ${format01(this.climateDiagnostics.averages.temperature)} / ${format01(this.climateDiagnostics.averages.humidity)} / ${format01(this.climateDiagnostics.averages.aridity)}<br>` +
			`coverage ocean/coast/land: ${formatPercent(this.climateDiagnostics.coverage.deepOcean + this.climateDiagnostics.coverage.shallowOcean)} / ${formatPercent(this.climateDiagnostics.coverage.coast)} / ${formatPercent(this.climateDiagnostics.coverage.land)}<br>` +
			`biomes: ${formatBiomeShares(this.climateDiagnostics.dominantBiomes)}<br>` +
			`warnings: ${this.climateDiagnostics.warnings.length > 0 ? this.climateDiagnostics.warnings.join(', ') : 'none'}<br>` +
			`distance: ${distance.toFixed(2)}<br>` +
			`patches: ${terrain.visibleMeshes}/${terrain.totalPatches}<br>` +
			`max lod: ${terrain.maxLevel}<br>` +
			`splits: ${terrain.balance.splits}<br>` +
			`violations: ${terrain.balance.violations}`;
	}

	private updateClimateMap(): void {
		if (!this.climateCanvas || !this.definition) {
			return;
		}

		drawPlanetClimateDebugMap(
			this.climateCanvas,
			this.definition,
			this.climateDebugMode,
		);
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

function format01(value: number): string {
	return value.toFixed(2);
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatBiomeShares(
	shares: PlanetClimateDiagnostics['dominantBiomes'],
): string {
	return shares
		.map((entry) => `${entry.biome} ${formatPercent(entry.share)}`)
		.join(', ');
}

function formatDebugMode(mode: ClimateDebugMode): string {
	return mode
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (first) => first.toUpperCase());
}

function formatBool(value: boolean): string {
	return value ? 'on' : 'off';
}

function formatKilometers(value: number): string {
	if (Math.abs(value) >= 10_000) {
		return value.toLocaleString('en-US', {
			maximumFractionDigits: 0,
		});
	}

	if (Math.abs(value) >= 100) {
		return value.toFixed(0);
	}

	return value.toFixed(1);
}

function formatScaleMultiplier(value: number): string {
	if (value === 0 || !Number.isFinite(value)) {
		return 'n/a';
	}

	if (Math.abs(value) < 0.001) {
		return `${value.toExponential(2)}x`;
	}

	return `${value.toFixed(4)}x`;
}
