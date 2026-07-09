import * as THREE from 'three';
import { CubeSphere } from './CubeSphere';
import { CloudLayer } from './CloudLayer';
import { AtmosphereLayer } from './AtmosphereLayer';
import { createPlanetSurfaceMaterial } from './PlanetSurfaceMaterial';

export class Planet {
	public readonly group: THREE.Group;

	private readonly surfaceMaterial: THREE.ShaderMaterial;
	private readonly planetBody: THREE.Mesh;
	private readonly planet: CubeSphere;
	private readonly atmosphere: AtmosphereLayer;
	private readonly clouds: CloudLayer;
	private readonly depthOccluder: THREE.Mesh;

	constructor(private readonly radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'PlanetGroup';

		this.surfaceMaterial = createPlanetSurfaceMaterial(radius);

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

		this.surfaceMaterial.uniforms.uCameraPosition.value.copy(cameraPosition);

		this.clouds.update(deltaSeconds);
		this.clouds.updateLOD(cameraPosition.length(), this.radius);

		this.atmosphere.update();

		this.planet.updateLOD(cameraPosition);
	}

	private createPlanet(radius: number, material: THREE.ShaderMaterial): CubeSphere {
		const cubeSphere = new CubeSphere(radius, 14, material);

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
