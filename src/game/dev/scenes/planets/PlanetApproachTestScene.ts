import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import { generatePlanetDefinition } from '@conduit/planet/generation';
import {
	getApproachProxyDistance,
	getApproachProxyScale,
	getSurfaceLatitudeLongitude,
	PlanetNearViewRuntime,
	PlanetTerrainSampler,
	createPlanetNearViewVisualProfile,
	selectPlanetLandingSite,
	type PlanetApproachState,
	type PlanetNearViewUpdate,
} from '@conduit/planet/near-view';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { Planet, createPlanetRenderProfile } from '@conduit/planet/rendering';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';

const LANDABLE_CLASSES: PlanetClass[] = [
	'barren', 'rocky', 'terrestrial', 'ocean', 'desert',
	'ice', 'lava', 'toxic', 'carbon', 'metal_rich',
];

const FIXED_START_ALTITUDES = {
	atmosphere: 24_000,
	surface: 350,
} as const;

type StartPreset = 'orbit' | keyof typeof FIXED_START_ALTITUDES;
const APPROACH_PROXY_RADIUS = 3_000;

export class PlanetApproachTestScene implements FeatureTestScene {
	readonly id = 'planet-approach';
	readonly name = 'Planet Approach & Landing';
	readonly category = 'Planets' as const;
	readonly description = 'Production planet approach with meter-scale streamed landing terrain.';

	private context: FeatureTestContext | null = null;
	private readonly root = new THREE.Group();
	private readonly ship = createLandingTestShip();
	private readonly hemisphereLight = new THREE.HemisphereLight(
		0xaed8ff,
		0x312b25,
		1.75,
	);
	private readonly sunLight = new THREE.DirectionalLight(0xfff1d2, 3.2);
	private runtime: PlanetNearViewRuntime | null = null;
	private approachPlanet: Planet | null = null;
	private definition: PlanetDefinition | null = null;
	private positionPlanetMeters = new THREE.Vector3();
	private readonly velocity = new THREE.Vector3();
	private forward = new THREE.Vector3(0, 0, -1);
	private readonly pressedKeys = new Set<string>();
	private stats: HTMLElement | null = null;
	private seed = 3001;
	private planetClass: PlanetClass = 'terrestrial';
	private requestLanding = false;
	private lastUpdate: PlanetNearViewUpdate | null = null;
	private lastState: PlanetApproachState | null = null;
	private previousFog: THREE.Fog | THREE.FogExp2 | null = null;
	private previousBackground: THREE.Color | THREE.Texture | THREE.CubeTexture | null = null;
	private previousCameraNear = 0.1;
	private previousCameraFar = 4_000;
	private previousCameraFov = 58;

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (isEditableTarget(event.target)) return;
		this.pressedKeys.add(event.code);

		if (event.code === 'KeyL' && !event.repeat) {
			this.requestLanding = !this.requestLanding;
		}
	};

	private readonly onKeyUp = (event: KeyboardEvent): void => {
		this.pressedKeys.delete(event.code);
	};

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'PlanetApproachTestScene';
		context.scene.add(this.root);
		this.previousFog = context.scene.fog;
		this.previousBackground = context.scene.background;
		this.previousCameraNear = context.camera.near;
		this.previousCameraFar = context.camera.far;
		this.previousCameraFov = context.camera.fov;
		context.scene.background = new THREE.Color(0x05080f);
		context.scene.fog = new THREE.FogExp2(0x7898ad, 0);
		context.controls.enabled = false;
		context.camera.near = 0.1;
		context.camera.far = 1_500_000;
		context.camera.fov = 62;
		context.camera.updateProjectionMatrix();

		this.root.add(this.ship);
		this.sunLight.position.copy(APPROACH_SUN_DIRECTION).multiplyScalar(50_000);
		this.root.add(this.hemisphereLight, this.sunLight);

		window.addEventListener('keydown', this.onKeyDown);
		window.addEventListener('keyup', this.onKeyUp);
		this.createUi(context.uiRoot);
		this.createRuntime('surface');
	}

	update(deltaSeconds: number): void {
		if (!this.context || !this.runtime) return;

		const delta = Math.min(deltaSeconds, 0.05);
		this.updateFlight(delta);
		let update = this.runtime.update(
			this.positionPlanetMeters,
			this.velocity,
			this.requestLanding,
		);

		if (update.landing.correctedPosition) {
			this.positionPlanetMeters.copy(update.landing.correctedPosition);

			if (update.landing.canLand) {
				this.velocity.set(0, 0, 0);
			} else {
				const radialUp = this.positionPlanetMeters.clone().normalize();
				const inwardSpeed = this.velocity.dot(radialUp);
				if (inwardSpeed < 0) this.velocity.addScaledVector(radialUp, -inwardSpeed);
			}

			update = this.runtime.update(
				this.positionPlanetMeters,
				this.velocity,
				this.requestLanding,
			);
		}

		this.lastUpdate = update;
		this.ship.position.copy(update.renderPosition);
		this.updateShipOrientation(update);
		this.updateApproachPlanetTransform(update);
		this.updateCamera(update, delta);
		this.updateApproachPlanet(delta);
		this.updateAtmosphere(update);
		this.updateStats();
		this.reportStateChange(update);
	}

	dispose(): void {
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('keyup', this.onKeyUp);
		this.runtime?.dispose();
		this.runtime = null;
		this.approachPlanet?.dispose();
		this.approachPlanet = null;

		if (this.context) {
			this.context.controls.enabled = true;
			this.context.controls.target.set(0, 0, 0);
			this.context.scene.fog = this.previousFog;
			this.context.scene.background = this.previousBackground;
			this.context.camera.near = this.previousCameraNear;
			this.context.camera.far = this.previousCameraFar;
			this.context.camera.fov = this.previousCameraFov;
			this.context.camera.up.set(0, 1, 0);
			this.context.camera.updateProjectionMatrix();
			this.context.controls.update();
			this.context.scene.remove(this.root);
		}

		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
	}

	reset(): void {
		this.createRuntime('surface');
	}

	private createRuntime(start: StartPreset): void {
		if (!this.context) return;

		if (this.approachPlanet) {
			this.root.remove(this.approachPlanet.group);
			this.approachPlanet.dispose();
			this.approachPlanet = null;
		}

		if (this.runtime) {
			this.root.remove(this.runtime.group);
			this.runtime.dispose();
			this.runtime = null;
		}

		this.context.clearReport();
		this.definition = generatePlanetDefinition(this.seed, {
			name: `Approach ${this.seed}`,
			semiMajorAxis: 1,
			starIrradiance: 1,
			forcePlanetClass: this.planetClass,
		});

		const sampler = new PlanetTerrainSampler(this.definition);
		const landingSite = selectPlanetLandingSite(sampler);
		const startAltitude = start === 'orbit'
			? sampler.radiusMeters
			: FIXED_START_ALTITUDES[start];
		this.runtime = new PlanetNearViewRuntime(
			this.definition,
			landingSite.direction,
			startAltitude,
			{ renderTerrain: false },
		);
		this.approachPlanet = this.createApproachPlanet(this.definition);
		const visualProfile = createPlanetNearViewVisualProfile(this.definition);
		this.hemisphereLight.color.copy(visualProfile.atmosphereColor)
			.lerp(new THREE.Color(0xdde8ed), 0.38);
		this.hemisphereLight.groundColor.set(
			this.definition.class === 'ice' ? 0x65777d : 0x4a453b,
		);

		const surface = this.runtime.sampler.sample(landingSite.direction);
		this.positionPlanetMeters.copy(landingSite.direction).multiplyScalar(
			surface.surfaceRadiusMeters + startAltitude,
		);
		this.velocity.set(0, 0, 0);
		this.forward = createTangentForward(landingSite.direction);
		this.requestLanding = false;
		this.lastUpdate = null;
		this.lastState = null;
		this.root.add(this.approachPlanet.group, this.runtime.group);
		this.context.report({
			status: 'pass',
			label: 'near-view runtime',
			detail:
				`${this.definition.class} / seed ${this.definition.seed} / ` +
				`${landingSite.biome} @ ${landingSite.latitudeDegrees.toFixed(1)}°`,
		});
	}

	private createApproachPlanet(definition: PlanetDefinition): Planet {
		if (!this.context) throw new Error('Feature context is not available.');

		const proxyDefinition: PlanetDefinition = {
			...definition,
			rings: definition.rings
				? { ...definition.rings, enabled: false }
				: undefined,
			moons: [],
		};
		const planet = new Planet(
			APPROACH_PROXY_RADIUS,
			this.context.rendererMode,
			null,
			{
				moonSystem: false,
				nearSurfaceTerrain: false,
				gasCloudParticles: false,
			},
			proxyDefinition,
			createPlanetRenderProfile(proxyDefinition),
		);
		planet.setAutoRotationEnabled(false);
		planet.setRenderQuality('moving');
		planet.setSunDirection(APPROACH_SUN_DIRECTION);

		return planet;
	}

	private updateFlight(deltaSeconds: number): void {
		if (!this.runtime) return;

		const radialUp = this.positionPlanetMeters.clone().normalize();
		this.forward.addScaledVector(radialUp, -this.forward.dot(radialUp)).normalize();
		const yaw =
			(this.pressedKeys.has('KeyA') ? 1 : 0) -
			(this.pressedKeys.has('KeyD') ? 1 : 0);
		if (yaw !== 0) {
			this.forward.applyAxisAngle(radialUp, yaw * deltaSeconds * 0.8).normalize();
		}

		if (this.runtime.landing.getState() === 'landed') {
			this.velocity.set(0, 0, 0);
			if (this.pressedKeys.has('Space')) {
				this.runtime.landing.takeOff();
				this.requestLanding = false;
				this.positionPlanetMeters.addScaledVector(radialUp, 4);
				this.velocity.addScaledVector(radialUp, 14);
			}
			return;
		}

		const boost =
			this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')
				? 3.5
				: 1;
		const forwardInput =
			(this.pressedKeys.has('KeyW') ? 1 : 0) -
			(this.pressedKeys.has('KeyS') ? 1 : 0);
		const verticalInput =
			(this.pressedKeys.has('Space') ? 1 : 0) -
			(this.pressedKeys.has('KeyC') ? 1 : 0);
		const altitude = Math.max(
			0,
			this.positionPlanetMeters.length() - this.runtime.sampler.radiusMeters,
		);
		const altitudeScale = THREE.MathUtils.smoothstep(
			altitude,
			20_000,
			this.runtime.sampler.radiusMeters,
		);
		const accelerationScale = THREE.MathUtils.lerp(1, 1_200, altitudeScale);
		this.velocity.addScaledVector(
			this.forward,
			forwardInput * 38 * boost * accelerationScale * deltaSeconds,
		);
		this.velocity.addScaledVector(
			radialUp,
			verticalInput * 28 * boost * accelerationScale * deltaSeconds,
		);
		this.velocity.addScaledVector(radialUp, -1.4 * deltaSeconds);
		this.velocity.multiplyScalar(Math.exp(-0.075 * deltaSeconds));
		const maxSpeed = THREE.MathUtils.lerp(
			420 * boost,
			180_000 * boost,
			altitudeScale,
		);
		if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);
		this.positionPlanetMeters.addScaledVector(this.velocity, deltaSeconds);
	}

	private updateApproachPlanetTransform(update: PlanetNearViewUpdate): void {
		if (!this.approachPlanet || !this.runtime) return;

		const radialUp = this.positionPlanetMeters.clone().normalize();
		const proxyDistance = getApproachProxyDistance(
			this.runtime.sampler.radiusMeters,
			update.landing.altitudeAboveTerrainMeters,
			APPROACH_PROXY_RADIUS,
			update.landing.surface.elevationMeters,
		);
		const proxyScale = getApproachProxyScale(
			this.runtime.sampler.radiusMeters,
			update.landing.altitudeAboveTerrainMeters,
			APPROACH_PROXY_RADIUS,
		);
		this.approachPlanet.group.position.copy(update.renderPosition)
			.addScaledVector(radialUp, -proxyDistance);
		this.approachPlanet.group.scale.setScalar(proxyScale);
		this.approachPlanet.group.visible = true;
	}

	private updateApproachPlanet(deltaSeconds: number): void {
		if (!this.approachPlanet || !this.context || !this.approachPlanet.group.visible) return;

		const cameraRelative = this.context.camera.position.clone()
			.sub(this.approachPlanet.group.position)
			.divideScalar(this.approachPlanet.group.scale.x);
		this.approachPlanet.update(cameraRelative, deltaSeconds);
	}

	private updateShipOrientation(update: PlanetNearViewUpdate): void {
		const up = this.positionPlanetMeters.clone().normalize();
		const right = new THREE.Vector3().crossVectors(this.forward, up).normalize();
		const correctedForward = new THREE.Vector3().crossVectors(up, right).normalize();
		this.ship.quaternion.setFromRotationMatrix(
			new THREE.Matrix4().makeBasis(right, up, correctedForward.negate()),
		);

		if (update.landing.state === 'landed') {
			const surfaceUp = update.landing.surface.normal;
			const landedRight = new THREE.Vector3().crossVectors(this.forward, surfaceUp).normalize();
			const landedForward = new THREE.Vector3().crossVectors(surfaceUp, landedRight).normalize();
			this.ship.quaternion.setFromRotationMatrix(
				new THREE.Matrix4().makeBasis(landedRight, surfaceUp, landedForward.negate()),
			);
		}
	}

	private updateCamera(update: PlanetNearViewUpdate, deltaSeconds: number): void {
		if (!this.context) return;

		const up = this.positionPlanetMeters.clone().normalize();
		const altitude = Math.max(0, update.landing.altitudeAboveTerrainMeters);
		const targetPosition = update.renderPosition.clone()
			.addScaledVector(this.forward, -22)
			.addScaledVector(up, 9);
		this.context.camera.position.sub(update.originShiftMeters);
		const blend = 1 - Math.exp(-5 * deltaSeconds);
		this.context.camera.position.lerp(targetPosition, blend);
		this.context.camera.up.lerp(up, blend).normalize();
		const orbitLook = THREE.MathUtils.smoothstep(altitude, 3_000, 100_000);
		const flightLookTarget = update.renderPosition.clone()
			.addScaledVector(this.forward, THREE.MathUtils.lerp(35, 70, orbitLook))
			.addScaledVector(up, THREE.MathUtils.lerp(1.5, -18, orbitLook));
		const lookTarget =
			this.approachPlanet?.group.visible && orbitLook > 0.55
				? this.approachPlanet.group.position
				: flightLookTarget;
		this.context.camera.lookAt(lookTarget);
	}

	private updateAtmosphere(update: PlanetNearViewUpdate): void {
		if (!this.context || !(this.context.scene.fog instanceof THREE.FogExp2)) return;

		const altitude = Math.max(0, update.landing.altitudeAboveTerrainMeters);
		const atmosphere = 1 - THREE.MathUtils.smoothstep(altitude, 8_000, 70_000);
		const atmosphereColor = new THREE.Color(
			this.definition?.atmosphere.color ?? '#7898ad',
		);
		const nearSurfaceFog = THREE.MathUtils.lerp(
			0.000075,
			0.000025,
			THREE.MathUtils.smoothstep(altitude, 1_000, 30_000),
		);
		this.context.scene.fog.density = atmosphere * nearSurfaceFog;
		this.context.scene.fog.color.copy(atmosphereColor);
		this.context.scene.background = new THREE.Color(0x05080f).lerp(
			atmosphereColor,
			atmosphere * 0.78,
		);
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:5px 0;">Class <select data-class>${LANDABLE_CLASSES.map((value) => `<option value="${value}"${value === this.planetClass ? ' selected' : ''}>${value}</option>`).join('')}</select></label>` +
			`<label style="display:block;margin:5px 0;">Seed <input data-seed type="number" value="${this.seed}" style="width:100px"></label>` +
			`<div><button data-start="orbit">Orbit</button><button data-start="atmosphere">Atmosphere</button><button data-start="surface">Surface</button></div>` +
			`<div style="margin-top:8px;opacity:.78">W/S thrust · A/D yaw · Space up/takeoff · C down · Shift boost · L landing request</div>` +
			`<div data-stats style="margin-top:9px;line-height:1.45"></div>`;
		this.stats = root.querySelector<HTMLElement>('[data-stats]');

		for (const button of root.querySelectorAll<HTMLButtonElement>('[data-start]')) {
			button.addEventListener('click', () => {
				const classInput = root.querySelector<HTMLSelectElement>('[data-class]');
				const seedInput = root.querySelector<HTMLInputElement>('[data-seed]');
				if (LANDABLE_CLASSES.includes(classInput?.value as PlanetClass)) {
					this.planetClass = classInput?.value as PlanetClass;
				}
				const nextSeed = Number(seedInput?.value);
				if (Number.isFinite(nextSeed)) this.seed = Math.max(1, Math.floor(nextSeed));
				this.createRuntime(button.dataset.start as StartPreset);
			});
		}
	}

	private updateStats(): void {
		if (!this.stats || !this.lastUpdate || !this.definition) return;

		const coordinates = getSurfaceLatitudeLongitude(
			this.positionPlanetMeters.clone().normalize(),
		);
		const landing = this.lastUpdate.landing;
		const terrain = this.lastUpdate.terrain;
		const transition = this.lastUpdate.transition;
		const planetTerrain = this.approachPlanet?.getTerrainStats();
		this.stats.innerHTML =
			`state: ${landing.state}<br>` +
			`altitude: ${landing.altitudeAboveTerrainMeters.toFixed(1)} m<br>` +
			`speed horizontal/vertical: ${landing.horizontalSpeed.toFixed(1)} / ${landing.verticalSpeed.toFixed(1)} m/s<br>` +
			`landing request: ${this.requestLanding ? 'armed' : 'off'} · slope ${landing.slopeDegrees.toFixed(1)}°<br>` +
			`surface: ${landing.surface.biome} · ${landing.surface.isWater ? 'water' : 'land'} · elevation ${landing.surface.elevationMeters.toFixed(0)} m<br>` +
			`render: continuous planet · detail ${transition.terrainWeight.toFixed(2)}<br>` +
			`lat/lon: ${THREE.MathUtils.radToDeg(coordinates.latitudeRadians).toFixed(4)} / ${THREE.MathUtils.radToDeg(coordinates.longitudeRadians).toFixed(4)}<br>` +
			`planet patches: ${planetTerrain?.visibleMeshes ?? 0} visible / ${planetTerrain?.totalPatches ?? 0} total · ${planetTerrain?.profile ?? 'far'} LOD ${planetTerrain?.maxLevel ?? 0}<br>` +
			`vertex spacing: ${((planetTerrain?.approximateVertexSpacing ?? 0) * (this.approachPlanet?.group.scale.x ?? 1)).toFixed(1)} m<br>` +
			`LOD balance: ${planetTerrain?.balance.violations ?? 0} violations · ${planetTerrain?.balance.splits ?? 0} splits<br>` +
			`morphing patches: ${planetTerrain?.morphingPatches ?? 0}<br>` +
			`collision terrain: ${terrain.cachedChunks} cached chunks<br>` +
			`floating-origin shifts: ${terrain.shiftCount}`;
	}

	private reportStateChange(update: PlanetNearViewUpdate): void {
		if (!this.context || this.lastState === update.landing.state) return;

		this.context.report({
			status: 'info',
			label: 'approach state',
			detail: update.landing.state,
		});
		this.lastState = update.landing.state;
	}
}

const APPROACH_SUN_DIRECTION = new THREE.Vector3(0.55, 0.72, 0.38).normalize();

function createLandingTestShip(): THREE.Group {
	const group = new THREE.Group();
	group.name = 'LandingTestShip';
	const hull = new THREE.Mesh(
		new THREE.CapsuleGeometry(1.2, 5.5, 6, 12),
		new THREE.MeshStandardMaterial({ color: 0x8aa4b2, metalness: 0.65, roughness: 0.28 }),
	);
	hull.rotation.x = Math.PI * 0.5;
	group.add(hull);
	const wing = new THREE.Mesh(
		new THREE.BoxGeometry(8, 0.28, 2.2),
		new THREE.MeshStandardMaterial({ color: 0x425967, metalness: 0.5, roughness: 0.36 }),
	);
	group.add(wing);
	return group;
}

function createTangentForward(direction: THREE.Vector3): THREE.Vector3 {
	const reference = Math.abs(direction.y) < 0.92
		? new THREE.Vector3(0, 1, 0)
		: new THREE.Vector3(1, 0, 0);
	return new THREE.Vector3().crossVectors(direction, reference).normalize();
}

function isEditableTarget(target: EventTarget | null): boolean {
	return target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement;
}
