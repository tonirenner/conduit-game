import * as THREE from 'three';
import {
	createAppRenderer,
	getPreferredRendererMode,
	RenderQuality,
	renderFrame,
} from '@conduit/web3d/renderer';
import {TerrainTextureBakeManager} from './planet/TerrainTextureBakeManager';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createClimateDebugCanvas} from './scene/createClimateDebugCanvas';
import {createStarBackground} from './scene/createStarBackground';
import {Planet, type PlanetRenderTuning} from './planet/Planet';
import {generatePlanetDefinition} from './planet/generation/PlanetGenerator';
import {createPlanetRenderProfile} from './planet/rendering/PlanetRenderProfile';
import {resolveTerrainProfileKind} from './planet/rendering/TerrainRenderProfile';
import {SUN_DIRECTION, SUN_DISTANCE} from './planet/Sun';
import {PostProcessingPipeline} from './postprocessing/PostProcessingPipeline';
import {RenderTuningPanel} from './debug/RenderTuningPanel';
import type {PlanetClass} from './planet/model/PlanetDefinition';
import {GamePrototypeScene} from './game/rendering/GamePrototypeScene';
import {createSettingsStore} from './game/settings/GameSettings';
import {SettingsMenu} from './game/ui/SettingsMenu';
import {
	loadOrCreateSingleplayerState,
	saveSingleplayerState,
} from './game/persistence/SingleplayerBootstrap';
import {FeatureLab} from './game/dev/FeatureLab';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
	throw new Error('App container #app wurde nicht gefunden.');
}

const PLANET_RADIUS       = 3;
const DEFAULT_PLANET_SEED = 123456;

function getInitialPlanetSeed(): number {
	const params = new URLSearchParams(window.location.search);
	const seed   = Number(params.get('seed'));

	if (Number.isFinite(seed) && seed > 0) {
		return Math.floor(seed);
	}

	return DEFAULT_PLANET_SEED;
}

function writePlanetSeedToUrl(seed: number): void {
	const url = new URL(window.location.href);

	url.searchParams.set(
		'seed',
		String(seed),
	);

	window.history.replaceState(
		null,
		'',
		url,
	);
}

let currentPlanetSeed = getInitialPlanetSeed();

const FORCED_PLANET_CLASSES: PlanetClass[] = [
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

type ForcedPlanetKind = 'auto' | PlanetClass;

function normalizePlanetClassParam(
	value: string | null,
): PlanetClass | null {
	if (value === 'dessert') {
		return 'desert';
	}

	if (
		value &&
		FORCED_PLANET_CLASSES.includes(value as PlanetClass)
	) {
		return value as PlanetClass;
	}

	return null;
}

function parseForcedPlanetKind(): ForcedPlanetKind {
	const params     = new URLSearchParams(window.location.search);
	const classParam = normalizePlanetClassParam(
		params.get('class') ?? params.get('kind'),
	);

	if (classParam) {
		return classParam;
	}

	if (params.get('surface') === 'lava') {
		return 'lava';
	}

	return 'auto';
}

let forcedPlanetKind: ForcedPlanetKind = parseForcedPlanetKind();
const renderTuningPanelEnabled         =
	      new URLSearchParams(window.location.search).get('tuning') === '1' ||
	      new URLSearchParams(window.location.search).get('renderDebug') === '1';
const testMode                         =
	      new URLSearchParams(window.location.search).get('view') === 'test';
const gameMode                         =
	      !testMode &&
	      new URLSearchParams(window.location.search).get('view') !== 'planet' &&
	      new URLSearchParams(window.location.search).get('game') !== '0';

type ForcedSurfaceKind = 'auto' | 'lava';

function getForcedSurfaceKind(): ForcedSurfaceKind {
	if (forcedPlanetKind !== 'auto') {
		return 'auto';
	}

	return new URLSearchParams(window.location.search).get('surface') === 'lava'
	       ? 'lava'
	       : 'auto';
}

function writeForcedKindToUrl(): void {
	const url = new URL(window.location.href);

	if (forcedPlanetKind === 'auto') {
		url.searchParams.delete('class');
		url.searchParams.delete('kind');
	} else {
		url.searchParams.set('class', forcedPlanetKind);
		url.searchParams.delete('kind');
		url.searchParams.delete('surface');
	}

	window.history.replaceState(null, '', url);
}

const ORBIT_MIN_CAMERA_DISTANCE = PLANET_RADIUS + 0.42;
const ORBIT_MAX_CAMERA_DISTANCE = 60;

const FLIGHT_MIN_HEIGHT   = 0.08;
const FLIGHT_START_HEIGHT = 0.62;
const FLIGHT_MAX_DISTANCE = 80;

const DEFAULT_CAMERA_FOV         = 58;
const CINEMATIC_CAMERA_FOV       = 46;
const CINEMATIC_LOW_ORBIT_HEIGHT = 0.54;

const timer = new THREE.Timer();
timer.connect(document);

const settingsStore = createSettingsStore();
const initialSettings = settingsStore.getSnapshot();

THREE.ColorManagement.enabled = true;

// Star background
const starBackground = createStarBackground();
document.body.appendChild(starBackground);

// App layer
app.style.position   = 'fixed';
app.style.inset      = '0';
app.style.zIndex     = '1';
app.style.background = 'transparent';
app.style.overflow   = 'hidden';

// Scene
const scene      = new THREE.Scene();
scene.background = null;

// Camera
const camera = new THREE.PerspectiveCamera(
	DEFAULT_CAMERA_FOV,
	window.innerWidth / window.innerHeight,
	0.05,
	2000,
);

camera.position.set(0.35, 3.65, 10.6);

// Renderer
const preferredRendererMode = getPreferredRendererMode(
	initialSettings.renderer,
);

const {
	      renderer,
	      mode: rendererMode,
      } = await createAppRenderer(
	preferredRendererMode,
	{
		antialias: true,
		alpha: true,
		premultipliedAlpha: false,
		powerPreference: 'high-performance',
	},
);

app.appendChild(renderer.domElement);

const postProcessingEnabled =
	      new URLSearchParams(window.location.search).get('postfx') !== '0';

const postProcessing = new PostProcessingPipeline(
	renderer,
	scene,
	camera,
	{
		enabled: postProcessingEnabled,
		rendererMode,
		quality: initialSettings.graphicsQuality,
		enableGTAO: initialSettings.gtao,
		enableSSR: initialSettings.ssr,
		enableBloom: initialSettings.bloom,
	},
);

const renderQuality = new RenderQuality(
	renderer,
	camera,
	{
		minPixelRatio: 0.85,
		movingPixelRatio: 0.85,
		idlePixelRatio: 2.0,
		idleDelaySeconds: 0.45,
	},
);

// HUD
const hud      = document.createElement('div');
let hudVisible = true;

hud.textContent = 'HUD loading...';

hud.style.position       = 'fixed';
hud.style.left           = '12px';
hud.style.bottom         = '12px';
hud.style.zIndex         = '9999';
hud.style.padding        = '8px 10px';
hud.style.fontFamily     = 'monospace';
hud.style.fontSize       = '12px';
hud.style.lineHeight     = '1.4';
hud.style.whiteSpace     = 'pre';
hud.style.color          = '#d8ecff';
hud.style.background     = 'rgba(0, 0, 0, 0.48)';
hud.style.border         = '1px solid rgba(120, 180, 255, 0.32)';
hud.style.borderRadius   = '6px';
hud.style.pointerEvents  = 'none';
hud.style.backdropFilter = 'blur(4px)';

document.body.appendChild(hud);

let settingsMenu: SettingsMenu | null = null;

settingsMenu = new SettingsMenu({
	store: settingsStore,
	activeRendererMode: rendererMode,
	onSettingsChanged: (settings) => {
		hudVisible = settings.hud;
		hud.style.display = hudVisible ? 'block' : 'none';
		document.documentElement.style.setProperty(
			'--game-ui-scale',
			String(settings.uiScale),
		);
	},
});

const climateDebug = createClimateDebugCanvas({
	                                              visible: false,
	                                              mode: 'biome',
                                              });

document.body.appendChild(climateDebug.canvas);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);

controls.target.set(0, 0, 0);

controls.enableDamping = true;
controls.dampingFactor = 0.065;

controls.minDistance = ORBIT_MIN_CAMERA_DISTANCE;
controls.maxDistance = ORBIT_MAX_CAMERA_DISTANCE;

controls.enableZoom = true;
controls.zoomSpeed  = 1.15;

controls.enablePan = false;

controls.rotateSpeed = 0.58;

controls.update();

type CameraMode = 'orbit' | 'flight' | 'cinematic';

let cameraMode: CameraMode = 'orbit';

const pressedKeys = new Set<string>();

let isMouseLooking = false;

const scratchVectorA     = new THREE.Vector3();
const scratchVectorB     = new THREE.Vector3();
const scratchVectorC     = new THREE.Vector3();
const scratchQuaternionA = new THREE.Quaternion();
const scratchQuaternionB = new THREE.Quaternion();

function getRadialUp(position: THREE.Vector3): THREE.Vector3 {
	return scratchVectorA.copy(position)
		.normalize();
}

function getStableTangentBasis(
	radialUp: THREE.Vector3,
	outRight: THREE.Vector3,
	outForward: THREE.Vector3,
): void {
	const worldUp = scratchVectorB.set(0, 1, 0);

	if (Math.abs(radialUp.dot(worldUp)) > 0.92) {
		worldUp.set(1, 0, 0);
	}

	outRight
		.copy(worldUp)
		.cross(radialUp)
		.normalize();

	outForward
		.copy(radialUp)
		.cross(outRight)
		.normalize();
}

function setCameraFov(fov: number): void {
	if (Math.abs(camera.fov - fov) < 0.001) {
		return;
	}

	camera.fov = fov;
	camera.updateProjectionMatrix();
}

function zoomCamera(amount: number): void {
	const direction = new THREE.Vector3()
		.subVectors(controls.target, camera.position)
		.normalize();

	camera.position.addScaledVector(direction, amount);

	const distanceToTarget = camera.position.distanceTo(controls.target);

	if (distanceToTarget < ORBIT_MIN_CAMERA_DISTANCE) {
		camera.position
			.sub(controls.target)
			.normalize()
			.multiplyScalar(ORBIT_MIN_CAMERA_DISTANCE)
			.add(controls.target);
	}

	if (distanceToTarget > ORBIT_MAX_CAMERA_DISTANCE) {
		camera.position
			.sub(controls.target)
			.normalize()
			.multiplyScalar(ORBIT_MAX_CAMERA_DISTANCE)
			.add(controls.target);
	}

	controls.update();
}

function enterFlightMode(): void {
	cameraMode = 'flight';

	setCameraFov(DEFAULT_CAMERA_FOV);

	controls.enabled = false;
	isMouseLooking   = false;

	const radialUp = camera.position.clone()
		.normalize();

	if (!Number.isFinite(radialUp.x)) {
		radialUp.set(0, 1, 0);
	}

	const right   = new THREE.Vector3();
	const forward = new THREE.Vector3();

	getStableTangentBasis(radialUp, right, forward);

	camera.position
		.copy(radialUp)
		.multiplyScalar(PLANET_RADIUS + FLIGHT_START_HEIGHT);

	const lookTarget = camera.position
		.clone()
		.addScaledVector(forward, 7.0)
		.addScaledVector(radialUp, -0.18);

	camera.up.copy(radialUp);
	camera.lookAt(lookTarget);

	renderQuality.forceMoving();
}

function enterCinematicLowOrbitMode(): void {
	cameraMode = 'cinematic';

	setCameraFov(CINEMATIC_CAMERA_FOV);

	controls.enabled = false;
	isMouseLooking   = false;

	const sunDirection = SUN_DIRECTION.clone()
		.normalize();

	const referenceAxis =
		      Math.abs(sunDirection.y) < 0.82
		      ? new THREE.Vector3(0, 1, 0)
		      : new THREE.Vector3(1, 0, 0);

	const tangentToSun = referenceAxis
		.clone()
		.addScaledVector(
			sunDirection,
			-referenceAxis.dot(sunDirection),
		)
		.normalize();

	/**
	 * RadialUp bewusst nahe am Terminator:
	 * dot(radialUp, sunDirection) ca. 0.18
	 * => Sonne knapp über dem lokalen Horizont.
	 */
	const sunLift       = 0.18;
	const tangentWeight = Math.sqrt(1.0 - sunLift * sunLift);

	const radialUp = sunDirection
		.clone()
		.multiplyScalar(sunLift)
		.addScaledVector(tangentToSun, tangentWeight)
		.normalize();

	const forward = sunDirection
		.clone()
		.addScaledVector(
			radialUp,
			-sunDirection.dot(radialUp),
		)
		.normalize();

	const right = new THREE.Vector3()
		.crossVectors(forward, radialUp)
		.normalize();

	const correctedForward = new THREE.Vector3()
		.crossVectors(radialUp, right)
		.normalize();

	camera.position
		.copy(radialUp)
		.multiplyScalar(PLANET_RADIUS + CINEMATIC_LOW_ORBIT_HEIGHT);

	/**
	 * Fast tangential über den Horizont schauen,
	 * aber minimal nach unten, damit Oberfläche/Wolken sichtbar bleiben.
	 */
	const lookTarget = camera.position
		.clone()
		.addScaledVector(correctedForward, 11.0)
		.addScaledVector(radialUp, -0.42);

	camera.up.copy(radialUp);
	camera.lookAt(lookTarget);

	renderQuality.forceMoving();
}

function exitFlightMode(): void {
	cameraMode = 'orbit';

	setCameraFov(DEFAULT_CAMERA_FOV);

	isMouseLooking   = false;
	controls.enabled = true;

	controls.target.set(0, 0, 0);

	const distance = camera.position.length();

	if (distance < ORBIT_MIN_CAMERA_DISTANCE) {
		camera.position
			.normalize()
			.multiplyScalar(ORBIT_MIN_CAMERA_DISTANCE);
	}

	camera.up.set(0, 1, 0);

	controls.update();
	renderQuality.forceMoving();
}

function toggleCameraMode(): void {
	if (cameraMode === 'orbit') {
		enterFlightMode();
		return;
	}

	exitFlightMode();
}

function clampFlightCameraDistance(): void {
	const distance    = camera.position.length();
	const minDistance = PLANET_RADIUS + FLIGHT_MIN_HEIGHT;

	if (distance < minDistance) {
		camera.position
			.normalize()
			.multiplyScalar(minDistance);

		return;
	}

	if (distance > FLIGHT_MAX_DISTANCE) {
		camera.position
			.normalize()
			.multiplyScalar(FLIGHT_MAX_DISTANCE);
	}
}

function updateFlightCamera(deltaSeconds: number): void {
	if (cameraMode !== 'flight' && cameraMode !== 'cinematic') {
		return;
	}

	const move = scratchVectorA.set(0, 0, 0);

	const forward = scratchVectorB;
	camera.getWorldDirection(forward)
		.normalize();

	const radialUp = scratchVectorC
		.copy(camera.position)
		.normalize();

	const right = new THREE.Vector3()
		.crossVectors(forward, radialUp)
		.normalize();

	if (right.lengthSq() < 0.0001) {
		right.set(1, 0, 0);
	}

	const flatForward = new THREE.Vector3()
		.crossVectors(radialUp, right)
		.normalize();

	if (pressedKeys.has('KeyW')) {
		move.add(flatForward);
	}

	if (pressedKeys.has('KeyS')) {
		move.addScaledVector(flatForward, -1);
	}

	if (pressedKeys.has('KeyD')) {
		move.add(right);
	}

	if (pressedKeys.has('KeyA')) {
		move.addScaledVector(right, -1);
	}

	if (pressedKeys.has('KeyE')) {
		move.add(radialUp);
	}

	if (pressedKeys.has('KeyQ')) {
		move.addScaledVector(radialUp, -1);
	}

	if (move.lengthSq() > 0) {
		move.normalize();

		const heightAboveSurface = camera.position.length() - PLANET_RADIUS;

		const baseSpeed = THREE.MathUtils.lerp(
			0.45,
			6.5,
			THREE.MathUtils.clamp(heightAboveSurface / 5.0, 0.0, 1.0),
		);

		const speedMultiplier =
			      pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')
			      ? 4.0
			      : 1.0;

		camera.position.addScaledVector(
			move,
			baseSpeed * speedMultiplier * deltaSeconds,
		);

		clampFlightCameraDistance();
	}
}

function applyFlightMouseLook(
	movementX: number,
	movementY: number,
): void {
	if (cameraMode !== 'flight' && cameraMode !== 'cinematic') {
		return;
	}

	if (!isMouseLooking && document.pointerLockElement !== renderer.domElement) {
		return;
	}

	const sensitivity = 0.0022;

	const radialUp = camera.position.clone()
		.normalize();

	const right = new THREE.Vector3(1, 0, 0)
		.applyQuaternion(camera.quaternion)
		.normalize();

	scratchQuaternionA.setFromAxisAngle(
		radialUp,
		-movementX * sensitivity,
	);

	scratchQuaternionB.setFromAxisAngle(
		right,
		-movementY * sensitivity,
	);

	camera.quaternion
		.premultiply(scratchQuaternionA)
		.premultiply(scratchQuaternionB)
		.normalize();
}

// Light / Sun
// Hinweis: Deine Custom-Shader nutzen primär SUN_DIRECTION.
// Das Licht bleibt hier als optionaler Scene-/Debug-Bestandteil.
const sunLight = new THREE.DirectionalLight(0xffffff, 4.2);

sunLight.position.copy(
	SUN_DIRECTION.clone()
		.multiplyScalar(SUN_DISTANCE),
);

scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x223344, 0.08);
scene.add(ambientLight);

function resizeRenderer(): void {
	const width  = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize(width, height);
	renderQuality.forceMoving();

	starBackground.dispatchEvent(new Event('force-redraw'));
}

window.addEventListener('resize', resizeRenderer);

if (testMode) {
	hud.textContent = 'Feature Lab';

	const featureLab = new FeatureLab({
		scene,
		camera,
		controls,
		renderer,
		rendererMode,
		settingsStore,
		initialSceneId: new URLSearchParams(window.location.search).get('scene'),
	});

	function animateFeatureLab(timestamp?: number): void {
		requestAnimationFrame(animateFeatureLab);

		timer.update(timestamp);

		const deltaSeconds = Math.min(timer.getDelta(), 0.05);

		controls.update();
		renderQuality.update(deltaSeconds);
		featureLab.update(deltaSeconds);

		if (postProcessingEnabled) {
			void postProcessing.render();
		} else {
			void renderFrame(renderer, scene, camera);
		}
	}

	resizeRenderer();
	animateFeatureLab();
} else if (gameMode) {
	let singleplayerState = loadOrCreateSingleplayerState({
		seed: currentPlanetSeed,
	});
	const gamePrototype = new GamePrototypeScene({
		                                             scene,
		                                             camera,
		                                             controls,
		                                             domElement: renderer.domElement,
		                                             hud,
		                                             seed: currentPlanetSeed,
		                                             rendererMode,
		                                             renderer,
		                                             initialWorld: singleplayerState.world,
		                                             onWorldChanged: (world) => {
			                                             singleplayerState = {
				                                             ...singleplayerState,
				                                             world,
				                                             playerProfile: {
					                                             ...singleplayerState.playerProfile,
					                                             ownedSystems: world.nodes
						                                             .filter((node) => node.owner === 'player')
						                                             .map((node) => node.id),
					                                             fleets: world.fleets
						                                             .filter((fleet) => fleet.factionId === 'player')
						                                             .map((fleet) => fleet.id),
				                                             },
			                                             };
			                                             saveSingleplayerState(singleplayerState);
		                                             },
	                                             });

	function animateGame(timestamp?: number): void {
		requestAnimationFrame(animateGame);

		timer.update(timestamp);

		const deltaSeconds = Math.min(timer.getDelta(), 0.05);

		controls.update();
		renderQuality.update(deltaSeconds);
		gamePrototype.update(deltaSeconds);

		if (postProcessingEnabled) {
			void postProcessing.render();
		} else {
			void renderFrame(renderer, scene, camera);
		}
	}

	resizeRenderer();
	animateGame();
} else {
// Planet
	const terrainBakeManager =
		      rendererMode === 'webgpu'
		      ? new TerrainTextureBakeManager(
			      renderer,
			      rendererMode,
		      )
		      : null;

	let terrainTextureSet    = null;
	let isChangingPlanetSeed = false;

	type PlanetRuntimeDefinition = ReturnType<typeof generatePlanetDefinition>;

	function createPlanetDefinitionForSeed(
		seed: number,
	): PlanetRuntimeDefinition {
		const planetDefinition = generatePlanetDefinition(
			seed,
			{
				name: `Mira ${seed}`,
				semiMajorAxis: 1.0,
				starIrradiance: 1.0,
				forcePlanetClass:
					forcedPlanetKind === 'auto'
					? undefined
					: forcedPlanetKind,
			},
		);

		if (getForcedSurfaceKind() !== 'lava') {
			return planetDefinition;
		}

		/*
		 * Phase 7c clean lava:
		 *
		 * Force lava at the definition source, not inside the material.
		 * This makes PlanetRenderProfile + SurfaceRenderProfile + HUD agree.
		 */
		return {
			...planetDefinition,
			class: 'lava',
			composition: {
				...planetDefinition.composition,
				rock: Math.max(planetDefinition.composition.rock, 0.62),
				metal: Math.max(planetDefinition.composition.metal, 0.18),
				water: 0.0,
				ice: 0.0,
				gas: Math.min(planetDefinition.composition.gas, 0.08),
				volatiles: Math.max(planetDefinition.composition.volatiles, 0.10),
			},
			atmosphere: {
				...planetDefinition.atmosphere,
				type: 'thin',
				density: Math.max(planetDefinition.atmosphere.density, 0.34),
				pressure: Math.max(planetDefinition.atmosphere.pressure, 0.18),
				cloudCoverage: Math.max(planetDefinition.atmosphere.cloudCoverage, 0.18),
				haze: Math.max(planetDefinition.atmosphere.haze, 0.42),
				color: 'ash_clouds',
			},
			surface: {
				...planetDefinition.surface,
				hasSolidSurface: true,
				hasOcean: false,
				hasIceCaps: false,
				hasVolcanism: true,
				hasTectonics: true,
				terrainRoughness: Math.max(planetDefinition.surface.terrainRoughness, 0.78),
				mountainScale: Math.max(planetDefinition.surface.mountainScale, 1.35),
				oceanLevel: -1.0,
			},
			climate: {
				...planetDefinition.climate,
				temperature01: Math.max(planetDefinition.climate.temperature01, 0.86),
				humidity: Math.min(planetDefinition.climate.humidity, 0.16),
				aridity: Math.max(planetDefinition.climate.aridity, 0.82),
				windStrength: Math.max(planetDefinition.climate.windStrength, 0.46),
				stormActivity: Math.max(planetDefinition.climate.stormActivity, 0.36),
				cloudPersistence: Math.max(planetDefinition.climate.cloudPersistence, 0.28),
				ashLoad: Math.max(planetDefinition.climate.ashLoad, 0.72),
			},
		};
	}

	async function bakeTerrainTextureSetForDefinition(
		planetDefinition: PlanetRuntimeDefinition,
	) {
		if (!terrainBakeManager) {
			return null;
		}

		console.time('terrain-gpu-bake');

		const nextTerrainTextureSet = await terrainBakeManager.bake({
			                                                            resolution: 2048,
			                                                            maxEncodedHeight: 0.42,
			                                                            terrainSeed: planetDefinition.render.terrainSeed,
			                                                            terrainProfile: resolveTerrainProfileKind(
				                                                            planetDefinition.class,
			                                                            ),
		                                                            });

		console.timeEnd('terrain-gpu-bake');

		console.log(
			'terrainTextureSet',
			nextTerrainTextureSet,
		);

		return nextTerrainTextureSet;
	}

	async function createPlanetForSeed(
		seed: number,
	): Promise<Planet> {
		const planetDefinition = createPlanetDefinitionForSeed(
			seed,
		);

		const planetRenderProfile = createPlanetRenderProfile(
			planetDefinition,
		);

		const nextTerrainTextureSet =
			      await bakeTerrainTextureSetForDefinition(
				      planetDefinition,
			      );

		terrainTextureSet?.dispose?.();
		terrainTextureSet = nextTerrainTextureSet;

		console.log('planetSeed', seed);
		console.log('planetDefinition', planetDefinition);
		console.log('planetRenderProfile', planetRenderProfile);

		return new Planet(
			PLANET_RADIUS,
			rendererMode,
			terrainTextureSet,
			{},
			planetDefinition,
			planetRenderProfile,
		);
	}

	let planet                                  = await createPlanetForSeed(
		currentPlanetSeed,
	);
	let currentRenderTuning: PlanetRenderTuning = planet.getRenderTuning();

	scene.add(planet.group);
	planet.setRenderTuning(currentRenderTuning);
	writePlanetSeedToUrl(currentPlanetSeed);
	writeForcedKindToUrl();

	let renderTuningPanel: RenderTuningPanel | null = null;

	function setForcedPlanetKind(
		planetKind: ForcedPlanetKind,
	): void {
		forcedPlanetKind = planetKind;
		void setPlanetSeed(currentPlanetSeed);
	}

	if (renderTuningPanelEnabled) {
		renderTuningPanel = new RenderTuningPanel({
			                                          initialTuning: currentRenderTuning,
			                                          getSeed: () => currentPlanetSeed,
			                                          getClass: () => forcedPlanetKind,
			                                          getRendererMode: () => rendererMode,
			                                          onTuningChange: (tuning) => {
				                                          currentRenderTuning = {
					                                          ...currentRenderTuning,
					                                          ...tuning,
				                                          };
				                                          planet.setRenderTuning(currentRenderTuning);
				                                          renderQuality.forceMoving();
			                                          },
			                                          onClassChange: (planetClass) => {
				                                          setForcedPlanetKind(planetClass);
			                                          },
			                                          onSeedChange: (seed) => {
				                                          void setPlanetSeed(seed);
			                                          },
		                                          });
	}

	async function setPlanetSeed(seed: number): Promise<void> {
		if (isChangingPlanetSeed) {
			return;
		}

		isChangingPlanetSeed = true;

		const nextSeed = Math.max(
			1,
			Math.floor(seed),
		);

		try {
			const previousPlanet = planet;

			currentPlanetSeed = nextSeed;

			const nextPlanet = await createPlanetForSeed(
				currentPlanetSeed,
			);

			scene.add(nextPlanet.group);
			scene.remove(previousPlanet.group);
			previousPlanet.dispose();

			planet = nextPlanet;
			planet.setRenderTuning(currentRenderTuning);
			renderTuningPanel?.updateMeta();

			writePlanetSeedToUrl(currentPlanetSeed);
			writeForcedKindToUrl();
			renderQuality.forceMoving();
		} finally {
			isChangingPlanetSeed = false;
		}
	}

	function nextPlanetSeed(): void {
		void setPlanetSeed(
			currentPlanetSeed + 1,
		);
	}

	function previousPlanetSeed(): void {
		void setPlanetSeed(
			Math.max(1, currentPlanetSeed - 1),
		);
	}

	function randomPlanetSeed(): void {
		void setPlanetSeed(
			Math.floor(
				Math.random() * 2_147_483_647,
			) + 1,
		);
	}


	function toggleForcedGasGiant(): void {
		forcedPlanetKind =
			forcedPlanetKind === 'gas_giant'
			? 'auto'
			: 'gas_giant';

		void setPlanetSeed(currentPlanetSeed);
	}

	function cycleForcedPlanetKind(): void {
		if (forcedPlanetKind === 'auto') {
			forcedPlanetKind = FORCED_PLANET_CLASSES[0];
			void setPlanetSeed(currentPlanetSeed);
			return;
		}

		const currentIndex = FORCED_PLANET_CLASSES.indexOf(
			forcedPlanetKind,
		);

		if (currentIndex < 0 || currentIndex >= FORCED_PLANET_CLASSES.length - 1) {
			forcedPlanetKind = 'auto';
		} else {
			forcedPlanetKind = FORCED_PLANET_CLASSES[currentIndex + 1];
		}

		void setPlanetSeed(currentPlanetSeed);
	}

// Keyboard controls
	window.addEventListener('keydown', (event) => {
		pressedKeys.add(event.code);

		const handledKeys = [
			'Equal',
			'NumpadAdd',
			'Minus',
			'NumpadSubtract',
			'KeyW',
			'KeyS',
			'KeyA',
			'KeyD',
			'KeyQ',
			'KeyE',
			'KeyF',
			'KeyG',
			'KeyC',
			'KeyV',
			'KeyH',
			'KeyT',
			'KeyN',
			'KeyB',
			'KeyR',
			'KeyP',
			'KeyY',
			'KeyZ',
			'ShiftLeft',
			'ShiftRight',
		];

		if (handledKeys.includes(event.code)) {
			event.preventDefault();
		}

		if (event.repeat) {
			return;
		}

		switch (event.code) {
			case 'KeyF':
				toggleCameraMode();
				break;

			case 'KeyG':
				enterCinematicLowOrbitMode();
				break;

			case 'Equal':
			case 'NumpadAdd':
				if (cameraMode === 'orbit') {
					zoomCamera(0.38);
					renderQuality.forceMoving();
				}
				break;

			case 'Minus':
			case 'NumpadSubtract':
				if (cameraMode === 'orbit') {
					zoomCamera(-0.38);
					renderQuality.forceMoving();
				}
				break;

			case 'KeyW':
				if (cameraMode === 'orbit') {
					zoomCamera(0.38);
					renderQuality.forceMoving();
				}
				break;

			case 'KeyS':
				if (cameraMode === 'orbit') {
					zoomCamera(-0.38);
					renderQuality.forceMoving();
				}
				break;

			case 'KeyT': {
				const enabled = planet.toggleBakedTerrain();

				console.log(
					`baked terrain ${enabled ? 'enabled' : 'disabled'}`,
				);

				renderQuality.forceMoving();
				break;
			}

			case 'KeyN':
				nextPlanetSeed();
				break;

			case 'KeyB':
				previousPlanetSeed();
				break;

			case 'KeyR':
				randomPlanetSeed();
				break;

			case 'KeyP':
				cycleForcedPlanetKind();
				break;

			case 'KeyY':
			case 'KeyZ':
				toggleForcedGasGiant();
				break;

			case 'KeyH':
				hudVisible        = !hudVisible;
				hud.style.display = hudVisible ? 'block' : 'none';
				break;

			case 'KeyC':
				climateDebug.toggle();
				break;

			case 'KeyV':
				climateDebug.cycleMode();
				break;
		}
	});

	window.addEventListener('keyup', (event) => {
		pressedKeys.delete(event.code);
	});

	renderer.domElement.addEventListener('mousedown', (event) => {
		if (cameraMode !== 'flight' && cameraMode !== 'cinematic') {
			return;
		}

		if (event.button !== 0) {
			return;
		}

		isMouseLooking = true;

		renderer.domElement.requestPointerLock?.();
		renderQuality.forceMoving();
	});

	window.addEventListener('mouseup', () => {
		isMouseLooking = false;

		if (document.pointerLockElement === renderer.domElement) {
			document.exitPointerLock?.();
		}
	});

	window.addEventListener('mousemove', (event) => {
		applyFlightMouseLook(
			event.movementX,
			event.movementY,
		);
	});

	function updateHud(): void {
		if (!hudVisible) {
			return;
		}

		const distanceFromCenter  = camera.position.length();
		const heightAboveSurface  = distanceFromCenter - PLANET_RADIUS;
		const terrainStats        = planet.getTerrainStats();
		const horizonStats        = terrainStats.horizon;
		const terrainTextureStats = planet.getTerrainTextureStats();
		const featureStats        = planet.getRenderFeatureStats();
		const definitionStats     = planet.getPlanetDefinitionStats();

		const horizonCullPercent =
			      horizonStats.tested > 0
			      ? (horizonStats.culled / horizonStats.tested) * 100
			      : 0;

		const atmosphereHint =
			      heightAboveSurface <= PLANET_RADIUS * 0.35
			      ? 'atmo: inside/low'
			      : heightAboveSurface <= PLANET_RADIUS * 1.25
			        ? 'atmo: approach'
			        : 'atmo: orbit';

		hud.textContent =
			`mode: ${cameraMode.toUpperCase()} | renderer: ${rendererMode.toUpperCase()} | ${atmosphereHint}\n` +
			`seed: ${currentPlanetSeed} | kind: ${forcedPlanetKind}${isChangingPlanetSeed ? ' | rebaking...' : ''}\n` +
			`distance: ${distanceFromCenter.toFixed(2)} | ` +
			`height: ${heightAboveSurface.toFixed(2)} | ` +
			`fov: ${camera.fov.toFixed(0)}\n` +
			`patches: ${terrainStats.visibleMeshes}/${terrainStats.totalPatches} | ` +
			`lod: ${terrainStats.maxLevel}\n` +
			`balance: splits ${terrainStats.balance.splits} | ` +
			`passes ${terrainStats.balance.passes} | ` +
			`violations ${terrainStats.balance.violations}\n` +
			`horizon: ${horizonStats.culled}/${horizonStats.tested} culled ` +
			`(${horizonCullPercent.toFixed(0)}%) | ` +
			`visible: ${horizonStats.visible} | ` +
			`near: ${horizonStats.forcedVisibleNearSurface}\n` +
			`quality: ${renderQuality.state} | px: ${renderQuality.getPixelRatio()
				.toFixed(2)}\n` +
			(
				definitionStats.available
				? `planet: ${definitionStats.name} | ${definitionStats.class} | ${definitionStats.rendererKind}\n` +
			`composition: rock ${(definitionStats.composition.rock * 100).toFixed(0)}% | ` +
			`metal ${(definitionStats.composition.metal * 100).toFixed(0)}% | ` +
			`water ${(definitionStats.composition.water * 100).toFixed(0)}% | ` +
			`ice ${(definitionStats.composition.ice * 100).toFixed(0)}% | ` +
			`gas ${(definitionStats.composition.gas * 100).toFixed(0)}%\n` +
			`atmo: ${definitionStats.atmosphere.type} | ` +
			`clouds ${(definitionStats.atmosphere.cloudCoverage * 100).toFixed(0)}% | ` +
			`rings: ${definitionStats.rings ? 'yes' : 'no'} | ` +
			`moons: ${definitionStats.moons}\n` +
			`profile: terrain ${definitionStats.render.enableTerrain ? 'on' : 'off'} | ` +
			`ocean ${definitionStats.render.enableOcean ? 'on' : 'off'} | ` +
			`clouds ${definitionStats.render.enableClouds ? 'on' : 'off'} | ` +
			`atmo ${definitionStats.render.enableAtmosphere ? 'on' : 'off'}\n` +
			`profile values: cloud ${(definitionStats.render.cloudCoverage * 100).toFixed(0)}% | ` +
			`atmo ${definitionStats.render.atmosphereDensity.toFixed(2)} | ` +
			`ocean ${definitionStats.render.oceanLevel.toFixed(2)} | ` +
			`mountain ${definitionStats.render.mountainScale.toFixed(2)}\n` +
			`terrain seed: ${definitionStats.terrainSeed}\n` +
			`climate seeds: climate ${definitionStats.climate.seed} | ` +
			`biome ${definitionStats.climate.biomeSeed} | ` +
			`weather ${definitionStats.climate.weatherSeed}\n` +
			`climate: temp ${(definitionStats.climate.temperature01 * 100).toFixed(0)}% | ` +
			`humid ${(definitionStats.climate.humidity * 100).toFixed(0)}% | ` +
			`arid ${(definitionStats.climate.aridity * 100).toFixed(0)}% | ` +
			`wind ${(definitionStats.climate.windStrength * 100).toFixed(0)}% | ` +
			`storm ${(definitionStats.climate.stormActivity * 100).toFixed(0)}% | ` +
			`ash ${(definitionStats.climate.ashLoad * 100).toFixed(0)}%\n` +
			`surface: ${definitionStats.surfaceProfile.palette} | ` +
			`ice ${definitionStats.surfaceProfile.hasIceCaps ? 'yes' : 'no'} | ` +
			`volcano ${definitionStats.surfaceProfile.hasVolcanism ? 'yes' : 'no'} | ` +
			`tectonics ${definitionStats.surfaceProfile.hasTectonics ? 'yes' : 'no'} | ` +
			`occ ${definitionStats.surfaceProfile.raymarchOcclusionStrength.toFixed(2)}\n` +
			`near terrain: ${definitionStats.nearSurfaceTerrain.visible
			                 ? 'visible'
			                 : definitionStats.nearSurfaceTerrain.enabled ? 'ready' : 'off'} | ` +
			`res ${definitionStats.nearSurfaceTerrain.resolution} | ` +
			`size ${definitionStats.nearSurfaceTerrain.patchSize.toFixed(2)} | ` +
			`height ${definitionStats.nearSurfaceTerrain.height.toFixed(2)}\n`
				: ''
			) +
			`raymarch: clouds ${featureStats.clouds.raymarched ? featureStats.clouds.steps : 'off'} | ` +
			`atmo ${featureStats.atmosphere.raymarched ? featureStats.atmosphere.steps : 'off'} | ` +
			`surface ${featureStats.surface.raymarched ? featureStats.surface.steps : 'off'}\n` +
			(
				terrainTextureStats.available
				? `terrain atlas: ${terrainTextureStats.enabled ? 'baked' : 'procedural'} | ` +
			`${terrainTextureStats.resolution}px face | ` +
			`${terrainTextureStats.atlasWidth}x${terrainTextureStats.atlasHeight}\n`
				: ''
			) +
			`keys: F flight/orbit | G cinematic | T terrain | N/B/R seed | P class | Y gas | W/S A/D Q/E | mouse-drag look | H hud`;
	}

// Animation loop
	function animate(timestamp?: number): void {
		requestAnimationFrame(animate);

		timer.update(timestamp);

		const deltaSeconds = Math.min(timer.getDelta(), 0.05);

		if (cameraMode === 'orbit') {
			controls.update();
		} else {
			updateFlightCamera(deltaSeconds);
		}

		renderQuality.update(deltaSeconds);

		planet.setRenderQuality(
			renderQuality.state === 'moving' ? 'moving' : 'idle',
		);

		planet.update(camera.position, deltaSeconds);

		updateHud();

		if (postProcessingEnabled) {
			void postProcessing.render();
		} else {
			void renderFrame(renderer, scene, camera);
		}
	}

	resizeRenderer();
	animate();
}

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		window.location.reload();
	});
}
