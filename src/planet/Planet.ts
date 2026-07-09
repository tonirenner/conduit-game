import * as THREE from 'three';
import { CubeSphere } from './CubeSphere';
import { CloudLayer } from './CloudLayer';
import { AtmosphereLayer } from './AtmosphereLayer';
import { createPlanetSurfaceMaterial } from './PlanetSurfaceMaterial';

export type PlanetRenderQuality = 'moving' | 'idle';

export class Planet {
	public readonly group: THREE.Group;

	private readonly surfaceMaterial: THREE.ShaderMaterial;
	private readonly planetBody: THREE.Mesh;
	private readonly planet: CubeSphere;
	private readonly atmosphere: AtmosphereLayer;
	private readonly clouds: CloudLayer;
	private readonly depthOccluder: THREE.Mesh;

	private readonly atmosphereRadius: number;

	private currentRenderQuality: PlanetRenderQuality = 'idle';

	constructor(private readonly radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'PlanetGroup';

		this.atmosphereRadius = radius * 1.045;

		this.surfaceMaterial = createPlanetSurfaceMaterial(
			radius,
			this.atmosphereRadius,
		);

		this.planetBody = this.createPlanetBody(radius);
		this.planet = this.createPlanet(radius, this.surfaceMaterial);
		this.atmosphere = new AtmosphereLayer(radius);
		this.clouds = new CloudLayer(radius);
		this.depthOccluder = this.createDepthOccluder(radius);

		this.group.add(this.depthOccluder);
		this.group.add(this.planetBody);
		this.group.add(this.planet);
		this.group.add(this.clouds.group);
		this.group.add(this.atmosphere.mesh);
	}

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		this.planet.rotation.y += 0.0008;

		const heightAboveSurface = cameraPosition.length() - this.radius;

		this.surfaceMaterial.uniforms.uCameraPosition.value.copy(cameraPosition);
		this.updateSurfaceAtmosphereUniforms(heightAboveSurface);

		this.clouds.update(deltaSeconds);
		this.clouds.updateLOD(cameraPosition.length(), this.radius);

		this.atmosphere.update();

		this.planet.updateLOD(cameraPosition);
	}

	setRenderQuality(quality: PlanetRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.setUniform('uSurfaceDetailStrength', 0.25);
			this.setUniform('uProceduralColorStrength', 0.25);
			this.clouds.setRenderQuality(quality);
			this.atmosphere.setRenderQuality(quality);
			return;
		}

		this.setUniform('uSurfaceDetailStrength', 1.0);
		this.setUniform('uProceduralColorStrength', 0.65);
		this.clouds.setRenderQuality(quality);
		this.atmosphere.setRenderQuality(quality);
	}

	private updateSurfaceAtmosphereUniforms(heightAboveSurface: number): void {
		const lowAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.10,
			1.10,
		);

		const approachAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.70,
			4.00,
		);

		const veryLowAtmosphere = 1.0 - THREE.MathUtils.smoothstep(
			heightAboveSurface,
			0.05,
			0.55,
		);

		const cinematicAtmosphere = Math.max(
			lowAtmosphere,
			approachAtmosphere * 0.72,
		);

		this.setUniform(
			'uHazeStrength',
			THREE.MathUtils.lerp(0.75, 2.45, cinematicAtmosphere),
		);

		this.setUniform(
			'uMieStrength',
			THREE.MathUtils.lerp(0.44, 1.85, lowAtmosphere),
		);

		this.setUniform(
			'uHorizonGlowStrength',
			THREE.MathUtils.lerp(0.85, 3.10, cinematicAtmosphere),
		);

		this.setUniform(
			'uAtmosphereDensity',
			THREE.MathUtils.lerp(1.05, 2.75, lowAtmosphere),
		);

		this.setUniform(
			'uMaxAerialDistance',
			THREE.MathUtils.lerp(14.0, 3.2, lowAtmosphere),
		);

		this.setUniform(
			'uExposure',
			THREE.MathUtils.lerp(1.30, 1.58, veryLowAtmosphere),
		);
	}

	private setUniform(name: string, value: number): void {
		const uniform = this.surfaceMaterial.uniforms[name];

		if (!uniform) {
			return;
		}

		uniform.value = value;
	}

	private createPlanet(
		radius: number,
		material: THREE.ShaderMaterial,
	): CubeSphere {
		const cubeSphere = new CubeSphere(radius, 22, material);

		cubeSphere.name = 'PlanetTerrain';
		cubeSphere.renderOrder = 1;

		return cubeSphere;
	}

	private createPlanetBody(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.996, 128, 128);

		const material = new THREE.MeshPhongMaterial({
			                                             color: 0x0a2230,
			                                             emissive: 0x031018,
			                                             emissiveIntensity: 0.08,
			                                             shininess: 8,
			                                             specular: new THREE.Color(0x16384c),
		                                             });

		const mesh = new THREE.Mesh(geometry, material);

		mesh.name = 'PlanetBody';
		mesh.renderOrder = 0;

		return mesh;
	}

	private createDepthOccluder(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.999, 128, 128);

		const material = new THREE.MeshBasicMaterial({
			                                             colorWrite: false,
			                                             depthWrite: true,
			                                             depthTest: true,
		                                             });

		const mesh = new THREE.Mesh(geometry, material);

		mesh.name = 'PlanetDepthOccluder';
		mesh.renderOrder = -1000;

		return mesh;
	}

	getTerrainStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
	} {
		return this.planet.getStats();
	}
}
