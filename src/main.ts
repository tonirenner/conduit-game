import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createClimateDebugCanvas } from './scene/createClimateDebugCanvas';
import { createStarBackground } from './scene/createStarBackground';
import { Planet } from './planet/Planet';
import { SUN_DIRECTION, SUN_DISTANCE } from './planet/Sun';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
	throw new Error('App container #app wurde nicht gefunden.');
}

const PLANET_RADIUS = 3;

const ORBIT_MIN_CAMERA_DISTANCE = PLANET_RADIUS + 0.42;
const ORBIT_MAX_CAMERA_DISTANCE = 60;

const FLIGHT_MIN_HEIGHT = 0.08;
const FLIGHT_START_HEIGHT = 0.62;
const FLIGHT_MAX_DISTANCE = 80;

const timer = new THREE.Timer();
timer.connect(document);

THREE.ColorManagement.enabled = true;

// Star background
const starBackground = createStarBackground();
document.body.appendChild(starBackground);

// App layer
app.style.position = 'fixed';
app.style.inset = '0';
app.style.zIndex = '1';
app.style.background = 'transparent';
app.style.overflow = 'hidden';

// Scene
const scene = new THREE.Scene();
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

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;

renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '2';
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display = 'block';

app.appendChild(renderer.domElement);

// HUD
const hud = document.createElement('div');
let hudVisible = true;

hud.textContent = 'HUD loading...';

hud.style.position = 'fixed';
hud.style.left = '12px';
hud.style.bottom = '12px';
hud.style.zIndex = '9999';
hud.style.padding = '8px 10px';
hud.style.fontFamily = 'monospace';
hud.style.fontSize = '12px';
hud.style.lineHeight = '1.4';
hud.style.whiteSpace = 'pre';
hud.style.color = '#d8ecff';
hud.style.background = 'rgba(0, 0, 0, 0.48)';
hud.style.border = '1px solid rgba(120, 180, 255, 0.32)';
hud.style.borderRadius = '6px';
hud.style.pointerEvents = 'none';
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

controls.minDistance = ORBIT_MIN_CAMERA_DISTANCE;
controls.maxDistance = ORBIT_MAX_CAMERA_DISTANCE;

controls.enableZoom = true;
controls.zoomSpeed = 1.15;

controls.enablePan = false;

controls.rotateSpeed = 0.58;

controls.update();

type CameraMode = 'orbit' | 'flight';

let cameraMode: CameraMode = 'orbit';

const pressedKeys = new Set<string>();

let isMouseLooking = false;

const scratchVectorA = new THREE.Vector3();
const scratchVectorB = new THREE.Vector3();
const scratchVectorC = new THREE.Vector3();
const scratchQuaternionA = new THREE.Quaternion();
const scratchQuaternionB = new THREE.Quaternion();

function getRadialUp(position: THREE.Vector3): THREE.Vector3 {
	return scratchVectorA.copy(position).normalize();
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

	controls.enabled = false;
	isMouseLooking = false;

	const radialUp = camera.position.clone().normalize();

	if (!Number.isFinite(radialUp.x)) {
		radialUp.set(0, 1, 0);
	}

	const right = new THREE.Vector3();
	const forward = new THREE.Vector3();

	getStableTangentBasis(radialUp, right, forward);

	camera.position
		.copy(radialUp)
		.multiplyScalar(PLANET_RADIUS + FLIGHT_START_HEIGHT);

	const lookTarget = camera.position
		.clone()
		.addScaledVector(forward, 7.0)
		.addScaledVector(radialUp, -0.18);

	camera.lookAt(lookTarget);
}

function exitFlightMode(): void {
	cameraMode = 'orbit';

	isMouseLooking = false;
	controls.enabled = true;

	controls.target.set(0, 0, 0);

	const distance = camera.position.length();

	if (distance < ORBIT_MIN_CAMERA_DISTANCE) {
		camera.position
			.normalize()
			.multiplyScalar(ORBIT_MIN_CAMERA_DISTANCE);
	}

	controls.update();
}

function toggleCameraMode(): void {
	if (cameraMode === 'orbit') {
		enterFlightMode();
		return;
	}

	exitFlightMode();
}

function clampFlightCameraDistance(): void {
	const distance = camera.position.length();
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
	if (cameraMode !== 'flight') {
		return;
	}

	const move = scratchVectorA.set(0, 0, 0);

	const forward = scratchVectorB;
	camera.getWorldDirection(forward).normalize();

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
	if (cameraMode !== 'flight') {
		return;
	}

	if (!isMouseLooking && document.pointerLockElement !== renderer.domElement) {
		return;
	}

	const sensitivity = 0.0022;

	const radialUp = camera.position.clone().normalize();

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

// Planet
const planet = new Planet(PLANET_RADIUS);
scene.add(planet.group);

function resizeRenderer(): void {
	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	starBackground.dispatchEvent(new Event('force-redraw'));
}

// Resize
window.addEventListener('resize', resizeRenderer);

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
		'KeyC',
		'KeyV',
		'KeyH',
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

		case 'Equal':
		case 'NumpadAdd':
			if (cameraMode === 'orbit') {
				zoomCamera(0.38);
			}
			break;

		case 'Minus':
		case 'NumpadSubtract':
			if (cameraMode === 'orbit') {
				zoomCamera(-0.38);
			}
			break;

		case 'KeyW':
			if (cameraMode === 'orbit') {
				zoomCamera(0.38);
			}
			break;

		case 'KeyS':
			if (cameraMode === 'orbit') {
				zoomCamera(-0.38);
			}
			break;

		case 'KeyH':
			hudVisible = !hudVisible;
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
	if (cameraMode !== 'flight') {
		return;
	}

	if (event.button !== 0) {
		return;
	}

	isMouseLooking = true;

	renderer.domElement.requestPointerLock?.();
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

	const distanceFromCenter = camera.position.length();
	const heightAboveSurface = distanceFromCenter - PLANET_RADIUS;
	const terrainStats = planet.getTerrainStats();

	const atmosphereHint =
		      heightAboveSurface <= PLANET_RADIUS * 0.35
		      ? 'atmo: inside/low'
		      : heightAboveSurface <= PLANET_RADIUS * 1.25
		        ? 'atmo: approach'
		        : 'atmo: orbit';

	hud.textContent =
		`mode: ${cameraMode.toUpperCase()} | ${atmosphereHint}\n` +
		`distance: ${distanceFromCenter.toFixed(2)} | ` +
		`height: ${heightAboveSurface.toFixed(2)}\n` +
		`patches: ${terrainStats.visibleMeshes}/${terrainStats.totalPatches} | ` +
		`lod: ${terrainStats.maxLevel}\n` +
		`keys: F mode | W/S A/D Q/E | mouse-drag look | H hud`;
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

	planet.update(camera.position, deltaSeconds);

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
