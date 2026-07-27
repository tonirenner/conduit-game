import * as THREE from 'three';

import type {
	AppRenderer,
	RendererMode,
} from '../render/RendererFactory';

import {
	createDefaultCubeFaces,
	TerrainTextureSet,
	type TerrainTextureFace,
} from './TerrainTextureSet';

import { createTerrainTextureBakeMaterial } from './TerrainTextureBakeMaterial';

export type TerrainTextureBakeOptions = {
	resolution: number;
	maxEncodedHeight: number;
};

export class TerrainTextureBakeManager {
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.OrthographicCamera(
		-1,
		1,
		1,
		-1,
		0,
		1,
	);

	private readonly quad: THREE.Mesh;
	private readonly bakeMaterial = createTerrainTextureBakeMaterial();

	constructor(
		private readonly renderer: AppRenderer,
		private readonly rendererMode: RendererMode,
	) {
		this.quad = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			this.bakeMaterial.material,
		);

		this.quad.frustumCulled = false;
		this.scene.add(this.quad);
	}

	async bake(
		options: TerrainTextureBakeOptions = {
			resolution: 1024,
			maxEncodedHeight: 0.42,
		},
	): Promise<TerrainTextureSet | null> {
		if (this.rendererMode !== 'webgpu') {
			return null;
		}

		const faceDefinitions = createDefaultCubeFaces();
		const faces: TerrainTextureFace[] = [];

		const previousRenderTarget = this.renderer.getRenderTarget();

		for (let index = 0; index < faceDefinitions.length; index++) {
			const definition = faceDefinitions[index];

			const target = this.createRenderTarget(
				options.resolution,
				definition.name,
			);

			this.bakeMaterial.setFace(definition.face);

			this.renderer.setRenderTarget(target);
			this.renderer.setClearColor(0x000000, 0);
			this.renderer.clear();

			await this.renderBakeScene();

			faces.push({
				           index,
				           name: definition.name,
				           face: definition.face,
				           dataTarget: target,
			           });
		}

		this.renderer.setRenderTarget(previousRenderTarget);

		return new TerrainTextureSet(
			{
				resolution: options.resolution,
				maxEncodedHeight: options.maxEncodedHeight,
			},
			faces,
		);
	}

	private async renderBakeScene(): Promise<void> {
		if (typeof this.renderer.renderAsync === 'function') {
			await this.renderer.renderAsync(
				this.scene,
				this.camera,
			);

			return;
		}

		this.renderer.render(
			this.scene,
			this.camera,
		);
	}

	private createRenderTarget(
		resolution: number,
		name: string,
	): THREE.WebGLRenderTarget {
		const target = new THREE.WebGLRenderTarget(
			resolution,
			resolution,
			{
				format: THREE.RGBAFormat,
				type: THREE.HalfFloatType,
				depthBuffer: false,
				stencilBuffer: false,
				magFilter: THREE.LinearFilter,
				minFilter: THREE.LinearFilter,
				generateMipmaps: false,
				colorSpace: THREE.NoColorSpace,
			},
		);

		target.texture.name = `TerrainDataTexture.${name}`;

		return target;
	}
}
