import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
	Planet,
	type PlanetRendererMode,
} from '../../planet/Planet';
import { createPlanetRenderProfile } from '../../planet/rendering/PlanetRenderProfile';
import { SystemNebulaBackdrop } from './SystemNebulaBackdrop';
import { WormholeNodeVisual } from './WormholeNodeVisual';
import { DynamicEnvironmentProbe } from './DynamicEnvironmentProbe';
import { generateGameWorld } from '../generation/GameWorldGenerator';
import type {
	Fleet,
	GameWorld,
	OrbitalStationDefinition,
	ShipDefinition,
	StrategicNode,
} from '../model/GameWorld';
import {
	addShipyardStation,
	buildShipAtShipyard,
	setFleetAttackOrder,
	setFleetStrategicMoveOrder,
	setFleetTacticalMoveOrder,
	updateFleetSimulation,
} from '../simulation/FleetSimulation';
import {
	cancelTacticalMoveDraft,
	confirmTacticalMoveDraft,
	createTacticalNavigationState,
	getTacticalMoveDraftTarget,
	startTacticalMoveDraft,
	type TacticalNavigationState,
	updateTacticalMoveDraftHeight,
} from '../navigation/TacticalNavigation';

export type GamePrototypeSceneOptions = {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	domElement: HTMLElement;
	hud: HTMLDivElement;
	seed: number;
	rendererMode: PlanetRendererMode;

	/*
	 * Optional for dynamic backdrop -> environment cubemap capture.
	 *
	 * Kept as unknown so both WebGLRenderer and experimental WebGPURenderer
	 * callsites can pass their renderer without fighting TS types here.
	 */
	renderer?: unknown;
};

type GameViewMode =
	| 'strategic'
	| 'system';

type SystemCameraMode =
	| 'pan'
	| 'orbitPlanet';

type SystemPlanetBuildJob = {
	nodeId: string;
	planet: StrategicNode['system']['planets'][number];
	radius: number;
	position: THREE.Vector3;
	preview: THREE.Object3D;
};

type BackdropPalette = {
	deep: THREE.Color;
	mid: THREE.Color;
	nebulaA: THREE.Color;
	nebulaB: THREE.Color;
	accent: THREE.Color;
};

const CAPITAL_SHIP_OBJ_URL =
	      `/models/capital_ship.obj`;
const CAPITAL_SHIP_MTL_URL =
	      `/models/capital_ship.mtl`;

const ORBITAL_HANGER_GLB_URL = `/models/orbital_hanger.glb`;
const FRIGATE_GLB_URL = `/models/frigate.glb`;

let capitalShipModelPromise: Promise<THREE.Object3D> | null = null;
let capitalShipModelWarningShown = false;

let orbitalHangerModelPromise: Promise<THREE.Object3D> | null = null;
let orbitalHangerModelWarningShown = false;

let frigateModelPromise: Promise<THREE.Object3D> | null = null;
let frigateModelWarningShown = false;

export class GamePrototypeScene {
	private world: GameWorld;
	private navigation: TacticalNavigationState;
	private readonly group = new THREE.Group();
	private readonly backdropGroup = new THREE.Group();
	private readonly environmentHdrPeakGroup = new THREE.Group();
	private readonly strategicGroup = new THREE.Group();
	private readonly systemGroup = new THREE.Group();
	private readonly systemNebulaBackdrop: SystemNebulaBackdrop;
	private environmentProbe: DynamicEnvironmentProbe | null = null;
	private readonly loadingOverlay: HTMLDivElement;
	private loadingOverlayVisible = false;
	private loadingOverlayStep = 0;
	private loadingOverlayTimer = 0;
	private loadingOverlayVisibleSeconds = 0;
	private loadingOverlayMessage = 'Com-Link wird bereitgestellt...';
	private readonly loadingOverlayMessages = [
		'Com-Link wird bereitgestellt...',
		'Sternkarten werden synchronisiert...',
		'Orbitaldaten werden empfangen...',
		'Sensorphalanx kalibriert...',
		'Flottenkanäle werden geöffnet...',
		'Systemansicht wird initialisiert...',
	];
	private readonly nodeMeshes = new Map<string, THREE.Mesh>();
	private readonly strategicNodeVisuals = new Map<string, WormholeNodeVisual>();
	private readonly shipMeshes = new Map<string, THREE.Object3D>();
	private readonly systemShipMeshes = new Map<string, THREE.Object3D>();
	private readonly stationMeshes = new Map<string, THREE.Object3D>();
	private readonly systemExitMeshes = new Map<string, THREE.Object3D>();
	private readonly systemExitVisuals = new Map<string, WormholeNodeVisual>();
	private readonly systemPlanets: Planet[] = [];
	private readonly systemPlanetCache = new Map<string, Planet[]>();
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private wormholeSpriteTexture: THREE.CanvasTexture | null = null;
	private readonly movePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	private readonly intersection = new THREE.Vector3();
	private readonly systemSunDirection = new THREE.Vector3();
	private readonly systemRenderOrigin = new THREE.Vector3();
	private readonly systemRenderShift = new THREE.Vector3();
	private readonly systemScale = 2.85;
	private readonly systemPlanetScale = 1.95;
	private readonly systemStarScale = 1.32;
	private readonly selectionRingWorldQuaternion =
		                 new THREE.Quaternion().setFromEuler(
			                 new THREE.Euler(Math.PI * 0.5, 0, 0),
		                 );
	private readonly pressedKeys = new Set<string>();
	private readonly moveMarker: THREE.Group;
	private systemMoveMarker: THREE.Group | null = null;
	private fleetMenu: HTMLDivElement | null = null;
	private fleetMenuSignature = '';
	private activeSystemNodeId: string | null = null;
	private pendingSystemPlanetBuilds: SystemPlanetBuildJob[] = [];
	private readonly loadedSystemNodeIds = new Set<string>();
	private loadingOverlayNodeId: string | null = null;
	private viewMode: GameViewMode = 'strategic';
	private systemCameraMode: SystemCameraMode = 'pan';
	private orbitFocusPlanet: Planet | null = null;
	private lastSystemPlanetClickName: string | null = null;
	private lastSystemPlanetClickTime = 0;
	private readonly savedSystemPanCameraPosition = new THREE.Vector3();
	private readonly savedSystemPanControlsTarget = new THREE.Vector3();
	private savedSystemPanCameraFov = 58;
	private hasSavedSystemPanCamera = false;
	private selectedNodeId: string | null = null;
	private selectedStationId: string | null = null;
	private lastNodeClickId: string | null = null;
	private lastNodeClickTime = 0;

	constructor(
		private readonly options: GamePrototypeSceneOptions,
	) {
		this.world = generateGameWorld(options.seed, {
			nodeCount: 7,
		});
		this.navigation = createTacticalNavigationState();
		this.systemNebulaBackdrop = new SystemNebulaBackdrop({
			                                                     seed: options.seed,
		                                                     });
		this.loadingOverlay = this.createLoadingOverlay();
		this.group.name = 'GamePrototypeScene';
		this.backdropGroup.name = 'HomeworldStyleBackdrop';
		this.strategicGroup.name = 'StrategicMap';
		this.systemGroup.name = 'SystemView';
		this.systemGroup.visible = false;
		this.moveMarker = this.createMoveMarker();
		this.moveMarker.visible = false;

		this.group.add(this.backdropGroup);
		this.group.add(this.strategicGroup);
		this.group.add(this.systemGroup);
		this.systemGroup.add(this.systemNebulaBackdrop.group);
		this.createSpaceBackdrop();
		this.strategicGroup.add(this.moveMarker);
		this.createStrategicMap();
		this.createShipMeshes();
		this.createFleetMenu();
		document.body.appendChild(this.loadingOverlay);
		this.configureCamera();
		this.bindInput();

		options.scene.add(this.group);
		this.createDynamicEnvironmentProbe();
	}


	private createDynamicEnvironmentProbe(): void {
		if (!this.options.renderer) {
			return;
		}

		this.environmentProbe = new DynamicEnvironmentProbe({
			                                                    scene: this.options.scene,
			                                                    renderer: this.options.renderer,
			                                                    sourceGroup: this.backdropGroup,
			                                                    excludedObjects: [
				                                                    this.strategicGroup,
				                                                    this.systemGroup,
			                                                    ],
			                                                    captureOnlyObjects: [
				                                                    this.environmentHdrPeakGroup,
			                                                    ],
			                                                    resolution: 1024,
			                                                    near: 0.1,
			                                                    far: 5200,
			                                                    updateIntervalSeconds: 4.0,
			                                                    environmentIntensity: 3,
			                                                    debug:
				                                                    typeof window !== 'undefined' &&
				                                                    new URLSearchParams(window.location.search)
					                                                    .get('envProbeDebug') === '1',
		                                                    });

		this.environmentProbe.forceUpdate(this.options.camera.position);
	}



	private createLoadingOverlay(): HTMLDivElement {
		const overlay = document.createElement('div');

		overlay.style.position = 'fixed';
		overlay.style.left = '50%';
		overlay.style.top = '50%';
		overlay.style.transform = 'translate(-50%, -50%)';
		overlay.style.zIndex = '60';
		overlay.style.minWidth = '320px';
		overlay.style.padding = '18px 22px';
		overlay.style.border = '1px solid rgba(143,231,255,0.38)';
		overlay.style.borderRadius = '10px';
		overlay.style.background = 'rgba(2, 10, 18, 0.78)';
		overlay.style.color = '#d8f7ff';
		overlay.style.font = '13px/1.45 monospace';
		overlay.style.letterSpacing = '0.02em';
		overlay.style.pointerEvents = 'none';
		overlay.style.backdropFilter = 'blur(9px)';
		overlay.style.boxShadow = '0 0 28px rgba(70,180,255,0.18)';
		overlay.style.display = 'none';

		overlay.innerHTML =
			`<div style="color:#8fe7ff;margin-bottom:10px;">SYSTEM LINK</div>` +
			`<div data-loading-message>Com-Link wird bereitgestellt...</div>` +
			`<div style="height:4px;margin-top:14px;background:rgba(143,231,255,0.15);overflow:hidden;border-radius:999px;">` +
			`<div data-loading-bar style="width:24%;height:100%;background:rgba(143,231,255,0.72);border-radius:999px;transition:width 180ms ease;"></div>` +
			`</div>`;

		return overlay;
	}

	private showLoadingOverlay(
		message?: string,
		nodeId?: string,
	): void {
		this.loadingOverlayVisible = true;
		this.loadingOverlayNodeId = nodeId ?? this.activeSystemNodeId;
		this.loadingOverlayStep = 0;
		this.loadingOverlayTimer = 0;
		this.loadingOverlayVisibleSeconds = 0;
		this.loadingOverlayMessage =
			message ?? this.loadingOverlayMessages[0] ?? 'Com-Link wird bereitgestellt...';
		this.loadingOverlay.style.display = 'block';
		this.renderLoadingOverlay();
		this.logLoadingOverlayDebug('show');
	}

	private hideLoadingOverlay(): void {
		this.loadingOverlayVisible = false;
		this.loadingOverlayNodeId = null;
		this.loadingOverlay.style.display = 'none';
		this.logLoadingOverlayDebug('hide');
	}

	private updateLoadingOverlay(deltaSeconds: number): void {
		if (!this.loadingOverlayVisible) {
			return;
		}

		this.loadingOverlayTimer += deltaSeconds;
		this.loadingOverlayVisibleSeconds += deltaSeconds;

		if (
			this.isSystemViewBuildFinished() &&
			this.loadingOverlayVisibleSeconds >= 0.85
		) {
			this.markSystemViewLoaded(
				this.loadingOverlayNodeId ?? this.activeSystemNodeId,
			);
			this.logLoadingOverlayDebug('auto-hide-ready');
			this.hideLoadingOverlay();
			return;
		}

		if (this.loadingOverlayTimer < 0.62) {
			return;
		}

		this.loadingOverlayTimer = 0;
		this.loadingOverlayStep =
			(this.loadingOverlayStep + 1) %
			Math.max(1, this.loadingOverlayMessages.length);
		this.loadingOverlayMessage =
			this.loadingOverlayMessages[this.loadingOverlayStep] ??
			this.loadingOverlayMessage;
		this.renderLoadingOverlay();
	}


	private shouldShowLoadingOverlayForSystem(nodeId: string): boolean {
		return !this.loadedSystemNodeIds.has(nodeId);
	}

	private markSystemViewLoaded(nodeId: string | null): void {
		if (!nodeId) {
			return;
		}

		this.loadedSystemNodeIds.add(nodeId);
	}

	private isSystemViewBuildFinished(): boolean {
		return (
			this.viewMode !== 'system' ||
			(
				this.pendingSystemPlanetBuilds.length === 0
			)
		);
	}

	private logLoadingOverlayDebug(reason: string): void {
		if (
			typeof window === 'undefined' ||
			new URLSearchParams(window.location.search).get('loadingDebug') !== '1'
		) {
			return;
		}

		console.log('[SystemLinkOverlay]', {
			reason,
			visible: this.loadingOverlayVisible,
			visibleSeconds: this.loadingOverlayVisibleSeconds,
			messageTimer: this.loadingOverlayTimer,
			pendingJobs: this.pendingSystemPlanetBuilds.length,			viewMode: this.viewMode,
			activeSystemNodeId: this.activeSystemNodeId,
			loadingOverlayNodeId: this.loadingOverlayNodeId,
			loadedSystemNodeIds: [...this.loadedSystemNodeIds],
		});
	}



	private renderLoadingOverlay(): void {
		const message = this.loadingOverlay.querySelector('[data-loading-message]');
		const bar = this.loadingOverlay.querySelector('[data-loading-bar]');

		if (message instanceof HTMLElement) {
			message.textContent = this.loadingOverlayMessage;
		}

		if (bar instanceof HTMLElement) {
			const progress =
				      24 + (this.loadingOverlayStep % this.loadingOverlayMessages.length) *
				      (70 / Math.max(1, this.loadingOverlayMessages.length - 1));

			bar.style.width = `${Math.min(94, progress).toFixed(0)}%`;
		}
	}

	private createFleetMenu(): void {
		const menu = document.createElement('div');

		menu.style.position = 'fixed';
		menu.style.left = '12px';
		menu.style.top = '92px';
		menu.style.width = '220px';
		menu.style.maxHeight = '42vh';
		menu.style.overflow = 'auto';
		menu.style.padding = '8px';
		menu.style.border = '1px solid rgba(127,217,255,0.28)';
		menu.style.background = 'rgba(3, 10, 18, 0.72)';
		menu.style.color = '#d7f4ff';
		menu.style.font = '12px/1.35 monospace';
		menu.style.zIndex = '20';
		menu.style.pointerEvents = 'auto';
		menu.style.backdropFilter = 'blur(6px)';

		document.body.appendChild(menu);
		this.fleetMenu = menu;
		this.updateFleetMenu();
	}

	private updateFleetMenu(): void {
		if (!this.fleetMenu) {
			return;
		}

		const signature = this.getFleetMenuSignature();

		if (signature === this.fleetMenuSignature) {
			return;
		}

		this.fleetMenuSignature = signature;

		const rows = this.world.fleets
			.map((fleet) => {
				const node = this.getNode(fleet.nodeId);
				const hull = this.getFleetHullText(fleet);
				const selected = fleet.id === this.world.selectedFleetId;
				const order = this.getFleetOrderLabel(fleet);

				return (
					`<button data-fleet-id="${fleet.id}" ` +
					`style="width:100%;margin:0 0 6px 0;padding:7px 8px;` +
					`text-align:left;border:1px solid ${selected ? '#8fe7ff' : 'rgba(143,231,255,0.22)'};` +
					`background:${selected ? 'rgba(64,176,220,0.28)' : 'rgba(8,20,32,0.74)'};` +
					`color:#d7f4ff;font:12px/1.35 monospace;cursor:pointer;">` +
					`${fleet.name}<br>` +
					`${node?.name ?? 'unknown'} | ${order} | ${hull}` +
					`</button>`
				);
			})
			.join('');

		this.fleetMenu.innerHTML =
			`<div style="margin:0 0 7px 0;color:#8fe7ff;">FLEETS</div>` +
			rows;

		for (const button of this.fleetMenu.querySelectorAll('button[data-fleet-id]')) {
			button.addEventListener('click', () => {
				const fleetId = button.getAttribute('data-fleet-id');

				if (!fleetId) {
					return;
				}

				this.world = {
					...this.world,
					selectedFleetId: fleetId,
				};
				this.showSelectedFleetSystem();
				this.fleetMenuSignature = '';
				this.updateFleetMenu();
			});
		}
	}

	private showSelectedFleetSystem(): void {
		if (this.viewMode !== 'system') {
			return;
		}

		const selectedFleet = this.getSelectedFleet();

		if (!selectedFleet || selectedFleet.nodeId === this.selectedNodeId) {
			return;
		}

		const node = this.getNode(selectedFleet.nodeId);

		if (!node) {
			return;
		}

		/**
		 * Fleet-menu switch:
		 * This is effectively a system change while already inside SystemView.
		 *
		 * Do not rely on the normal enterSystemView path only. Explicitly set up
		 * the loading overlay for the target node before rebuildSystemView()
		 * clears and recreates the system objects.
		 */
		const shouldShowSystemLoading =
			      this.shouldShowLoadingOverlayForSystem(node.id);

		this.selectedNodeId = node.id;
		this.activeSystemNodeId = node.id;
		this.navigation = cancelTacticalMoveDraft(this.navigation);
		this.systemCameraMode = 'pan';
		this.orbitFocusPlanet = null;

		if (shouldShowSystemLoading) {
			this.showLoadingOverlay(
				`Com-Link zu ${node.name} wird bereitgestellt...`,
				node.id,
			);
			this.logLoadingOverlayDebug('fleet-switch-show-loading');
		}

		this.rebuildSystemView(node);
		this.configureCamera();
		this.environmentProbe?.forceUpdate(this.options.camera.position);
	}

	private getFleetMenuSignature(): string {
		return [
			this.world.selectedFleetId ?? 'none',
			...this.world.fleets.map((fleet) => (
				[
					fleet.id,
					fleet.nodeId,
					this.getFleetOrderLabel(fleet),
					this.getFleetHullText(fleet),
					fleet.shipIds.length,
				].join(':')
			)),
		].join('|');
	}

	update(deltaSeconds: number): void {
		this.world = updateFleetSimulation(this.world, deltaSeconds);
		this.ensureSelectedFleetExists();
		this.syncShipMeshes();
		this.syncSystemShipMeshes();
		this.processSystemPlanetBuildQueue();
		this.updateSystemPlanets(deltaSeconds);
		this.updateWormholeVisuals(deltaSeconds);
		this.updateKeyboardCamera(deltaSeconds);
		this.syncPlanetOrbitCameraTarget();
		this.recenterSystemViewIfNeeded();
		this.systemNebulaBackdrop.update(
			deltaSeconds,
			this.options.camera.position,
		);
		this.updateLoadingOverlay(deltaSeconds);
		this.updateSpaceBackdrop(deltaSeconds);
		this.environmentProbe?.update(
			deltaSeconds,
			this.options.camera.position,
		);
		this.syncMoveMarker();
		this.updateFleetMenu();
		this.updateHud();
	}

	private ensureSelectedFleetExists(): void {
		if (
			this.world.selectedFleetId &&
			this.world.fleets.some((fleet) => fleet.id === this.world.selectedFleetId)
		) {
			return;
		}

		this.world = {
			...this.world,
			selectedFleetId: this.world.fleets[0]?.id ?? null,
		};
	}

	dispose(): void {
		this.options.domElement.removeEventListener(
			'pointerdown',
			this.handlePointerDown,
		);
		this.options.domElement.removeEventListener(
			'contextmenu',
			this.handleContextMenu,
		);
		this.options.domElement.removeEventListener(
			'wheel',
			this.handleWheel,
		);
		window.removeEventListener(
			'keydown',
			this.handleKeyDown,
		);
		window.removeEventListener(
			'keyup',
			this.handleKeyUp,
		);
		window.removeEventListener(
			'blur',
			this.handleWindowBlur,
		);

		this.options.scene.remove(this.group);
		this.environmentProbe?.dispose();
		this.environmentProbe = null;
		this.loadingOverlay.remove();
		this.systemNebulaBackdrop.dispose();
		this.fleetMenu?.remove();
		this.fleetMenu = null;
		this.clearSystemView();

		for (const planets of this.systemPlanetCache.values()) {
			for (const planet of planets) {
				planet.dispose();
			}
		}

		this.systemPlanetCache.clear();
		this.strategicNodeVisuals.clear();
		this.systemExitVisuals.clear();
		this.wormholeSpriteTexture?.dispose();
		this.wormholeSpriteTexture = null;

		this.group.traverse((object) => {
			if (
				!(
					object instanceof THREE.Mesh ||
					object instanceof THREE.Line ||
					object instanceof THREE.Points ||
					object instanceof THREE.Sprite
				)
			) {
				return;
			}

			if (
				object instanceof THREE.Mesh ||
				object instanceof THREE.Line ||
				object instanceof THREE.Points
			) {
				object.geometry.dispose();
			}

			const material = object.material;

			if (Array.isArray(material)) {
				for (const item of material) {
					item.dispose();
				}
				return;
			}

			material.dispose();
		});
	}

	private configureCamera(): void {
		if (this.viewMode === 'system') {
			this.systemCameraMode = 'pan';
			this.orbitFocusPlanet = null;
			this.options.camera.near = 0.8;
			this.options.camera.far = 3200;
			this.options.camera.updateProjectionMatrix();
			this.options.camera.position.set(0, 78, 116);
			this.options.camera.lookAt(0, 0, 0);
			this.options.controls.target.set(0, 0, 0);
			this.options.controls.enablePan = true;
			this.options.controls.enableRotate = false;
			this.options.controls.enableZoom = false;
			this.options.controls.screenSpacePanning = true;
			this.options.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
			this.options.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
			this.options.controls.minDistance = 8;
			this.options.controls.maxDistance = 360;
			this.options.controls.update();
			this.environmentProbe?.forceUpdate(this.options.camera.position);
			return;
		}

		this.options.camera.near = 0.6;
		this.options.camera.far = 520;
		this.options.camera.updateProjectionMatrix();
		this.options.camera.position.set(0, 58, 76);
		this.options.camera.lookAt(0, 0, 0);
		this.options.controls.target.set(0, 0, 0);
		this.options.controls.enablePan = true;
		this.options.controls.enableRotate = false;
		this.options.controls.enableZoom = false;
		this.options.controls.screenSpacePanning = true;
		this.options.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
		this.options.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
		this.options.controls.minDistance = 10;
		this.options.controls.maxDistance = 180;
		this.options.controls.update();
		this.environmentProbe?.forceUpdate(this.options.camera.position);
	}

	private createSpaceBackdrop(): void {
		const palette = this.getBackdropPalette(this.options.seed);

		this.backdropGroup.add(this.createVertexColorSkydome(palette));
		this.backdropGroup.add(this.createBackdropNebulaSprites(palette));
		this.backdropGroup.add(this.createBackdropStarField(palette));
		this.backdropGroup.add(this.createEnvironmentHdrPeaks(palette));
		this.updateSpaceBackdrop(0);
	}

	private updateSpaceBackdrop(deltaSeconds: number): void {
		this.backdropGroup.position.copy(this.options.camera.position);
		this.backdropGroup.rotation.y += deltaSeconds * 0.0009;
	}

	private updateKeyboardCamera(deltaSeconds: number): void {
		if (deltaSeconds <= 0) {
			return;
		}

		if (
			this.viewMode === 'system' &&
			this.systemCameraMode === 'orbitPlanet'
		) {
			return;
		}

		this.updateKeyboardPan(deltaSeconds);
		this.updateKeyboardZoom(deltaSeconds);
	}

	private updateKeyboardPan(deltaSeconds: number): void {
		const forwardInput =
			      (this.pressedKeys.has('KeyW') ? 1 : 0) -
			      (this.pressedKeys.has('KeyS') ? 1 : 0);
		const rightInput =
			      (this.pressedKeys.has('KeyD') ? 1 : 0) -
			      (this.pressedKeys.has('KeyA') ? 1 : 0);

		if (forwardInput === 0 && rightInput === 0) {
			return;
		}

		const forward = new THREE.Vector3();
		const right = new THREE.Vector3();
		const movement = new THREE.Vector3();

		this.options.camera.getWorldDirection(forward);
		forward.y = 0;

		if (forward.lengthSq() <= 0.000001) {
			forward.set(0, 0, -1);
		}

		forward.normalize();
		right.crossVectors(forward, new THREE.Vector3(0, 1, 0))
			.normalize();

		movement.addScaledVector(forward, forwardInput);
		movement.addScaledVector(right, rightInput);

		if (movement.lengthSq() <= 0.000001) {
			return;
		}

		const distance = this.options.camera.position.distanceTo(
			this.options.controls.target,
		);
		const baseSpeed = this.viewMode === 'system' ? 42 : 30;
		const distanceScale = THREE.MathUtils.clamp(distance / 100, 0.55, 2.6);
		const speedMultiplier =
			      this.pressedKeys.has('ShiftLeft') ||
			      this.pressedKeys.has('ShiftRight')
			      ? 2.4
			      : 1.0;
		const step = baseSpeed * distanceScale * speedMultiplier * deltaSeconds;

		movement.normalize().multiplyScalar(step);
		this.options.camera.position.add(movement);
		this.options.controls.target.add(movement);
		this.options.controls.update();
	}

	private updateKeyboardZoom(deltaSeconds: number): void {
		const zoomInput =
			      (this.pressedKeys.has('KeyQ') ? 1 : 0) -
			      (this.pressedKeys.has('KeyE') ? 1 : 0);

		if (zoomInput === 0) {
			return;
		}

		const offset = new THREE.Vector3().subVectors(
			this.options.camera.position,
			this.options.controls.target,
		);
		const distance = offset.length();

		if (distance <= 0.000001) {
			return;
		}

		const minDistance = this.options.controls.minDistance;
		const maxDistance = this.options.controls.maxDistance;
		const zoomSpeed = this.viewMode === 'system' ? 74 : 52;
		const nextDistance = THREE.MathUtils.clamp(
			distance - zoomInput * zoomSpeed * deltaSeconds,
			minDistance,
			maxDistance,
		);

		offset.setLength(nextDistance);
		this.options.camera.position.copy(this.options.controls.target)
			.add(offset);
		this.options.controls.update();
	}

	private systemToRenderPosition(
		position: {
			x: number;
			y: number;
			z: number;
		},
	): THREE.Vector3 {
		return new THREE.Vector3(
			position.x,
			position.y,
			position.z,
		).sub(this.systemRenderOrigin);
	}

	private systemVectorToRenderPosition(
		position: THREE.Vector3,
	): THREE.Vector3 {
		return position.clone().sub(this.systemRenderOrigin);
	}

	private renderToSystemPosition(
		position: THREE.Vector3,
	): {
		x: number;
		y: number;
		z: number;
	} {
		return {
			x: position.x + this.systemRenderOrigin.x,
			y: position.y + this.systemRenderOrigin.y,
			z: position.z + this.systemRenderOrigin.z,
		};
	}

	private rememberSystemObjectPosition(
		object: THREE.Object3D,
		position: THREE.Vector3,
	): void {
		object.userData.systemPosition = [
			position.x,
			position.y,
			position.z,
		];
	}

	private getRememberedSystemObjectPosition(
		object: THREE.Object3D,
	): THREE.Vector3 | null {
		const position = object.userData.systemPosition;

		if (
			!Array.isArray(position) ||
			position.length < 3 ||
			typeof position[0] !== 'number' ||
			typeof position[1] !== 'number' ||
			typeof position[2] !== 'number'
		) {
			return null;
		}

		return new THREE.Vector3(
			position[0],
			position[1],
			position[2],
		);
	}

	private recenterSystemViewIfNeeded(): void {
		if (this.viewMode !== 'system') {
			return;
		}

		this.systemRenderShift.set(
			this.options.controls.target.x,
			0,
			this.options.controls.target.z,
		);

		if (this.systemRenderShift.lengthSq() < 2250000) {
			return;
		}

		this.systemRenderOrigin.add(this.systemRenderShift);

		for (const object of this.systemGroup.children) {
			object.position.sub(this.systemRenderShift);
		}

		this.options.camera.position.sub(this.systemRenderShift);
		this.options.controls.target.sub(this.systemRenderShift);

		if (this.hasSavedSystemPanCamera) {
			this.savedSystemPanCameraPosition.sub(this.systemRenderShift);
			this.savedSystemPanControlsTarget.sub(this.systemRenderShift);
		}

		this.options.controls.update();
	}

	private selectSystemPlanetFromPointer(event: PointerEvent): boolean {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			this.systemPlanets.map((planet) => planet.group),
			true,
		);

		const object = intersections[0]?.object;

		if (!object) {
			return false;
		}

		const planet = this.findSystemPlanetForObject(object);

		if (!planet) {
			return false;
		}

		const now = performance.now();
		const planetName = planet.group.name;
		const isDoubleClick =
			      planetName === this.lastSystemPlanetClickName &&
			      now - this.lastSystemPlanetClickTime < 360;

		this.lastSystemPlanetClickName = planetName;
		this.lastSystemPlanetClickTime = now;

		if (!isDoubleClick) {
			return true;
		}

		if (
			this.systemCameraMode === 'orbitPlanet' &&
			this.orbitFocusPlanet === planet
		) {
			this.exitPlanetOrbitView();
			return true;
		}

		this.enterPlanetOrbitView(planet);

		return true;
	}

	private findSystemPlanetForObject(
		object: THREE.Object3D,
	): Planet | null {
		for (const planet of this.systemPlanets) {
			let current: THREE.Object3D | null = object;

			while (current) {
				if (current === planet.group) {
					return planet;
				}

				current = current.parent;
			}
		}

		return null;
	}

	private enterPlanetOrbitView(planet: Planet): void {
		if (this.systemCameraMode !== 'orbitPlanet') {
			this.savedSystemPanCameraPosition.copy(this.options.camera.position);
			this.savedSystemPanControlsTarget.copy(this.options.controls.target);
			this.savedSystemPanCameraFov = this.options.camera.fov;
			this.hasSavedSystemPanCamera = true;
		}

		this.systemCameraMode = 'orbitPlanet';
		this.orbitFocusPlanet = planet;

		const radius = this.getSystemPlanetOrbitCameraRadius(planet);
		const direction = new THREE.Vector3(0.64, 0.32, 1.0).normalize();

		this.options.controls.enabled = true;
		this.options.controls.enablePan = false;
		this.options.controls.enableRotate = true;
		this.options.controls.enableZoom = true;
		this.options.controls.screenSpacePanning = true;
		this.options.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
		this.options.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
		this.options.controls.minDistance = radius * 1.12;
		this.options.controls.maxDistance = radius * 18.0;

		this.options.controls.target.copy(planet.group.position);
		this.options.camera.position.copy(planet.group.position)
			.addScaledVector(direction, radius * 2.25);
		this.options.camera.near = Math.max(0.015, radius * 0.006);
		this.options.camera.far = 1800;
		this.options.camera.fov = 46;
		this.options.camera.updateProjectionMatrix();
		this.options.controls.update();

		planet.setRenderQuality('idle');
	}

	private exitPlanetOrbitView(): void {
		this.systemCameraMode = 'pan';
		this.orbitFocusPlanet = null;

		this.options.controls.enablePan = true;
		this.options.controls.enableRotate = false;
		this.options.controls.enableZoom = false;
		this.options.controls.screenSpacePanning = true;
		this.options.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
		this.options.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
		this.options.controls.minDistance = 8;
		this.options.controls.maxDistance = 360;

		if (this.hasSavedSystemPanCamera) {
			this.options.camera.position.copy(this.savedSystemPanCameraPosition);
			this.options.controls.target.copy(this.savedSystemPanControlsTarget);
			this.options.camera.fov = this.savedSystemPanCameraFov;
		} else {
			this.options.camera.position.set(0, 78, 116);
			this.options.controls.target.set(0, 0, 0);
			this.options.camera.fov = 58;
		}

		this.options.camera.near = 0.8;
		this.options.camera.far = 1800;
		this.options.camera.updateProjectionMatrix();
		this.options.controls.update();
	}

	private syncPlanetOrbitCameraTarget(): void {
		if (
			this.viewMode !== 'system' ||
			this.systemCameraMode !== 'orbitPlanet' ||
			!this.orbitFocusPlanet
		) {
			return;
		}

		this.orbitFocusPlanet.setRenderQuality('idle');
		this.options.controls.target.copy(this.orbitFocusPlanet.group.position);
		this.options.controls.update();
	}

	private getSystemPlanetOrbitCameraRadius(planet: Planet): number {
		const radius = planet.group.userData.systemRenderRadius;

		if (typeof radius === 'number' && Number.isFinite(radius) && radius > 0) {
			return radius;
		}

		const box = new THREE.Box3().setFromObject(planet.group);
		const sphere = new THREE.Sphere();

		box.getBoundingSphere(sphere);

		if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
			return sphere.radius;
		}

		return 6;
	}

	private createEnvironmentHdrPeaks(palette: BackdropPalette): THREE.Group {
		this.environmentHdrPeakGroup.name = 'Environment HDR Peaks Capture Only';
		this.environmentHdrPeakGroup.visible = false;
		this.environmentHdrPeakGroup.clear();

		const hotspotTexture = this.createEnvironmentHotspotTexture();

		const hotspots = [
			{
				name: 'HDR Cyan Key',
				position: new THREE.Vector3(-210, 62, -260),
				scale: 118,
				color: new THREE.Color(0x7feaff),
				intensity: 6.8,
				opacity: 0.92,
			},
			{
				name: 'HDR Red Nebula Peak',
				position: new THREE.Vector3(165, 86, -250),
				scale: 92,
				color: palette.accent.clone().lerp(new THREE.Color(0xff4058), 0.75),
				intensity: 5.4,
				opacity: 0.72,
			},
			{
				name: 'HDR Blue Rim Peak',
				position: new THREE.Vector3(260, -32, -220),
				scale: 80,
				color: new THREE.Color(0x5aa8ff),
				intensity: 4.2,
				opacity: 0.54,
			},
			{
				name: 'HDR Soft White Star Peak',
				position: new THREE.Vector3(-52, -18, -330),
				scale: 42,
				color: new THREE.Color(0xffffff),
				intensity: 8.5,
				opacity: 0.46,
			},
		];

		for (const hotspot of hotspots) {
			const material = new THREE.SpriteMaterial({
				                                          map: hotspotTexture,
				                                          color: hotspot.color.clone().multiplyScalar(hotspot.intensity),
				                                          transparent: true,
				                                          opacity: hotspot.opacity,
				                                          blending: THREE.AdditiveBlending,
				                                          depthWrite: false,
				                                          depthTest: false,
			                                          });

			material.toneMapped = false;

			const sprite = new THREE.Sprite(material);

			sprite.name = hotspot.name;
			sprite.position.copy(hotspot.position);
			sprite.scale.set(
				hotspot.scale,
				hotspot.scale,
				1,
			);
			sprite.renderOrder = -850;

			this.environmentHdrPeakGroup.add(sprite);
		}

		return this.environmentHdrPeakGroup;
	}

	private createEnvironmentHotspotTexture(): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');

		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		const center = canvas.width * 0.5;
		const gradient = context.createRadialGradient(
			center,
			center,
			0,
			center,
			center,
			center,
		);

		gradient.addColorStop(0.00, 'rgba(255,255,255,1.00)');
		gradient.addColorStop(0.06, 'rgba(255,255,255,0.92)');
		gradient.addColorStop(0.18, 'rgba(255,255,255,0.36)');
		gradient.addColorStop(0.42, 'rgba(255,255,255,0.10)');
		gradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');

		context.fillStyle = gradient;
		context.fillRect(
			0,
			0,
			canvas.width,
			canvas.height,
		);

		const texture = new THREE.CanvasTexture(canvas);

		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
	}


	private createVertexColorSkydome(palette: BackdropPalette): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(420, 72, 36);
		const positions = geometry.getAttribute('position');
		const colors = new Float32Array(positions.count * 3);
		const vertex = new THREE.Vector3();
		const color = new THREE.Color();
		const horizonColor = palette.mid.clone().lerp(palette.nebulaA, 0.26);
		const accentColor = palette.nebulaB.clone().lerp(palette.accent, 0.32);

		for (let index = 0; index < positions.count; index++) {
			vertex.fromBufferAttribute(positions, index).normalize();

			const vertical = vertex.y * 0.5 + 0.5;
			const band = Math.exp(-Math.pow(vertex.y * 2.4, 2));
			const diagonal = Math.sin(vertex.x * 2.1 + vertex.z * 3.0 + vertex.y * 1.6);
			const swirl = Math.sin(vertex.x * 5.0 - vertex.z * 2.6 + vertex.y * 3.8);
			const nebula = THREE.MathUtils.clamp(
				band * (0.52 + diagonal * 0.26 + swirl * 0.12),
				0,
				1,
			);
			const accent = THREE.MathUtils.clamp(
				Math.pow(Math.max(0, diagonal * 0.5 + 0.5), 4.2) * band,
				0,
				1,
			);

			color.copy(palette.deep)
				.lerp(horizonColor, 0.22 + vertical * 0.18)
				.lerp(palette.nebulaA, nebula * 0.46)
				.lerp(accentColor, accent * 0.38);

			colors[index * 3] = color.r;
			colors[index * 3 + 1] = color.g;
			colors[index * 3 + 2] = color.b;
		}

		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const dome = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				                            side: THREE.BackSide,
				                            vertexColors: true,
				                            depthWrite: false,
				                            depthTest: false,
			                            }),
		);

		dome.name = 'Vertex Color Skydome';
		dome.renderOrder = -1000;

		return dome;
	}

	private createBackdropNebulaSprites(palette: BackdropPalette): THREE.Group {
		const group = new THREE.Group();
		const layers = [
			{
				color: palette.nebulaA,
				position: new THREE.Vector3(-150, 36, -270),
				scale: new THREE.Vector2(260, 118),
				opacity: 0.36,
				rotation: -0.22,
				seedOffset: 11,
			},
			{
				color: palette.nebulaB,
				position: new THREE.Vector3(190, -16, -230),
				scale: new THREE.Vector2(220, 92),
				opacity: 0.24,
				rotation: 0.34,
				seedOffset: 23,
			},
			{
				color: palette.accent,
				position: new THREE.Vector3(48, 82, -310),
				scale: new THREE.Vector2(150, 64),
				opacity: 0.18,
				rotation: 0.08,
				seedOffset: 37,
			},
		];

		group.name = 'Backdrop Nebula Layers';

		for (const layer of layers) {
			const sprite = new THREE.Sprite(
				new THREE.SpriteMaterial({
					                         map: this.createNebulaTexture(layer.color, this.options.seed + layer.seedOffset),
					                         color: layer.color,
					                         transparent: true,
					                         opacity: layer.opacity,
					                         blending: THREE.AdditiveBlending,
					                         depthWrite: false,
					                         depthTest: true,
				                         }),
			);

			sprite.name = 'Soft Nebula Billboard';
			sprite.position.copy(layer.position);
			sprite.scale.set(layer.scale.x, layer.scale.y, 1);
			sprite.material.rotation = layer.rotation;
			sprite.renderOrder = -900;
			group.add(sprite);
		}

		return group;
	}

	private createBackdropStarField(palette: BackdropPalette): THREE.Points {
		const starCount = 620;
		const positions = new Float32Array(starCount * 3);
		const colors = new Float32Array(starCount * 3);
		const color = new THREE.Color();

		for (let index = 0; index < starCount; index++) {
			const u = this.hash01(this.options.seed, index, 17);
			const v = this.hash01(this.options.seed, index, 29);
			const radius = 360 + this.hash01(this.options.seed, index, 43) * 48;
			const theta = u * Math.PI * 2;
			const phi = Math.acos(2 * v - 1);
			const sinPhi = Math.sin(phi);
			const brightness = Math.pow(this.hash01(this.options.seed, index, 71), 2.6);
			const warm = this.hash01(this.options.seed, index, 89);

			positions[index * 3] = Math.cos(theta) * sinPhi * radius;
			positions[index * 3 + 1] = Math.cos(phi) * radius;
			positions[index * 3 + 2] = Math.sin(theta) * sinPhi * radius;

			color.copy(
				warm > 0.82
				? palette.accent
				: warm < 0.18
				  ? palette.nebulaB
				  : new THREE.Color(0xddeeff),
			).lerp(new THREE.Color(0xffffff), 0.46 + brightness * 0.36);

			colors[index * 3] = color.r * (0.28 + brightness * 0.72);
			colors[index * 3 + 1] = color.g * (0.28 + brightness * 0.72);
			colors[index * 3 + 2] = color.b * (0.28 + brightness * 0.72);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const stars = new THREE.Points(
			geometry,
			new THREE.PointsMaterial({
				                         size: 1.05,
				                         sizeAttenuation: false,
				                         vertexColors: true,
				                         transparent: true,
				                         opacity: 0.76,
				                         depthWrite: false,
				                         depthTest: true,
			                         }),
		);

		stars.name = 'Backdrop Star Field';
		stars.renderOrder = -800;

		return stars;
	}

	private createNebulaTexture(
		color: THREE.Color,
		seed: number,
	): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		context.clearRect(0, 0, canvas.width, canvas.height);

		const red = Math.round(color.r * 255);
		const green = Math.round(color.g * 255);
		const blue = Math.round(color.b * 255);
		const gradient = context.createRadialGradient(
			canvas.width * 0.48,
			canvas.height * 0.50,
			0,
			canvas.width * 0.50,
			canvas.height * 0.50,
			canvas.width * 0.48,
		);

		gradient.addColorStop(0.00, `rgba(${red}, ${green}, ${blue}, 0.72)`);
		gradient.addColorStop(0.32, `rgba(${red}, ${green}, ${blue}, 0.34)`);
		gradient.addColorStop(0.68, `rgba(${red}, ${green}, ${blue}, 0.10)`);
		gradient.addColorStop(1.00, 'rgba(0, 0, 0, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		for (let index = 0; index < 72; index++) {
			const x = this.hash01(seed, index, 3) * canvas.width;
			const y = this.hash01(seed, index, 5) * canvas.height;
			const radius = 12 + this.hash01(seed, index, 7) * 52;
			const alpha = 0.025 + this.hash01(seed, index, 9) * 0.055;
			const puff = context.createRadialGradient(x, y, 0, x, y, radius);

			puff.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
			puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
			context.fillStyle = puff;
			context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
		}

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
	}

	private createStrategicMap(): void {
		const laneMaterial = new THREE.LineBasicMaterial({
			                                                 color: 0x315b7c,
			                                                 transparent: true,
			                                                 opacity: 0.72,
			                                                 depthWrite: false,
			                                                 depthTest: true,
		                                                 });

		for (const lane of this.world.lanes) {
			const from = this.getNode(lane.fromNodeId);
			const to = this.getNode(lane.toNodeId);

			if (!from || !to) {
				continue;
			}

			const geometry = new THREE.BufferGeometry().setFromPoints([
				                                                          this.nodeToVector(from, -0.02),
				                                                          this.nodeToVector(to, -0.02),
			                                                          ]);

			const line = new THREE.Line(geometry, laneMaterial.clone());
			line.name = `Lane ${lane.id}`;
			this.strategicGroup.add(line);
		}

		for (const node of this.world.nodes) {
			const position = this.nodeToVector(node, 0);
			const hitProxy = this.createStrategicNodeHitProxy(node);
			hitProxy.name = node.name;
			hitProxy.position.copy(position);

			const visual = new WormholeNodeVisual({
				                                      name: `Wormhole ${node.name}`,
				                                      radius: this.getNodeRadius(node),
				                                      owner: node.owner,
				                                      selected: node.id === this.selectedNodeId,
			                                      });

			visual.group.position.copy(position);

			this.nodeMeshes.set(node.id, hitProxy);
			this.strategicNodeVisuals.set(node.id, visual);
			this.strategicGroup.add(visual.group);
			this.strategicGroup.add(hitProxy);
		}

		const grid = new THREE.GridHelper(110, 22, 0x24445e, 0x172334);
		grid.position.y = -0.05;
		this.strategicGroup.add(grid);
	}

	private createStrategicNodeHitProxy(node: StrategicNode): THREE.Mesh {
		return new THREE.Mesh(
			new THREE.SphereGeometry(this.getNodeRadius(node) * 2.25, 18, 12),
			new THREE.MeshBasicMaterial({
				                            color: 0xffffff,
				                            transparent: true,
				                            opacity: 0.001,
				                            depthWrite: false,
				                            depthTest: false,
			                            }),
		);
	}

	private createShipMeshes(): void {
		for (const ship of this.world.ships) {
			const mesh = this.createShipMesh(ship);

			this.shipMeshes.set(ship.id, mesh);
			this.strategicGroup.add(mesh);
		}

		this.syncShipMeshes();
	}

	private createShipMesh(ship: ShipDefinition): THREE.Object3D {
		const group = new THREE.Group();
		const hull = new THREE.Mesh(
			new THREE.ConeGeometry(
				ship.role === 'frigate' ? 0.42 : 0.28,
				ship.role === 'frigate' ? 1.35 : 0.9,
				4,
			),
			new THREE.MeshStandardMaterial({
				                               color: ship.factionId === 'player' ? 0x7fd9ff : 0xff806a,
				                               emissive: ship.factionId === 'player' ? 0x14384a : 0x4a1612,
				                               roughness: 0.48,
				                               metalness: 0.35,
			                               }),
		);

		hull.name = 'ShipFallbackHull';
		hull.rotation.set(
			Math.PI * 0.5,
			0,
			0,
		);
		hull.scale.z = -1;
		group.name = ship.name;
		group.add(hull);

		const selectionRing = new THREE.Mesh(
			new THREE.TorusGeometry(0.72, 0.025, 6, 32),
			new THREE.MeshBasicMaterial({
				                            color: 0xffffff,
				                            transparent: true,
				                            opacity: 0.92,
			                            }),
		);

		selectionRing.name = 'FleetSelectionRing';
		selectionRing.rotation.x = Math.PI * 0.5;
		selectionRing.visible = false;
		group.add(selectionRing);
		if (ship.role === 'frigate') {
			this.attachFrigateShipModel(
				group,
				ship,
				hull,
			);
		} else {
			this.attachCapitalShipModel(
				group,
				ship,
				hull,
			);
		}

		return group;
	}

	private cloneFrigateModelForInstance(
		template: THREE.Object3D,
	): THREE.Object3D {
		const clone = template.clone(true);

		clone.traverse((item) => {
			if (!(item instanceof THREE.Mesh)) {
				return;
			}

			item.geometry = item.geometry.clone();
			item.castShadow = false;
			item.receiveShadow = false;
			item.frustumCulled = false;

			if (
				!item.geometry.getAttribute('uv2') &&
				item.geometry.getAttribute('uv')
			) {
				item.geometry.setAttribute(
					'uv2',
					item.geometry.getAttribute('uv').clone(),
				);
			}

			if (Array.isArray(item.material)) {
				item.material = item.material.map((material) => {
					const clonedMaterial = material.clone();

					clonedMaterial.depthWrite = true;
					clonedMaterial.depthTest = true;

					if ('envMapIntensity' in clonedMaterial) {
						clonedMaterial.envMapIntensity = 1.45;
					}

					clonedMaterial.needsUpdate = true;

					return clonedMaterial;
				});
				return;
			}

			item.material = item.material.clone();
			item.material.depthWrite = true;
			item.material.depthTest = true;

			if ('envMapIntensity' in item.material) {
				item.material.envMapIntensity = 1.45;
			}

			item.material.needsUpdate = true;
		});

		return clone;
	}


	private attachFrigateShipModel(
		group: THREE.Group,
		ship: ShipDefinition,
		fallbackHull: THREE.Mesh,
	): void {
		this.loadFrigateModel()
			.then((template) => {
				if (!this.group.parent) {
					return;
				}

				const model = this.cloneFrigateModelForInstance(template);

				model.name = 'FrigateShipModel';

				/*
				 * Frigate GLB is Y-up.
				 * It was flying backwards with rotation.y = Math.PI,
				 * so keep yaw at 0.
				 */
				model.rotation.set(
					0,
					0,
					0,
				);

				const modelScale = 0.5;

				model.scale.setScalar(modelScale);

				fallbackHull.visible = false;
				group.add(model);
			})
			.catch((error) => {
				if (frigateModelWarningShown) {
					return;
				}

				frigateModelWarningShown = true;
				console.warn(
					`Frigate model could not be loaded from ${FRIGATE_GLB_URL}. ` +
					'Using fallback frigate mesh.',
					error,
				);
			});
	}

	private attachCapitalShipModel(
		group: THREE.Group,
		ship: ShipDefinition,
		fallbackHull: THREE.Mesh,
	): void {
		this.loadCapitalShipModel()
			.then((template) => {
				if (!this.group.parent) {
					return;
				}

				const model = this.cloneShipModelForInstance(
					template,
					ship,
				);

				model.name = 'CapitalShipModel';
				model.rotation.set(
					Math.PI * 0.5,
					0,
					0,
				);
				const modelScale =
					      ship.role === 'frigate' || ship.role === 'carrier'
					      ? 0.082
					      : 0.064;

				model.scale.set(
					modelScale,
					modelScale,
					-modelScale,
				);
				fallbackHull.visible = false;
				group.add(model);
			})
			.catch((error) => {
				if (capitalShipModelWarningShown) {
					return;
				}

				capitalShipModelWarningShown = true;
				console.warn(
					`Capital ship model could not be parsed from ${CAPITAL_SHIP_OBJ_URL} / ${CAPITAL_SHIP_MTL_URL}. ` +
					'Using fallback ship mesh.',
					error,
				);
			});
	}

	private loadFrigateModel(): Promise<THREE.Object3D> {
		if (!frigateModelPromise) {
			const loader = new GLTFLoader();

			frigateModelPromise = loader
				.loadAsync(FRIGATE_GLB_URL)
				.then((gltf) => {
					const model = gltf.scene;

					model.name = 'Frigate GLB Source';

					model.traverse((object) => {
						if (!(object instanceof THREE.Mesh)) {
							return;
						}

						object.castShadow = false;
						object.receiveShadow = false;
						object.frustumCulled = false;

						if (object.geometry) {
							object.geometry.computeVertexNormals();

							/*
							 * AO maps in glTF usually use TEXCOORD_1.
							 * If the export only has uv, duplicate it as uv2
							 * so embedded occlusion maps can still work.
							 */
							if (
								!object.geometry.getAttribute('uv2') &&
								object.geometry.getAttribute('uv')
							) {
								object.geometry.setAttribute(
									'uv2',
									object.geometry.getAttribute('uv').clone(),
								);
							}
						}

						const materials = Array.isArray(object.material)
						                  ? object.material
						                  : [object.material];

						for (const material of materials) {
							if (!material) {
								continue;
							}

							/*
							 * Keep embedded GLB material + embedded maps.
							 * Do not replace material, do not assign external textures.
							 */
							material.depthWrite = true;
							material.depthTest = true;
							material.needsUpdate = true;
						}
					});

					this.normalizeImportedModel(model, 1.0);

					return model;
				})
				.catch((error) => {
					if (!frigateModelWarningShown) {
						console.warn(
							`Failed to load frigate model from ${FRIGATE_GLB_URL}. Falling back to dummy ship.`,
							error,
						);
						frigateModelWarningShown = true;
					}

					throw error;
				});
		}

		return frigateModelPromise.then((model) => model.clone(true));
	}


	private loadCapitalShipModel(): Promise<THREE.Object3D> {
		if (!capitalShipModelPromise) {
			const mtlLoader = new MTLLoader();
			const objLoader = new OBJLoader();

			capitalShipModelPromise = mtlLoader
				.loadAsync(CAPITAL_SHIP_MTL_URL)
				.then((materials) => {
					materials.preload();
					objLoader.setMaterials(materials);

					return objLoader.loadAsync(CAPITAL_SHIP_OBJ_URL);
				})
				.then((model) => {
					model.name = 'Capital Ship OBJ Source';

					model.traverse((object) => {
						if (!(object instanceof THREE.Mesh)) {
							return;
						}

						object.castShadow = false;
						object.receiveShadow = false;
						object.frustumCulled = false;

						const material = object.material;

						if (Array.isArray(material)) {
							for (const entry of material) {
								entry.depthWrite = true;
								entry.depthTest = true;
							}
							return;
						}

						material.depthWrite = true;
						material.depthTest = true;
					});

					this.normalizeImportedModel(model, 1.0);

					return model;
				})
				.catch((error) => {
					if (!capitalShipModelWarningShown) {
						console.warn(
							`Failed to load capital ship model from ${CAPITAL_SHIP_OBJ_URL}. Falling back to dummy ship.`,
							error,
						);
						capitalShipModelWarningShown = true;
					}

					throw error;
				});
		}

		return capitalShipModelPromise.then((model) => model.clone(true));
	}


	private prepareCapitalShipTemplate(object: THREE.Object3D): void {
		object.traverse((item) => {
			if (!(item instanceof THREE.Mesh)) {
				return;
			}

			item.geometry.computeVertexNormals();
			item.castShadow = false;
			item.receiveShadow = false;
		});
	}

	private cloneShipModelForInstance(
		template: THREE.Object3D,
		ship: ShipDefinition,
	): THREE.Object3D {
		const clone = template.clone(true);
		const factionTint = ship.factionId === 'player'
		                    ? new THREE.Color(0x7fd9ff)
		                    : new THREE.Color(0xff806a);

		clone.traverse((item) => {
			if (!(item instanceof THREE.Mesh)) {
				return;
			}

			item.geometry = item.geometry.clone();

			const material = Array.isArray(item.material)
			                 ? item.material[0]
			                 : item.material;
			const sourceColor =
				      material && 'color' in material && material.color instanceof THREE.Color
				      ? material.color
				      : new THREE.Color(0x777a74);
			const color = sourceColor.clone().lerp(
				factionTint,
				item.name.toLowerCase().includes('engine') ? 0.18 : 0.08,
			);
			const engineMaterial = item.name.toLowerCase().includes('engine');

			item.material = new THREE.MeshStandardMaterial({
				                                               color,
				                                               emissive: engineMaterial
				                                                         ? factionTint.clone().multiplyScalar(0.55)
				                                                         : new THREE.Color(0x000000),
				                                               emissiveIntensity: engineMaterial ? 0.95 : 0.0,
				                                               roughness: engineMaterial ? 0.36 : 0.58,
				                                               metalness: engineMaterial ? 0.46 : 0.34,
				                                               envMapIntensity: engineMaterial ? 1.45 : 1.05,
			                                               });
		});

		return clone;
	}

	private loadOrbitalHangerModel(): Promise<THREE.Object3D> {
		if (!orbitalHangerModelPromise) {
			const loader = new GLTFLoader();

			orbitalHangerModelPromise = loader
				.loadAsync(ORBITAL_HANGER_GLB_URL)
				.then((gltf) => {
					const model = gltf.scene;

					model.name = 'Orbital Hanger GLB Source';

					model.traverse((object) => {
						if (!(object instanceof THREE.Mesh)) {
							return;
						}

						object.castShadow = false;
						object.receiveShadow = false;
						object.frustumCulled = false;

						const material = object.material;

						if (Array.isArray(material)) {
							for (const entry of material) {
								entry.depthWrite = true;
								entry.depthTest = true;
							}
							return;
						}

						material.depthWrite = true;
						material.depthTest = true;
					});

					this.normalizeImportedModel(model, 1.0);

					return model;
				})
				.catch((error) => {
					if (!orbitalHangerModelWarningShown) {
						console.warn(
							`Failed to load ${ORBITAL_HANGER_GLB_URL}. Falling back to dummy station.`,
							error,
						);
						orbitalHangerModelWarningShown = true;
					}

					throw error;
				});
		}

		return orbitalHangerModelPromise.then((model) => model.clone(true));
	}

	private normalizeImportedModel(
		model: THREE.Object3D,
		targetSize: number,
	): void {
		const box = new THREE.Box3().setFromObject(model);
		const size = new THREE.Vector3();

		box.getSize(size);

		const maxSize = Math.max(size.x, size.y, size.z);

		if (maxSize > 0.0001) {
			model.scale.multiplyScalar(targetSize / maxSize);
		}

		const normalizedBox = new THREE.Box3().setFromObject(model);
		const center = new THREE.Vector3();

		normalizedBox.getCenter(center);
		model.position.sub(center);
	}

	private createOrbitalHangerFallback(): THREE.Object3D {
		const group = new THREE.Group();

		group.name = 'Orbital Hanger Fallback';

		const body = new THREE.Mesh(
			new THREE.BoxGeometry(1.8, 0.42, 0.82),
			new THREE.MeshStandardMaterial({
				                               color: 0x8fe7ff,
				                               emissive: 0x12384a,
				                               emissiveIntensity: 0.24,
				                               roughness: 0.42,
				                               metalness: 0.55,
			                               }),
		);

		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(0.92, 0.045, 10, 48),
			new THREE.MeshBasicMaterial({
				                            color: 0x8fe7ff,
				                            transparent: true,
				                            opacity: 0.56,
				                            depthWrite: false,
			                            }),
		);

		ring.rotation.y = Math.PI * 0.5;
		group.add(body);
		group.add(ring);

		return group;
	}

	private createOrbitalHangerStationMesh(): THREE.Object3D {
		const group = new THREE.Group();

		group.name = 'Orbital Hanger Station';
		group.add(this.createOrbitalHangerFallback());

		void this.loadOrbitalHangerModel()
			.then((model) => {
				group.clear();

				model.name = 'Orbital Hanger GLB';
				model.scale.multiplyScalar(2.8);
				model.rotation.y = Math.PI * 0.15;

				group.add(model);
			})
			.catch(() => {
				// Fallback bleibt sichtbar.
			});

		return group;
	}

	private createStationMesh(station: OrbitalStationDefinition): THREE.Object3D {
		if (station.type === 'shipyard') {
			return this.createOrbitalHangerStationMesh();
		}

		const group = new THREE.Group();
		const core = new THREE.Mesh(
			new THREE.BoxGeometry(0.9, 0.55, 0.9),
			new THREE.MeshStandardMaterial({
				                               color: station.factionId === 'player' ? 0x83d9ff : 0xff8a72,
				                               emissive: station.factionId === 'player' ? 0x123447 : 0x45140f,
				                               roughness: 0.52,
				                               metalness: 0.42,
			                               }),
		);
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(0.92, 0.055, 8, 32),
			new THREE.MeshStandardMaterial({
				                               color: 0xaeb8bd,
				                               roughness: 0.48,
				                               metalness: 0.55,
			                               }),
		);

		ring.rotation.x = Math.PI * 0.5;
		group.name = station.name;
		group.position.set(
			station.position.x,
			station.position.y,
			station.position.z,
		);
		group.add(core);
		group.add(ring);

		return group;
	}

	private createMoveMarker(): THREE.Group {
		const group = new THREE.Group();
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(1.35, 0.035, 8, 48),
			new THREE.MeshBasicMaterial({
				                            color: 0x8fe7ff,
				                            transparent: true,
				                            opacity: 0.88,
				                            depthWrite: false,
				                            depthTest: true,
			                            }),
		);
		const stem = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints([
				                                         new THREE.Vector3(0, 0, 0),
				                                         new THREE.Vector3(0, 1, 0),
			                                         ]),
			new THREE.LineBasicMaterial({
				                            color: 0x8fe7ff,
				                            transparent: true,
				                            opacity: 0.62,
				                            depthWrite: false,
				                            depthTest: true,
			                            }),
		);

		ring.rotation.x = Math.PI * 0.5;
		group.add(ring);
		group.add(stem);

		return group;
	}


	private createWormholeSprite(
		name: string,
		size: number,
		color: THREE.ColorRepresentation = 0x9feaff,
	): THREE.Sprite {
		const material = new THREE.SpriteMaterial({
			                                          map: this.getWormholeSpriteTexture(),
			                                          color,
			                                          transparent: true,
			                                          opacity: 0.88,
			                                          depthWrite: false,
			                                          depthTest: true,
			                                          blending: THREE.AdditiveBlending,
		                                          });

		const sprite = new THREE.Sprite(material);

		sprite.name = name;
		sprite.scale.set(size, size, 1);

		return sprite;
	}

	private getWormholeSpriteTexture(): THREE.CanvasTexture {
		if (this.wormholeSpriteTexture) {
			return this.wormholeSpriteTexture;
		}

		const canvas = document.createElement('canvas');

		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			this.wormholeSpriteTexture = new THREE.CanvasTexture(canvas);
			return this.wormholeSpriteTexture;
		}

		context.clearRect(0, 0, canvas.width, canvas.height);

		const centerX = canvas.width * 0.5;
		const centerY = canvas.height * 0.5;

		const outer = context.createRadialGradient(
			centerX,
			centerY,
			0,
			centerX,
			centerY,
			canvas.width * 0.48,
		);

		outer.addColorStop(0.00, 'rgba(230, 255, 255, 1.00)');
		outer.addColorStop(0.08, 'rgba(125, 235, 255, 0.98)');
		outer.addColorStop(0.22, 'rgba(42, 130, 255, 0.60)');
		outer.addColorStop(0.46, 'rgba(34, 70, 190, 0.25)');
		outer.addColorStop(0.72, 'rgba(18, 28, 110, 0.10)');
		outer.addColorStop(1.00, 'rgba(0, 0, 0, 0.00)');

		context.fillStyle = outer;
		context.fillRect(0, 0, canvas.width, canvas.height);

		for (let index = 0; index < 38; index++) {
			const angle = index * 0.74;
			const radius = 9 + index * 2.15;
			const spread = 12 + index * 0.56;
			const x = centerX + Math.cos(angle) * radius;
			const y = centerY + Math.sin(angle) * radius * 0.72;

			const puff = context.createRadialGradient(
				x,
				y,
				0,
				x,
				y,
				spread,
			);

			puff.addColorStop(0.00, 'rgba(190, 245, 255, 0.26)');
			puff.addColorStop(0.52, 'rgba(64, 130, 255, 0.10)');
			puff.addColorStop(1.00, 'rgba(0, 0, 0, 0.00)');

			context.fillStyle = puff;
			context.fillRect(x - spread, y - spread, spread * 2, spread * 2);
		}

		const core = context.createRadialGradient(
			centerX,
			centerY,
			0,
			centerX,
			centerY,
			canvas.width * 0.18,
		);

		core.addColorStop(0.00, 'rgba(255, 255, 255, 1.00)');
		core.addColorStop(0.22, 'rgba(170, 245, 255, 0.95)');
		core.addColorStop(0.60, 'rgba(70, 130, 255, 0.32)');
		core.addColorStop(1.00, 'rgba(0, 0, 0, 0.00)');

		context.fillStyle = core;
		context.fillRect(0, 0, canvas.width, canvas.height);

		this.wormholeSpriteTexture = new THREE.CanvasTexture(canvas);
		this.wormholeSpriteTexture.colorSpace = THREE.SRGBColorSpace;
		this.wormholeSpriteTexture.needsUpdate = true;

		return this.wormholeSpriteTexture;
	}

	private bindInput(): void {
		this.options.domElement.addEventListener(
			'pointerdown',
			this.handlePointerDown,
		);
		this.options.domElement.addEventListener(
			'contextmenu',
			this.handleContextMenu,
		);
		this.options.domElement.addEventListener(
			'wheel',
			this.handleWheel,
			{
				passive: false,
			},
		);
		window.addEventListener(
			'keydown',
			this.handleKeyDown,
		);
		window.addEventListener(
			'keyup',
			this.handleKeyUp,
		);
		window.addEventListener(
			'blur',
			this.handleWindowBlur,
		);
	}

	private readonly handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	private readonly handlePointerDown = (event: PointerEvent): void => {
		if (this.viewMode === 'system') {
			if (event.button === 0) {
				if (this.selectStationFromPointer(event)) {
					return;
				}

				if (this.selectSystemPlanetFromPointer(event)) {
					return;
				}

				this.selectSystemFleetFromPointer(event);
				return;
			}

			if (event.button === 2) {
				if (this.startAttackFleetFromPointer(event)) {
					return;
				}

				if (this.startSystemExitMoveFromPointer(event)) {
					return;
				}

				this.startMoveDraftFromPointer(event);
			}

			return;
		}

		if (event.button === 0) {
			if (this.selectNodeFromPointer(event)) {
				return;
			}

			this.selectFleetFromPointer(event);
			return;
		}

		if (event.button === 2) {
			if (this.startAttackFleetFromPointer(event)) {
				return;
			}

			if (this.startStrategicMoveToNodeFromPointer(event)) {
				return;
			}

			this.startMoveDraftFromPointer(event);
		}
	};

	private readonly handleWheel = (event: WheelEvent): void => {
		if (!this.navigation.moveDraft) {
			return;
		}

		event.preventDefault();

		this.navigation = updateTacticalMoveDraftHeight(
			this.navigation,
			THREE.MathUtils.clamp(
				this.navigation.moveDraft.heightOffset - event.deltaY * 0.018,
				this.viewMode === 'system' ? -12 : -18,
				this.viewMode === 'system' ? 24 : 32,
			),
		);
	};

	private readonly handleKeyDown = (event: KeyboardEvent): void => {
		if (this.isCameraKey(event.code)) {
			if (!this.isKeyboardCameraInputAllowed(event)) {
				return;
			}

			event.preventDefault();
			this.pressedKeys.add(event.code);
			return;
		}

		if (event.code === 'KeyB' && this.viewMode === 'system') {
			this.buildShipyardInCurrentSystem();
			return;
		}

		if (event.code === 'KeyN' && this.viewMode === 'system') {
			this.buildShipAtSelectedShipyard();
			return;
		}

		if (event.code === 'Enter') {
			if (
				this.viewMode === 'strategic' &&
				!this.navigation.moveDraft &&
				this.selectedNodeId
			) {
				this.enterSystemView(this.selectedNodeId);
				return;
			}

			const result = confirmTacticalMoveDraft(this.navigation);
			this.navigation = result.state;

			if (result.target && this.world.selectedFleetId) {
				this.world = setFleetTacticalMoveOrder(
					this.world,
					this.world.selectedFleetId,
					result.target,
					this.viewMode,
				);
			}
		}

		if (event.code === 'Escape' || event.code === 'Backspace') {
			if (this.viewMode === 'system') {
				if (this.systemCameraMode === 'orbitPlanet') {
					this.exitPlanetOrbitView();
					return;
				}

				this.exitSystemView();
				return;
			}

			this.navigation = cancelTacticalMoveDraft(this.navigation);
		}
	};

	private readonly handleKeyUp = (event: KeyboardEvent): void => {
		if (this.isCameraKey(event.code)) {
			this.pressedKeys.delete(event.code);
		}
	};

	private readonly handleWindowBlur = (): void => {
		this.pressedKeys.clear();
	};

	private isCameraKey(code: string): boolean {
		return (
			code === 'KeyW' ||
			code === 'KeyA' ||
			code === 'KeyS' ||
			code === 'KeyD' ||
			code === 'KeyQ' ||
			code === 'KeyE'
		);
	}

	private isKeyboardCameraInputAllowed(event: KeyboardEvent): boolean {
		if (event.altKey || event.ctrlKey || event.metaKey) {
			return false;
		}

		const target = event.target;

		if (!(target instanceof HTMLElement)) {
			return true;
		}

		return !(
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable
		);
	}

	private selectNodeFromPointer(event: PointerEvent): boolean {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.nodeMeshes.values()],
			false,
		);
		const object = intersections[0]?.object;
		const nodeId = object ? this.findNodeIdForObject(object) : null;

		if (!nodeId) {
			return false;
		}

		const now = performance.now();
		const isDoubleClick =
			      nodeId === this.lastNodeClickId &&
			      now - this.lastNodeClickTime < 360;

		this.selectedNodeId = nodeId;
		this.lastNodeClickId = nodeId;
		this.lastNodeClickTime = now;

		if (isDoubleClick) {
			this.enterSystemView(nodeId);
		}

		return true;
	}

	private selectFleetFromPointer(event: PointerEvent): void {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.shipMeshes.values()],
			true,
		);

		const object = intersections[0]?.object;

		if (!object) {
			return;
		}

		const shipId = this.findShipIdForObject(object);
		const fleet = this.world.fleets.find(
			(item) => item.shipIds.includes(shipId ?? ''),
		);

		if (!fleet) {
			return;
		}

		this.world = {
			...this.world,
			selectedFleetId: fleet.id,
		};
	}

	private selectSystemFleetFromPointer(event: PointerEvent): void {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.systemShipMeshes.values()],
			true,
		);
		const object = intersections[0]?.object;

		if (!object) {
			return;
		}

		const shipId = this.findSystemShipIdForObject(object);
		const fleet = this.world.fleets.find(
			(item) =>
				item.nodeId === this.selectedNodeId &&
				item.shipIds.includes(shipId ?? ''),
		);

		if (!fleet) {
			return;
		}

		this.world = {
			...this.world,
			selectedFleetId: fleet.id,
		};
	}

	private selectStationFromPointer(event: PointerEvent): boolean {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.stationMeshes.values()],
			true,
		);
		const object = intersections[0]?.object;
		const stationId = object ? this.findStationIdForObject(object) : null;

		if (!stationId) {
			return false;
		}

		this.selectedStationId = stationId;
		return true;
	}

	private startStrategicMoveToNodeFromPointer(event: PointerEvent): boolean {
		const selectedFleet = this.getSelectedFleet();

		if (!selectedFleet) {
			return false;
		}

		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.nodeMeshes.values()],
			false,
		);
		const object = intersections[0]?.object;
		const nodeId = object ? this.findNodeIdForObject(object) : null;

		if (!nodeId) {
			return false;
		}

		this.world = setFleetStrategicMoveOrder(
			this.world,
			selectedFleet.id,
			nodeId,
		);
		this.navigation = cancelTacticalMoveDraft(this.navigation);
		return true;
	}

	private startSystemExitMoveFromPointer(event: PointerEvent): boolean {
		const selectedFleet = this.getSelectedFleet();

		if (!selectedFleet || selectedFleet.nodeId !== this.selectedNodeId) {
			return false;
		}

		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const intersections = this.raycaster.intersectObjects(
			[...this.systemExitMeshes.values()],
			true,
		);
		const object = intersections[0]?.object;
		const targetNodeId = object ? this.findSystemExitNodeIdForObject(object) : null;

		if (!targetNodeId) {
			return false;
		}

		this.world = setFleetStrategicMoveOrder(
			this.world,
			selectedFleet.id,
			targetNodeId,
		);
		this.navigation = cancelTacticalMoveDraft(this.navigation);
		return true;
	}

	private startAttackFleetFromPointer(event: PointerEvent): boolean {
		const selectedFleet = this.getSelectedFleet();

		if (!selectedFleet) {
			return false;
		}

		const targetFleet = this.getFleetFromPointer(
			event,
			this.viewMode === 'system',
		);

		if (
			!targetFleet ||
			targetFleet.id === selectedFleet.id ||
			targetFleet.factionId === selectedFleet.factionId
		) {
			return false;
		}

		this.world = setFleetAttackOrder(
			this.world,
			selectedFleet.id,
			targetFleet.id,
		);
		this.navigation = cancelTacticalMoveDraft(this.navigation);
		return true;
	}

	private getFleetFromPointer(
		event: PointerEvent,
		system: boolean,
	): Fleet | null {
		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		const meshes = system
		               ? [...this.systemShipMeshes.values()]
		               : [...this.shipMeshes.values()];
		const intersections = this.raycaster.intersectObjects(meshes, true);
		const object = intersections[0]?.object;
		const shipId = object
		               ? (
			               system
			               ? this.findSystemShipIdForObject(object)
			               : this.findShipIdForObject(object)
		               )
		               : null;

		if (!shipId) {
			return null;
		}

		return this.world.fleets.find(
			(fleet) => fleet.shipIds.includes(shipId),
		) ?? null;
	}

	private startMoveDraftFromPointer(event: PointerEvent): void {
		if (!this.world.selectedFleetId) {
			return;
		}

		if (this.viewMode === 'system') {
			const fleet = this.getSelectedFleet();

			if (!fleet || fleet.nodeId !== this.selectedNodeId) {
				return;
			}
		}

		this.updatePointer(event);
		this.raycaster.setFromCamera(this.pointer, this.options.camera);

		if (!this.raycaster.ray.intersectPlane(this.movePlane, this.intersection)) {
			return;
		}

		const target =
			      this.viewMode === 'system'
			      ? this.renderToSystemPosition(this.intersection)
			      : {
					      x: this.intersection.x,
					      y: 0,
					      z: this.intersection.z,
				      };

		target.y = 0;

		this.navigation = startTacticalMoveDraft(
			this.navigation,
			target,
		);
	}

	private syncShipMeshes(): void {
		this.removeDestroyedShipMeshes(this.shipMeshes, this.strategicGroup);

		for (const ship of this.world.ships) {
			let mesh = this.shipMeshes.get(ship.id);

			if (!mesh) {
				mesh = this.createShipMesh(ship);
				this.shipMeshes.set(ship.id, mesh);
				this.strategicGroup.add(mesh);
			}

			mesh.position.set(
				ship.position.x,
				ship.position.y + 0.45,
				ship.position.z,
			);
			if (
				Math.abs(ship.velocity.x) > 0.001 ||
				Math.abs(ship.velocity.z) > 0.001
			) {
				mesh.lookAt(
					mesh.position.x + ship.velocity.x,
					mesh.position.y + ship.velocity.y,
					mesh.position.z + ship.velocity.z,
				);
			}

			this.syncFleetSelectionRing(mesh, ship.id, 1.0);
		}
	}

	private syncSystemShipMeshes(): void {
		if (this.viewMode !== 'system') {
			return;
		}

		this.removeDestroyedShipMeshes(this.systemShipMeshes, this.systemGroup);

		for (const ship of this.world.ships) {
			let mesh = this.systemShipMeshes.get(ship.id);

			if (!mesh) {
				if (ship.nodeId !== this.selectedNodeId) {
					continue;
				}

				mesh = this.createShipMesh(ship);
				mesh.scale.setScalar(0.36);
				this.systemShipMeshes.set(ship.id, mesh);
				this.systemGroup.add(mesh);
			}

			mesh.visible = ship.nodeId === this.selectedNodeId;

			mesh.position.copy(this.systemToRenderPosition(ship.systemPosition));
			if (
				Math.abs(ship.systemVelocity.x) > 0.001 ||
				Math.abs(ship.systemVelocity.y) > 0.001 ||
				Math.abs(ship.systemVelocity.z) > 0.001
			) {
				mesh.lookAt(
					mesh.position.x + ship.systemVelocity.x,
					mesh.position.y + ship.systemVelocity.y,
					mesh.position.z + ship.systemVelocity.z,
				);
			}

			this.syncFleetSelectionRing(mesh, ship.id, 0.36);
		}
	}

	private removeDestroyedShipMeshes(
		meshes: Map<string, THREE.Object3D>,
		parent: THREE.Group,
	): void {
		const liveShipIds = new Set(this.world.ships.map((ship) => ship.id));

		for (const [shipId, mesh] of meshes) {
			if (liveShipIds.has(shipId)) {
				continue;
			}

			parent.remove(mesh);
			this.disposeObject(mesh);
			meshes.delete(shipId);
		}
	}

	private updateSystemPlanets(deltaSeconds: number): void {
		if (this.viewMode !== 'system') {
			return;
		}

		const localCameraPosition = new THREE.Vector3();

		for (const planet of this.systemPlanets) {
			localCameraPosition.copy(this.options.camera.position)
				.sub(planet.group.position);
			this.systemSunDirection.copy(planet.group.position)
				.multiplyScalar(-1);

			if (this.systemSunDirection.lengthSq() <= 0.000001) {
				this.systemSunDirection.set(1, 0.15, 0.35);
			}

			planet.setSunDirection(this.systemSunDirection);
			planet.update(localCameraPosition, deltaSeconds);
		}
	}

	private updateWormholeVisuals(deltaSeconds: number): void {
		for (const [nodeId, visual] of this.strategicNodeVisuals) {
			visual.setSelected(this.viewMode === 'strategic' && nodeId === this.selectedNodeId);
			visual.update(deltaSeconds);
		}

		if (this.viewMode !== 'system') {
			return;
		}

		for (const visual of this.systemExitVisuals.values()) {
			visual.update(deltaSeconds);
		}
	}

	private syncFleetSelectionRing(
		mesh: THREE.Object3D,
		shipId: string,
		scale: number,
	): void {
		const selectedFleet = this.getSelectedFleet();
		const selected = selectedFleet?.shipIds.includes(shipId) ?? false;
		const ring = mesh.children.find(
			(child) => child.name === 'FleetSelectionRing',
		);

		if (!ring) {
			return;
		}

		ring.visible = selected;
		ring.scale.setScalar(selected ? 1.35 / scale : 1);
		ring.quaternion.copy(mesh.quaternion)
			.invert()
			.multiply(this.selectionRingWorldQuaternion);
	}

	private syncMoveMarker(): void {
		const draft = this.navigation.moveDraft;

		this.moveMarker.visible = this.viewMode === 'strategic' && draft !== null;

		if (this.systemMoveMarker) {
			this.systemMoveMarker.visible =
				this.viewMode === 'system' && draft !== null;
		}

		if (!draft) {
			return;
		}

		const target = getTacticalMoveDraftTarget(draft);
		this.moveMarker.position.set(target.x, target.y, target.z);
		this.moveMarker.scale.setScalar(1 + Math.abs(target.y) * 0.025);

		if (this.systemMoveMarker) {
			this.systemMoveMarker.position.copy(this.systemToRenderPosition(target));
			this.systemMoveMarker.scale.setScalar(0.72 + Math.abs(target.y) * 0.025);
		}
	}

	private updateHud(): void {
		const selectedFleet = this.getSelectedFleet();
		const selectedNode = this.selectedNodeId
		                     ? this.getNode(this.selectedNodeId)
		                     : null;
		const order = selectedFleet?.order.type ?? 'none';
		const draft = this.navigation.moveDraft;

		if (this.viewMode === 'system') {
			const node = selectedNode ?? this.world.nodes[0];
			const planetClasses = node.system.planets
				.map((planet) => planet.class.replace('_', ' '))
				.join(' | ');
			const stationCount = this.world.stations.filter(
				(station) => station.nodeId === node.id,
			).length;
			const selectedStation = this.selectedStationId
			                        ? this.world.stations.find(
					(station) => station.id === this.selectedStationId,
				)
			                        : null;

			this.options.hud.textContent =
				`GAME MODE | SYSTEM | ${node.name}\n` +
				`star: ${node.system.star.class} | planets: ${node.system.planets.length} | belts: ${node.system.asteroidBelts.length}\n` +
				`classes: ${planetClasses}\n` +
				`fleet: ${selectedFleet?.name ?? 'none'} | order: ${order} | stations: ${stationCount} | yard: ${selectedStation?.name ?? 'none'}\n` +
				(
					draft
					? `move draft: x ${draft.anchor.x.toFixed(1)} | ` +
				`z ${draft.anchor.z.toFixed(1)} | ` +
				`height ${draft.heightOffset.toFixed(1)}\n`
					: ''
				) +
				(
					this.systemCameraMode === 'orbitPlanet'
					? `planet focus | Esc return pan | mouse orbit/zoom`
					: `WASD pan | Q/E zoom | double-click planet orbit | left select | right enemy attack/exit/move | B shipyard | N fighter | Esc map`
				);
			return;
		}

		this.options.hud.textContent =
			`GAME MODE | STRATEGIC | seed: ${this.world.seed}\n` +
			`systems: ${this.world.nodes.length} | lanes: ${this.world.lanes.length} | ships: ${this.world.ships.length}\n` +
			`system: ${selectedNode?.name ?? 'none'} | fleet: ${selectedFleet?.name ?? 'none'} | order: ${order}\n` +
			(
				draft
				? `move draft: x ${draft.anchor.x.toFixed(1)} | ` +
			`z ${draft.anchor.z.toFixed(1)} | ` +
			`height ${draft.heightOffset.toFixed(1)}\n`
				: ''
			) +
			`WASD pan | Q/E zoom | left select | right enemy attack | right system lane move | Enter system`;
	}

	private updatePointer(event: PointerEvent): void {
		const rect = this.options.domElement.getBoundingClientRect();

		this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	private findShipIdForObject(object: THREE.Object3D): string | null {
		for (const [shipId, mesh] of this.shipMeshes) {
			let current: THREE.Object3D | null = object;

			while (current) {
				if (current === mesh) {
					return shipId;
				}

				current = current.parent;
			}
		}

		return null;
	}

	private findSystemShipIdForObject(object: THREE.Object3D): string | null {
		for (const [shipId, mesh] of this.systemShipMeshes) {
			let current: THREE.Object3D | null = object;

			while (current) {
				if (current === mesh) {
					return shipId;
				}

				current = current.parent;
			}
		}

		return null;
	}

	private findStationIdForObject(object: THREE.Object3D): string | null {
		for (const [stationId, mesh] of this.stationMeshes) {
			let current: THREE.Object3D | null = object;

			while (current) {
				if (current === mesh) {
					return stationId;
				}

				current = current.parent;
			}
		}

		return null;
	}

	private findSystemExitNodeIdForObject(object: THREE.Object3D): string | null {
		for (const [nodeId, mesh] of this.systemExitMeshes) {
			let current: THREE.Object3D | null = object;

			while (current) {
				if (current === mesh) {
					return nodeId;
				}

				current = current.parent;
			}
		}

		return null;
	}

	private findNodeIdForObject(object: THREE.Object3D): string | null {
		for (const [nodeId, mesh] of this.nodeMeshes) {
			if (object === mesh) {
				return nodeId;
			}
		}

		return null;
	}

	private enterSystemView(nodeId: string): void {
		const node = this.getNode(nodeId);

		if (!node) {
			return;
		}

		this.viewMode = 'system';
		this.selectedNodeId = nodeId;
		this.navigation = cancelTacticalMoveDraft(this.navigation);
		this.strategicGroup.visible = false;
		this.systemGroup.visible = true;

		if (this.shouldShowLoadingOverlayForSystem(node.id)) {
			this.showLoadingOverlay(undefined, node.id);
		}

		this.rebuildSystemView(node);
		this.configureCamera();
	}

	private exitSystemView(): void {
		this.hideLoadingOverlay();
		this.viewMode = 'strategic';
		this.strategicGroup.visible = true;
		this.systemGroup.visible = false;
		this.configureCamera();
	}

	private buildShipyardInCurrentSystem(): void {
		if (!this.selectedNodeId) {
			return;
		}

		const selectedFleet = this.getSelectedFleet();
		const position = this.getCurrentSystemBuildPosition();

		this.world = addShipyardStation(
			this.world,
			this.selectedNodeId,
			selectedFleet?.factionId ?? 'player',
			position,
		);

		const node = this.getNode(this.selectedNodeId);

		if (node) {
			this.rebuildSystemView(node);
		}
	}

	private buildShipAtSelectedShipyard(): void {
		const nodeId = this.selectedNodeId;

		if (!nodeId) {
			return;
		}

		const station =
			      (
				      this.selectedStationId
				      ? this.world.stations.find(
					      (item) =>
						      item.id === this.selectedStationId &&
						      item.nodeId === nodeId,
				      )
				      : null
			      ) ??
			      this.world.stations.find(
				      (item) => item.nodeId === nodeId && item.type === 'shipyard',
			      );

		if (!station) {
			return;
		}

		this.world = buildShipAtShipyard(this.world, station.id, 'fighter');
		this.selectedStationId = station.id;

		const node = this.getNode(nodeId);

		if (node) {
			this.rebuildSystemView(node);
		}
	}

	private getCurrentSystemBuildPosition(): {
		x: number;
		y: number;
		z: number;
	} {
		const draft = this.navigation.moveDraft;

		if (draft) {
			return getTacticalMoveDraftTarget(draft);
		}

		const selectedFleet = this.getSelectedFleet();
		const firstShipId = selectedFleet?.shipIds[0];
		const firstShip = this.world.ships.find((ship) => ship.id === firstShipId);

		if (firstShip && selectedFleet?.nodeId === this.selectedNodeId) {
			return {
				x: firstShip.systemPosition.x + 1.8,
				y: firstShip.systemPosition.y,
				z: firstShip.systemPosition.z + 1.2,
			};
		}

		return {
			x: 0,
			y: 0,
			z: 12,
		};
	}

	private ensureSystemNebulaAttached(): void {
		if (this.systemNebulaBackdrop.group.parent === this.systemGroup) {
			return;
		}

		this.systemGroup.add(this.systemNebulaBackdrop.group);

		if (
			typeof window !== 'undefined' &&
			new URLSearchParams(window.location.search).get('nebulaDebugRemoved') === '1'
		) {
			console.log('[NebulaDebug] reattached to systemGroup', {
				children: this.systemGroup.children.length,
				nebulaChildren: this.systemNebulaBackdrop.group.children.length,
			});
		}
	}

	private rebuildSystemView(node: StrategicNode): void {
		const shouldShowSystemLoading =
			      this.shouldShowLoadingOverlayForSystem(node.id);

		this.activeSystemNodeId = node.id;
		this.clearSystemView();
		this.ensureSystemNebulaAttached();

		if (
			shouldShowSystemLoading &&
			this.loadingOverlayNodeId !== node.id &&
			!this.loadingOverlayVisible
		) {
			this.showLoadingOverlay(undefined, node.id);
		}

		this.systemNebulaBackdrop.reseed(
			this.options.seed ^ this.hashString(node.id),
		);
		this.systemRenderOrigin.set(0, 0, 0);
		this.systemRenderShift.set(0, 0, 0);
		this.systemShipMeshes.clear();
		this.stationMeshes.clear();
		this.systemExitMeshes.clear();

		const starRadius = THREE.MathUtils.clamp(
			node.system.star.radius * 2.1 * this.systemStarScale,
			5.6,
			12.4,
		);
		const star = new THREE.Mesh(
			new THREE.SphereGeometry(starRadius, 48, 24),
			new THREE.MeshBasicMaterial({
				                            color: new THREE.Color(node.system.star.color),
			                            }),
		);

		star.name = `${node.system.star.name} Star`;
		star.renderOrder = 8;
		this.systemGroup.add(this.createSystemStarGlow(
			new THREE.Color(node.system.star.color),
			starRadius,
		));
		this.systemGroup.add(star);

		const light = new THREE.PointLight(
			new THREE.Color(node.system.star.color),
			32,
			320,
			1.35,
		);
		light.name = 'System Star Light';
		light.position.set(0, 0, 0);
		this.systemGroup.add(light);

		const ambientLight = new THREE.AmbientLight(
			0xa8c0d2,
			0.64,
		);
		ambientLight.name = 'System Ambient Fill';
		this.systemGroup.add(ambientLight);

		this.activeSystemNodeId = node.id;
		this.addSystemPlanets(node);
		this.addSystemExits(node);

		for (const belt of node.system.asteroidBelts) {
			const radius = this.getPlanetOrbitRadius(
				node.system.planets.length,
				(belt.innerRadius + belt.outerRadius) * 0.5,
			);
			const beltLine = this.createOrbitLine(radius, 0x8f8372, 0.28);

			beltLine.name = belt.name;
			this.systemGroup.add(beltLine);
		}

		for (const fleet of this.world.fleets) {
			if (fleet.nodeId !== node.id) {
				continue;
			}

			for (const shipId of fleet.shipIds) {
				const ship = this.world.ships.find((item) => item.id === shipId);

				if (!ship) {
					continue;
				}

				const mesh = this.createShipMesh(ship);
				mesh.scale.setScalar(0.36);
				this.systemShipMeshes.set(ship.id, mesh);
				this.systemGroup.add(mesh);
			}
		}

		for (const station of this.world.stations) {
			if (station.nodeId !== node.id) {
				continue;
			}

			const mesh = this.createStationMesh(station);
			mesh.position.copy(this.systemToRenderPosition(station.position));
			mesh.scale.setScalar(0.58);
			this.stationMeshes.set(station.id, mesh);
			this.systemGroup.add(mesh);
		}

		this.systemMoveMarker = this.createMoveMarker();
		this.systemMoveMarker.visible = false;
		this.systemMoveMarker.scale.setScalar(0.72);
		this.systemGroup.add(this.systemMoveMarker);
		this.syncSystemShipMeshes();
	}

	private clearSystemView(): void {
		for (const planet of this.systemPlanets) {
			this.systemGroup.remove(planet.group);
		}

		this.systemPlanets.length = 0;
		this.pendingSystemPlanetBuilds = [];
		this.systemExitVisuals.clear();

		while (this.systemGroup.children.length > 0) {
			const child = this.systemGroup.children[0];

			this.systemGroup.remove(child);
			this.disposeObject(child);
		}

		this.systemMoveMarker = null;
	}

	private addSystemPlanets(node: StrategicNode): void {
		const cachedPlanets = this.systemPlanetCache.get(node.id);

		if (cachedPlanets) {
			for (let index = 0; index < node.system.planets.length; index++) {
				this.systemGroup.add(this.createOrbitLine(
					this.getPlanetOrbitRadius(
						index,
						node.system.planets[index].orbit.semiMajorAxis,
					),
				));
			}

			for (const planet of cachedPlanets) {
				const rememberedPosition =
					      this.getRememberedSystemObjectPosition(planet.group);

				if (rememberedPosition) {
					planet.group.position.copy(
						this.systemVectorToRenderPosition(rememberedPosition),
					);
				}

				this.systemPlanets.push(planet);
				this.systemGroup.add(planet.group);
			}

			for (
				let index = cachedPlanets.length;
				index < node.system.planets.length;
				index++
			) {
				const planetDefinition = node.system.planets[index];
				const orbitRadius = this.getPlanetOrbitRadius(
					index,
					planetDefinition.orbit.semiMajorAxis,
				);
				const angle = this.getSystemPlanetOrbitAngle(
					index,
					planetDefinition,
				);
				const planetRadius = THREE.MathUtils.clamp(
					this.getSystemPlanetRenderRadius(planetDefinition),
					3.00,
					9.80,
				);
				const position = new THREE.Vector3(
					Math.cos(angle) * orbitRadius,
					0,
					Math.sin(angle) * orbitRadius,
				);
				const preview = this.createSystemPlanetPreview(
					planetDefinition,
					planetRadius,
				);

				preview.position.copy(this.systemVectorToRenderPosition(position));
				this.rememberSystemObjectPosition(preview, position);
				this.systemGroup.add(preview);
				this.pendingSystemPlanetBuilds.push({
					                                    nodeId: node.id,
					                                    planet: planetDefinition,
					                                    radius: planetRadius,
					                                    position,
					                                    preview,
				                                    });
			}
			return;
		}

		this.systemPlanetCache.set(node.id, []);

		for (let index = 0; index < node.system.planets.length; index++) {
			const planetDefinition = node.system.planets[index];
			const orbitRadius = this.getPlanetOrbitRadius(
				index,
				planetDefinition.orbit.semiMajorAxis,
			);
			const angle = this.getSystemPlanetOrbitAngle(
				index,
				planetDefinition,
			);
			const planetRadius = THREE.MathUtils.clamp(
				this.getSystemPlanetRenderRadius(planetDefinition),
				3.00,
				9.80,
			);
			const position = new THREE.Vector3(
				Math.cos(angle) * orbitRadius,
				0,
				Math.sin(angle) * orbitRadius,
			);
			const preview = this.createSystemPlanetPreview(
				planetDefinition,
				planetRadius,
			);

			this.systemGroup.add(this.createOrbitLine(orbitRadius));
			preview.position.copy(position);
			this.systemGroup.add(preview);
			this.pendingSystemPlanetBuilds.push({
				                                    nodeId: node.id,
				                                    planet: planetDefinition,
				                                    radius: planetRadius,
				                                    position,
				                                    preview,
			                                    });
		}
	}

	private addSystemExits(node: StrategicNode): void {
		const connectedNodeIds = this.world.lanes
			.map((lane) => {
				if (lane.fromNodeId === node.id) {
					return lane.toNodeId;
				}

				if (lane.toNodeId === node.id) {
					return lane.fromNodeId;
				}

				return null;
			})
			.filter((nodeId): nodeId is string => nodeId !== null);
		const exitRadius =
			      (
				      34.0 + Math.max(0, node.system.planets.length - 1) * 18.0
			      ) * this.systemScale;

		for (let index = 0; index < connectedNodeIds.length; index++) {
			const targetNodeId = connectedNodeIds[index];
			const targetNode = this.getNode(targetNodeId);

			if (!targetNode) {
				continue;
			}

			const angle = (index / Math.max(1, connectedNodeIds.length)) * Math.PI * 2;
			const position = new THREE.Vector3(
				Math.cos(angle) * exitRadius,
				0.15,
				Math.sin(angle) * exitRadius,
			);
			const mesh = this.createSystemExitMesh();

			mesh.name = `Jump Exit ${targetNode.name}`;
			mesh.position.copy(position);
			this.systemExitMeshes.set(targetNodeId, mesh);
			this.systemGroup.add(mesh);

			const visual = new WormholeNodeVisual({
				                                      name: `Jump Exit ${targetNode.name} Visual`,
				                                      radius: 1.1,
				                                      owner: targetNode.owner,
			                                      });

			visual.group.position.copy(position);
			this.systemExitVisuals.set(targetNodeId, visual);
			this.systemGroup.add(visual.group);
		}
	}

	private createSystemExitMesh(): THREE.Object3D {
		return new THREE.Mesh(
			new THREE.SphereGeometry(1.8, 16, 12),
			new THREE.MeshBasicMaterial({
				                            color: 0xffffff,
				                            transparent: true,
				                            opacity: 0.001,
				                            depthWrite: false,
				                            depthTest: false,
			                            }),
		);
	}

	private processSystemPlanetBuildQueue(): void {
		if (this.viewMode !== 'system' || this.pendingSystemPlanetBuilds.length <= 0) {
			return;
		}

		const job = this.pendingSystemPlanetBuilds.shift();

		if (!job || job.nodeId !== this.activeSystemNodeId) {
			return;
		}

		const planet = this.createSystemPlanet(job.planet, job.radius);

		planet.group.position.copy(this.systemVectorToRenderPosition(job.position));
		this.rememberSystemObjectPosition(planet.group, job.position);
		this.systemGroup.remove(job.preview);
		this.disposeObject(job.preview);
		this.systemGroup.add(planet.group);
		this.systemPlanets.push(planet);
		this.systemPlanetCache.get(job.nodeId)?.push(planet);
	}

	private createSystemPlanet(
		planetDefinition: StrategicNode['system']['planets'][number],
		radius: number,
	): Planet {
		const planet = new Planet(
			radius,
			this.options.rendererMode,
			null,
			{
				raymarchedClouds: true,
				raymarchedAtmosphere: true,
				raymarchedSurface: true,
				moonSystem: true,
				nearSurfaceTerrain: true,
				gasCloudParticles: false,
				cloudSteps: {
					moving: 8,
					idle: 20,
				},
				atmosphereSteps: {
					moving: 8,
					idle: 16,
				},
				surfaceSteps: {
					moving: 4,
					idle: 10,
				},
			},
			planetDefinition,
			createPlanetRenderProfile(planetDefinition),
		);

		planet.group.name = planetDefinition.name;
		planet.group.userData.systemRenderRadius = radius;
		const systemViewTuning = this.getSystemPlanetRenderTuning(planetDefinition);
		const isSolidSystemPlanet =
			      planetDefinition.class !== 'gas_giant' &&
			      planetDefinition.class !== 'ice_giant';

		planet.setRenderTuning({
			                       ...systemViewTuning,
			                       ambient: isSolidSystemPlanet
			                                ? Math.max(systemViewTuning.ambient ?? 0.68, 0.96)
			                                : systemViewTuning.ambient,
			                       exposureScale: isSolidSystemPlanet
			                                      ? Math.max(systemViewTuning.exposureScale ?? 1.16, 1.42)
			                                      : systemViewTuning.exposureScale,
			                       horizonGlowScale: isSolidSystemPlanet
			                                         ? Math.max(systemViewTuning.horizonGlowScale ?? 1.0, 1.18)
			                                         : systemViewTuning.horizonGlowScale,
			                       proceduralColorStrength: isSolidSystemPlanet
			                                                ? Math.max(systemViewTuning.proceduralColorStrength ?? 0.65, 0.92)
			                                                : systemViewTuning.proceduralColorStrength,
			                       surfaceTextureStrength: isSolidSystemPlanet
			                                               ? Math.max(systemViewTuning.surfaceTextureStrength ?? 1.0, 1.20)
			                                               : systemViewTuning.surfaceTextureStrength,
		                       });

		planet.setHorizonCullingEnabled(false);
		planet.setPatchFrustumCullingEnabled(false);
		planet.setRenderQuality('idle');

		//planet.group.getObjectByName('PlanetDepthOccluder')?.removeFromParent();

		return planet;
	}

	private createSystemPlanetPreview(
		planet: StrategicNode['system']['planets'][number],
		radius: number,
	): THREE.Group {
		const group = new THREE.Group();
		const previewStyle = this.getPlanetPreviewStyle(planet.class);
		const body = new THREE.Mesh(
			new THREE.SphereGeometry(radius, 32, 16),
			new THREE.MeshStandardMaterial({
				                               color: previewStyle.color,
				                               emissive: previewStyle.emissive,
				                               emissiveIntensity: previewStyle.emissiveIntensity,
				                               roughness: previewStyle.roughness,
				                               metalness: previewStyle.metalness,
			                               }),
		);

		group.name = `${planet.name} Preview`;
		group.add(body);

		if (planet.rings?.enabled) {
			const ring = new THREE.Mesh(
				new THREE.RingGeometry(radius * 1.35, radius * 2.15, 48),
				new THREE.MeshBasicMaterial({
					                            color: 0xb7b1a2,
					                            side: THREE.DoubleSide,
					                            transparent: true,
					                            opacity: 0.34,
					                            depthWrite: false,
					                            depthTest: true,
				                            }),
			);

			ring.rotation.x = Math.PI * 0.5;
			group.add(ring);
		}

		return group;
	}

	private createSystemStarGlow(
		color: THREE.Color,
		starRadius: number,
	): THREE.Group {
		const group = new THREE.Group();
		group.name = 'System Star Volumetric Glow';
		group.renderOrder = 4;
		const texture = this.createSystemStarGlowTexture(color);

		const glowLayers = [
			{
				scale: 3.20,
				opacity: 0.42,
			},
			{
				scale: 5.30,
				opacity: 0.22,
			},
			{
				scale: 8.20,
				opacity: 0.095,
			},
			{
				scale: 12.40,
				opacity: 0.040,
			},
		];

		for (const layer of glowLayers) {
			const size = starRadius * layer.scale;
			const glow = new THREE.Sprite(
				new THREE.SpriteMaterial({
					                         map: texture,
					                         color,
					                         transparent: true,
					                         opacity: layer.opacity,
					                         blending: THREE.AdditiveBlending,
					                         depthWrite: false,
					                         depthTest: true,
				                         }),
			);

			glow.name = 'System Star Glow Layer';
			glow.renderOrder = group.renderOrder;
			glow.scale.set(size, size, 1);
			group.add(glow);
		}

		return group;
	}

	private createSystemStarGlowTexture(
		color: THREE.Color,
	): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		const center = canvas.width * 0.5;
		const gradient = context.createRadialGradient(
			center,
			center,
			0,
			center,
			center,
			center,
		);
		const glowColor = `#${color.getHexString()}`;
		const glowRed = Math.round(color.r * 255);
		const glowGreen = Math.round(color.g * 255);
		const glowBlue = Math.round(color.b * 255);

		gradient.addColorStop(0.00, glowColor);
		gradient.addColorStop(0.18, glowColor);
		gradient.addColorStop(
			0.46,
			`rgba(${glowRed}, ${glowGreen}, ${glowBlue}, 0.42)`,
		);
		gradient.addColorStop(1.00, 'rgba(0, 0, 0, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
	}

	private createOrbitLine(
		radius: number,
		color = 0x47657c,
		opacity = 0.48,
	): THREE.Line {
		const points: THREE.Vector3[] = [];
		const segments = 128;

		for (let index = 0; index <= segments; index++) {
			const angle = (index / segments) * Math.PI * 2;
			points.push(
				new THREE.Vector3(
					Math.cos(angle) * radius,
					0,
					Math.sin(angle) * radius,
				),
			);
		}

		const line = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(points),
			new THREE.LineBasicMaterial({
				                            color,
				                            transparent: true,
				                            opacity,
				                            depthWrite: false,
				                            depthTest: true,
			                            }),
		);

		line.renderOrder = -20;

		return line;
	}

	private disposeObject(object: THREE.Object3D): void {
		const disposedTextures = new Set<THREE.Texture>();

		object.traverse((item) => {
			if (
				item instanceof THREE.Mesh ||
				item instanceof THREE.Line ||
				item instanceof THREE.Points
			) {
				item.geometry.dispose();
			}

			if (
				!(
					item instanceof THREE.Mesh ||
					item instanceof THREE.Line ||
					item instanceof THREE.Points ||
					item instanceof THREE.Sprite
				)
			) {
				return;
			}

			const material = item.material as THREE.Material | THREE.Material[];

			for (const entry of Array.isArray(material) ? material : [material]) {
				const mappedMaterial = entry as THREE.Material & {
					map?: THREE.Texture;
				};

				if (
					mappedMaterial.map &&
					!disposedTextures.has(mappedMaterial.map)
				) {
					mappedMaterial.map.dispose();
					disposedTextures.add(mappedMaterial.map);
				}

				entry.dispose();
			}
		});
	}

	private getBackdropPalette(seed: number): BackdropPalette {
		const palettes: BackdropPalette[] = [
			{
				deep: new THREE.Color(0x030814),
				mid: new THREE.Color(0x10243a),
				nebulaA: new THREE.Color(0x2b6f86),
				nebulaB: new THREE.Color(0x5a376f),
				accent: new THREE.Color(0xd89b63),
			},
			{
				deep: new THREE.Color(0x050712),
				mid: new THREE.Color(0x18203a),
				nebulaA: new THREE.Color(0x315b8f),
				nebulaB: new THREE.Color(0x7b4056),
				accent: new THREE.Color(0xe0c177),
			},
			{
				deep: new THREE.Color(0x040911),
				mid: new THREE.Color(0x12302f),
				nebulaA: new THREE.Color(0x3f7765),
				nebulaB: new THREE.Color(0x345681),
				accent: new THREE.Color(0xd88458),
			},
		];

		return palettes[Math.abs(Math.floor(seed)) % palettes.length];
	}


	private hashString(value: string): number {
		let hash = 2166136261;

		for (let index = 0; index < value.length; index++) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}

		return hash >>> 0;
	}

	private hash01(seed: number, index: number, salt: number): number {
		const value = Math.sin(
			seed * 12.9898 +
			index * 78.233 +
			salt * 37.719
		) * 43758.5453;

		return value - Math.floor(value);
	}

	private getSelectedFleet(): Fleet | null {
		return this.world.fleets.find(
			(fleet) => fleet.id === this.world.selectedFleetId,
		) ?? null;
	}

	private getFleetHullText(fleet: Fleet): string {
		const ships = fleet.shipIds
			.map((shipId) => this.world.ships.find((ship) => ship.id === shipId))
			.filter((ship): ship is ShipDefinition => Boolean(ship));
		const hull = ships.reduce((sum, ship) => sum + ship.hull, 0);
		const maxHull = ships.reduce((sum, ship) => sum + ship.maxHull, 0);

		if (maxHull <= 0) {
			return '0%';
		}

		return `${Math.round((hull / maxHull) * 100)}%`;
	}

	private getFleetOrderLabel(fleet: Fleet): string {
		switch (fleet.order.type) {
			case 'attack_fleet':
				return 'attack';

			case 'move_strategic':
				return `jump ${Math.round(fleet.order.progress * 100)}%`;

			case 'move_tactical':
				return fleet.order.space === 'system' ? 'system move' : 'move';

			case 'hold':
				return 'hold';
		}
	}

	private getNode(id: string): StrategicNode | null {
		return this.world.nodes.find((node) => node.id === id) ?? null;
	}

	private nodeToVector(node: StrategicNode, y: number): THREE.Vector3 {
		return new THREE.Vector3(
			node.position.x,
			y,
			node.position.y,
		);
	}

	private getNodeRadius(node: StrategicNode): number {
		switch (node.kind) {
			case 'homeworld':
				return 1.45;

			case 'resource':
				return 1.05;

			case 'chokepoint':
				return 0.86;

			case 'frontier':
				return 0.72;
		}
	}

	private getPlanetOrbitRadius(index: number, semiMajorAxis: number): number {
		const baseOrbit =
			      18.0 +
			      index * 14.0 +
			      Math.log2(Math.max(1.1, semiMajorAxis)) * 1.80;

		return baseOrbit * this.systemScale;
	}

	private getSystemPlanetOrbitAngle(
		index: number,
		planet: StrategicNode['system']['planets'][number],
	): number {
		const goldenAngle = Math.PI * (3 - Math.sqrt(5));
		const seedJitter = ((planet.seed % 1000) / 1000 - 0.5) * 0.56;

		return index * goldenAngle + seedJitter;
	}

	private getSystemPlanetRenderRadius(
		planet: StrategicNode['system']['planets'][number],
	): number {
		const baseRadius = THREE.MathUtils.clamp(
			planet.physical.radius / 2.2,
			1.85,
			5.8,
		);

		const classScale =
			      planet.class === 'gas_giant'
			      ? 1.95
			      : planet.class === 'ice_giant'
			        ? 1.68
			        : planet.class === 'ocean'
			          ? 1.34
			          : 1.08;

		return baseRadius * classScale * this.systemPlanetScale;
	}

	private getSystemPlanetRenderTuning(
		planet: StrategicNode['system']['planets'][number],
	): Parameters<Planet['setRenderTuning']>[0] {
		switch (planet.class) {
			case 'ocean':
				return {
					ambient: 1.02,
					exposureScale: 1.62,
					horizonGlowScale: 1.14,
					proceduralColorStrength: 1.04,
					surfaceTextureStrength: 1.08,
				};

			case 'terrestrial':
				return {
					ambient: 0.96,
					exposureScale: 1.56,
					horizonGlowScale: 1.08,
					proceduralColorStrength: 1.02,
					surfaceTextureStrength: 1.04,
				};

			case 'ice':
			case 'ice_giant':
				return {
					ambient: 1.04,
					exposureScale: 1.62,
					horizonGlowScale: 1.28,
					proceduralColorStrength: 1.04,
				};

			case 'lava':
				return {
					ambient: 0.88,
					exposureScale: 1.78,
					horizonGlowScale: 1.52,
					proceduralColorStrength: 1.12,
				};

			case 'toxic':
				return {
					ambient: 1.00,
					exposureScale: 1.62,
					horizonGlowScale: 1.34,
					proceduralColorStrength: 1.12,
					surfaceTextureStrength: 1.08,
				};

			case 'desert':
				return {
					ambient: 0.96,
					exposureScale: 1.60,
					horizonGlowScale: 0.76,
					proceduralColorStrength: 1.08,
					surfaceTextureStrength: 1.12,
				};

			case 'metal_rich':
				return {
					ambient: 0.94,
					exposureScale: 1.60,
					horizonGlowScale: 0.34,
					proceduralColorStrength: 1.08,
					surfaceTextureStrength: 1.14,
				};

			case 'carbon':
				return {
					ambient: 0.98,
					exposureScale: 1.72,
					horizonGlowScale: 0.58,
					proceduralColorStrength: 1.10,
					surfaceTextureStrength: 1.12,
				};

			case 'barren':
				return {
					ambient: 0.92,
					exposureScale: 1.56,
					horizonGlowScale: 0.50,
					proceduralColorStrength: 1.06,
					surfaceTextureStrength: 1.16,
				};

			case 'rocky':
				return {
					ambient: 0.92,
					exposureScale: 1.56,
					horizonGlowScale: 0.62,
					proceduralColorStrength: 1.06,
					surfaceTextureStrength: 1.16,
				};

			case 'gas_giant':
				return {
					ambient: 0.82,
					exposureScale: 1.44,
				};
		}
	}

	private getPlanetPreviewStyle(
		planetClass: StrategicNode['system']['planets'][number]['class'],
	): {
		color: THREE.ColorRepresentation;
		emissive: THREE.ColorRepresentation;
		emissiveIntensity: number;
		roughness: number;
		metalness: number;
	} {
		switch (planetClass) {
			case 'ocean':
				return {
					color: 0x0876c8,
					emissive: 0x00182a,
					emissiveIntensity: 0.10,
					roughness: 0.50,
					metalness: 0.02,
				};

			case 'terrestrial':
				return {
					color: 0x4da76a,
					emissive: 0x06180c,
					emissiveIntensity: 0.08,
					roughness: 0.72,
					metalness: 0.02,
				};

			case 'desert':
				return {
					color: 0xc98a45,
					emissive: 0x1d0d03,
					emissiveIntensity: 0.08,
					roughness: 0.88,
					metalness: 0.01,
				};

			case 'ice':
				return {
					color: 0xbfdff2,
					emissive: 0x07131b,
					emissiveIntensity: 0.10,
					roughness: 0.44,
					metalness: 0.02,
				};

			case 'ice_giant':
				return {
					color: 0x80c9f4,
					emissive: 0x071a2a,
					emissiveIntensity: 0.14,
					roughness: 0.40,
					metalness: 0.01,
				};

			case 'lava':
				return {
					color: 0x7f140a,
					emissive: 0xff2b08,
					emissiveIntensity: 0.30,
					roughness: 0.62,
					metalness: 0.05,
				};

			case 'toxic':
				return {
					color: 0x8aa28f,
					emissive: 0x1a2316,
					emissiveIntensity: 0.16,
					roughness: 0.76,
					metalness: 0.01,
				};

			case 'carbon':
				return {
					color: 0x252321,
					emissive: 0x050403,
					emissiveIntensity: 0.05,
					roughness: 0.82,
					metalness: 0.08,
				};

			case 'metal_rich':
				return {
					color: 0x9d9788,
					emissive: 0x0b0b0b,
					emissiveIntensity: 0.06,
					roughness: 0.46,
					metalness: 0.38,
				};

			case 'gas_giant':
				return {
					color: 0xc69054,
					emissive: 0x1b0e05,
					emissiveIntensity: 0.08,
					roughness: 0.58,
					metalness: 0.01,
				};

			case 'rocky':
				return {
					color: 0x766f68,
					emissive: 0x070707,
					emissiveIntensity: 0.04,
					roughness: 0.90,
					metalness: 0.04,
				};

			case 'barren':
				return {
					color: 0x8d7a65,
					emissive: 0x080503,
					emissiveIntensity: 0.04,
					roughness: 0.92,
					metalness: 0.03,
				};
		}
	}
}
