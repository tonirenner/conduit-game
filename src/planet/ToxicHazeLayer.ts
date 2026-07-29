import * as THREE from 'three';

export type ToxicHazeLayerOptions = {
	radius: number;
};

export class ToxicHazeLayer {
	public readonly mesh: THREE.Mesh;

	constructor(options: ToxicHazeLayerOptions) {
		const geometry = new THREE.SphereGeometry(
			options.radius * 1.035,
			128,
			96,
		);

		const material = new THREE.MeshBasicMaterial({
			color: 0xc6c7a2,
			transparent: true,
			opacity: 0.115,
			side: THREE.BackSide,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending,
		});

		this.mesh = new THREE.Mesh(
			geometry,
			material,
		);

		this.mesh.name = 'ToxicHazeShell';
		this.mesh.renderOrder = 22;
	}

	update(): void {
		// Static haze shell.
	}

	dispose(): void {
		this.mesh.geometry.dispose();

		const material = this.mesh.material;

		if (Array.isArray(material)) {
			for (const item of material) {
				item.dispose();
			}

			return;
		}

		material.dispose();
	}
}
