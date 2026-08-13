import * as THREE from 'three';

import {
	getTerrainSample,
	type TerrainSeedConfig,
} from './terrain/noise';
import type { SurfaceRenderProfile } from '@conduit/planet/rendering';
import { appendRegularGridIndices } from './terrain/TerrainGeometryUtils';

export type NearSurfaceTerrainLayerOptions = {
	radius: number;
	terrainSeedConfig: TerrainSeedConfig;
	surfaceProfile: SurfaceRenderProfile;
};

export class NearSurfaceTerrainLayer {
	public readonly group = new THREE.Group();

	private readonly material: THREE.MeshStandardMaterial;
	private mesh: THREE.Mesh | null = null;
	private lastAnchor = new THREE.Vector3(0, 1, 0);
	private lastCameraHeight = Number.POSITIVE_INFINITY;
	private updateCooldown = 0;
	private readonly resolution = 56;
	private readonly patchSize = 0.78;
	private readonly maxVisibleHeight = 0.34;

	constructor(
		private readonly options: NearSurfaceTerrainLayerOptions,
	) {
		this.group.name = 'NearSurfaceTerrainLayer';
		this.group.visible = false;
		this.material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.86,
			metalness: 0.02,
			side: THREE.FrontSide,
		});
	}

	update(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		const cameraDistance = cameraPosition.length();
		const heightAboveSurface = cameraDistance - this.options.radius;
		const visible =
			heightAboveSurface < this.maxVisibleHeight &&
			heightAboveSurface > -0.03;

		this.group.visible = visible;
		this.lastCameraHeight = heightAboveSurface;

		if (!visible) {
			return;
		}

		const anchor = cameraPosition.clone()
			.normalize();

		this.updateCooldown -= deltaSeconds;

		if (
			this.mesh &&
			this.updateCooldown > 0 &&
			anchor.dot(this.lastAnchor) > 0.9994
		) {
			return;
		}

		this.lastAnchor.copy(anchor);
		this.updateCooldown = 0.18;
		this.rebuild(anchor);
	}

	getDebugStats(): {
		enabled: boolean;
		visible: boolean;
		resolution: number;
		patchSize: number;
		height: number;
	} {
		return {
			enabled: true,
			visible: this.group.visible,
			resolution: this.resolution,
			patchSize: this.patchSize,
			height: this.lastCameraHeight,
		};
	}

	dispose(): void {
		this.mesh?.geometry.dispose();
		this.material.dispose();
	}

	private rebuild(anchor: THREE.Vector3): void {
		const right = new THREE.Vector3();
		const forward = new THREE.Vector3();
		this.createTangentBasis(anchor, right, forward);

		const positions: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];
		const rowSize = this.resolution + 1;

		for (let y = 0; y <= this.resolution; y++) {
			for (let x = 0; x <= this.resolution; x++) {
				const u = (x / this.resolution - 0.5) * this.patchSize;
				const v = (y / this.resolution - 0.5) * this.patchSize;
				const sampleNormal = anchor
					.clone()
					.addScaledVector(right, u / this.options.radius)
					.addScaledVector(forward, v / this.options.radius)
					.normalize();

				const sample = getTerrainSample(
					sampleNormal,
					this.options.terrainSeedConfig,
				);

				const edgeDistance = Math.min(
					x,
					y,
					this.resolution - x,
					this.resolution - y,
				);
				const edgeFade = THREE.MathUtils.smoothstep(
					edgeDistance / Math.max(1, this.resolution * 0.12),
					0,
					1,
				);
				const surfacePoint = sampleNormal.multiplyScalar(
					this.options.radius + sample.height * edgeFade + 0.006,
				);
				const color = this.getTerrainColor(sample);

				positions.push(
					surfacePoint.x,
					surfacePoint.y,
					surfacePoint.z,
				);

				colors.push(color.r, color.g, color.b);
			}
		}

		appendRegularGridIndices(indices, this.resolution, rowSize);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(positions, 3),
		);
		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(colors, 3),
		);
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();

		if (!this.mesh) {
			this.mesh = new THREE.Mesh(geometry, this.material);
			this.mesh.name = 'NearSurfaceTerrainMesh';
			this.mesh.renderOrder = 3;
			this.group.add(this.mesh);
			return;
		}

		this.mesh.geometry.dispose();
		this.mesh.geometry = geometry;
	}

	private getTerrainColor(
		sample: ReturnType<typeof getTerrainSample>,
	): THREE.Color {
		const color = new THREE.Color();
		const profile = this.options.surfaceProfile.palette;
		const mountain = THREE.MathUtils.clamp(sample.mountainMask, 0, 1);
		const height = THREE.MathUtils.clamp(sample.height * 7.5, 0, 1);
		const land = THREE.MathUtils.clamp(sample.landMask, 0, 1);

		if (land < 0.54 && this.options.surfaceProfile.hasOcean) {
			color.setHex(0x163f52);
		} else if (profile === 'desert') {
			color.setHex(0x8f7a50);
		} else if (profile === 'ice') {
			color.setHex(0xb8c5c4);
		} else if (profile === 'lava') {
			color.setHex(0x2f2926);
		} else if (profile === 'toxic') {
			color.setHex(0x536f65);
		} else if (profile === 'carbon') {
			color.setHex(0x303235);
		} else {
			color.setHex(0x5f6b62);
		}

		color.lerp(
			new THREE.Color(0xb9bbb2),
			Math.max(mountain * 0.55, height * 0.35),
		);

		return color;
	}

	private createTangentBasis(
		normal: THREE.Vector3,
		outRight: THREE.Vector3,
		outForward: THREE.Vector3,
	): void {
		const up =
			      Math.abs(normal.y) < 0.92
			      ? new THREE.Vector3(0, 1, 0)
			      : new THREE.Vector3(1, 0, 0);

		outRight.copy(up)
			.cross(normal)
			.normalize();
		outForward.copy(normal)
			.cross(outRight)
			.normalize();
	}
}
