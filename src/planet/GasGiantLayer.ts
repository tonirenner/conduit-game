import * as THREE from 'three';

export type GasGiantLayerKind = 'gas_giant' | 'ice_giant';

export type GasGiantLayerOptions = {
	kind: GasGiantLayerKind;
	radius: number;
	seed: number;
};

/**
 * Phase 7a.1:
 *
 * Simple placeholder renderer for non-solid planets.
 *
 * This is intentionally not the final GasGiantRenderer yet.
 * It only gives renderer routing a visible target without using terrain.
 */
export class GasGiantLayer {
	public readonly group: THREE.Group;
	public readonly mesh: THREE.Mesh;

	private readonly bands: THREE.Mesh[] = [];

	constructor(
		private readonly options: GasGiantLayerOptions,
	) {
		this.group = new THREE.Group();
		this.group.name =
			options.kind === 'ice_giant'
			? 'IceGiantLayer'
			: 'GasGiantLayer';

		this.mesh = this.createBody();
		this.group.add(this.mesh);

		this.createBands();
	}

	update(deltaSeconds: number): void {
		this.group.rotation.y += deltaSeconds * 0.0009;

		for (let index = 0; index < this.bands.length; index++) {
			const band = this.bands[index];

			band.rotation.z +=
				deltaSeconds *
				(0.0008 + index * 0.00008);
		}
	}

	dispose(): void {
		this.group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) {
				return;
			}

			object.geometry.dispose();

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

	private createBody(): THREE.Mesh {
		const geometry = new THREE.SphereGeometry(
			this.options.radius,
			160,
			96,
		);

		const material = new THREE.MeshPhongMaterial({
			                                             color:
				                                             this.options.kind === 'ice_giant'
				                                             ? 0x6fa8d8
				                                             : 0xb99162,
			                                             emissive:
				                                             this.options.kind === 'ice_giant'
				                                             ? 0x102333
				                                             : 0x2d1d0f,
			                                             emissiveIntensity: 0.18,
			                                             shininess: 18,
			                                             specular: new THREE.Color(
				                                             this.options.kind === 'ice_giant'
				                                             ? 0xb8e2ff
				                                             : 0xe8d0a2,
			                                             ),
		                                             });

		const mesh = new THREE.Mesh(
			geometry,
			material,
		);

		mesh.name =
			this.options.kind === 'ice_giant'
			? 'IceGiantBody'
			: 'GasGiantBody';

		mesh.renderOrder = 1;

		return mesh;
	}

	private createBands(): void {
		const bandCount =
			      this.options.kind === 'ice_giant'
			      ? 7
			      : 11;

		for (let index = 0; index < bandCount; index++) {
			const latitude =
				      -0.72 +
				      (index / Math.max(1, bandCount - 1)) *
				      1.44;

			const bandRadius =
				      this.options.radius *
				      Math.sqrt(
					      Math.max(
						      0.05,
						      1 - latitude * latitude,
					      ),
				      );

			const tubeRadius =
				      this.options.radius *
				      (
					      this.options.kind === 'ice_giant'
					      ? 0.007
					      : 0.011
				      );

			const geometry = new THREE.TorusGeometry(
				bandRadius,
				tubeRadius,
				8,
				192,
			);

			const color =
				      this.options.kind === 'ice_giant'
				      ? this.getIceBandColor(index)
				      : this.getGasBandColor(index);

			const material = new THREE.MeshBasicMaterial({
				                                             color,
				                                             transparent: true,
				                                             opacity:
					                                             this.options.kind === 'ice_giant'
					                                             ? 0.22
					                                             : 0.32,
				                                             depthWrite: false,
				                                             depthTest: true,
			                                             });

			const band = new THREE.Mesh(
				geometry,
				material,
			);

			band.name = `GasBand_${index}`;
			band.position.y = latitude * this.options.radius;
			band.renderOrder = 4;

			this.bands.push(band);
			this.group.add(band);
		}
	}

	private getGasBandColor(index: number): THREE.Color {
		const colors = [
			0x6b4a2d,
			0xd2b17d,
			0x8f6b45,
			0xe6c996,
			0x5f3e27,
		];

		return new THREE.Color(
			colors[index % colors.length],
		);
	}

	private getIceBandColor(index: number): THREE.Color {
		const colors = [
			0x4c83aa,
			0xaed8f4,
			0x6ba6cf,
			0xd4efff,
		];

		return new THREE.Color(
			colors[index % colors.length],
		);
	}
}
