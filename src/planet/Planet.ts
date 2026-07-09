import * as THREE from 'three';

import { AtmosphereLayer } from './AtmosphereLayer';
import { CloudLayer } from './CloudLayer';
import { CubeSphere } from './CubeSphere';
import { createPlanetSurfaceMaterial } from './PlanetSurfaceMaterial';

export class Planet {
	public readonly group: THREE.Group;

	private readonly planet: CubeSphere;
	private readonly atmosphere: AtmosphereLayer;
	private readonly clouds: CloudLayer;
	private readonly depthOccluder: THREE.Mesh;
	private readonly surfaceMaterial: THREE.ShaderMaterial;

	constructor(private readonly radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'Planet';

		this.surfaceMaterial = createPlanetSurfaceMaterial();

		this.depthOccluder = this.createDepthOccluder(radius);
		this.planet = this.createPlanet(radius);
		this.clouds = new CloudLayer(radius);
		this.atmosphere = new AtmosphereLayer(radius);

		this.group.add(this.depthOccluder);
		this.group.add(this.planet);
		this.group.add(this.clouds.group);
		this.group.add(this.atmosphere.mesh);
	}

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		this.surfaceMaterial.uniforms.uCameraPosition.value.copy(cameraPosition);

		this.planet.rotation.y += 0.0008;

		this.clouds.update(deltaSeconds);
		this.clouds.updateLOD(cameraPosition.length(), this.radius);

		this.atmosphere.update();

		this.planet.updateLOD(cameraPosition);
	}

	private createPlanet(radius: number): CubeSphere {
		const planet = new CubeSphere(radius, 24, this.surfaceMaterial);

		planet.name = 'PlanetSurface';
		planet.renderOrder = 0;

		return planet;
	}

	private createDepthOccluder(radius: number): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(radius * 0.998, 128, 128);

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
