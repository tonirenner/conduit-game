import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createClimateDebugCanvas} from './scene/createClimateDebugCanvas';
import {createStarBackground} from './scene/createStarBackground';
import {Planet} from './planet/Planet';
import {SUN_DIRECTION, SUN_DISTANCE} from './planet/Sun';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
	throw new Error('App container #app wurde nicht gefunden.');
}

const PLANET_RADIUS       = 3;
const MIN_CAMERA_DISTANCE = PLANET_RADIUS + 0.42;
const MAX_CAMERA_DISTANCE = 60;

const timer = new THREE.Timer();
timer.connect(document);

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
	58,
	window.innerWidth / window.innerHeight,
	0.05,
	2000,
);

camera.position.set(0.35, 3.65, 10.6);

// Renderer
const renderer = new THREE.WebGLRenderer({
	                                         antialias: true,
	                                         alpha: true,
	                                         premultipliedAlpha: false,
	                                         powerPreference: 'high-performance',
                                         });

renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;

renderer.domElement.style.position   = 'fixed';
renderer.domElement.style.inset      = '0';
renderer.domElement.style.zIndex     = '2';
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display    = 'block';

app.appendChild(renderer.domElement);

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

controls.minDistance = MIN_CAMERA_DISTANCE;
controls.maxDistance = MAX_CAMERA_DISTANCE;

controls.enableZoom = true;
controls.zoomSpeed  = 1.15;

controls.enablePan = false;

controls.rotateSpeed = 0.58;

controls.update();

function zoomCamera(amount: number): void {
	const direction = new THREE.Vector3()
		.subVectors(controls.target, camera.position)
		.normalize();

	camera.position.addScaledVector(direction, amount);

	const distanceToTarget = camera.position.distanceTo(controls.target);

	if (distanceToTarget < MIN_CAMERA_DISTANCE) {
		camera.position
			.sub(controls.target)
			.normalize()
			.multiplyScalar(MIN_CAMERA_DISTANCE)
			.add(controls.target);
	}

	if (distanceToTarget > MAX_CAMERA_DISTANCE) {
		camera.position
			.sub(controls.target)
			.normalize()
			.multiplyScalar(MAX_CAMERA_DISTANCE)
			.add(controls.target);
	}

	controls.update();
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

// Planet
const planet = new Planet(PLANET_RADIUS);
scene.add(planet.group);

function resizeRenderer(): void {
	const width  = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

	starBackground.dispatchEvent(new Event('force-redraw'));
}

// Resize
window.addEventListener('resize', resizeRenderer);

// Keyboard controls
window.addEventListener('keydown', (event) => {
	const zoomKeys = [
		'Equal',
		'NumpadAdd',
		'Minus',
		'NumpadSubtract',
		'KeyW',
		'KeyS',
	];

	if ([...zoomKeys, 'KeyC', 'KeyV', 'KeyH'].includes(event.code)) {
		event.preventDefault();
	}

	switch (event.code) {
		case 'Equal':
		case 'NumpadAdd':
		case 'KeyW':
			zoomCamera(0.38);
			break;

		case 'Minus':
		case 'NumpadSubtract':
		case 'KeyS':
			zoomCamera(-0.38);
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

function updateHud(): void {
	if (!hudVisible) {
		return;
	}

	const distanceFromCenter = camera.position.length();
	const heightAboveSurface = distanceFromCenter - PLANET_RADIUS;
	const terrainStats       = planet.getTerrainStats();

	hud.textContent =
		`distance: ${distanceFromCenter.toFixed(2)} | ` +
		`height: ${heightAboveSurface.toFixed(2)}\n` +
		`patches: ${terrainStats.visibleMeshes}/${terrainStats.totalPatches} | ` +
		`lod: ${terrainStats.maxLevel}\n` +
		`keys: W/S or +/- | H hud`;
}

// Animation loop
function animate(timestamp?: number): void {
	requestAnimationFrame(animate);

	timer.update(timestamp);

	const deltaSeconds = Math.min(timer.getDelta(), 0.05);

	planet.update(camera.position, deltaSeconds);

	controls.update();

	updateHud();

	renderer.render(scene, camera);
}

resizeRenderer();
animate();

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		window.location.reload();
	});
}
