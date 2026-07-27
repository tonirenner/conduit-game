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

		const atlasColumns = 3;
		const atlasRows = 2;

		const atlasTarget = this.createAtlasRenderTarget(
			options.resolution,
			atlasColumns,
			atlasRows,
		);

		const faceDefinitions = createDefaultCubeFaces();
		const faces: TerrainTextureFace[] = [];

		const previousRenderTarget = this.renderer.getRenderTarget();

		this.renderer.setRenderTarget(atlasTarget);
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.clear();

		const previousScissorTest = this.renderer.getScissorTest();

		this.renderer.setScissorTest(true);

		for (let index = 0; index < faceDefinitions.length; index++) {
			const definition = faceDefinitions[index];

			const column = index % atlasColumns;
			const row = Math.floor(index / atlasColumns);

			const x = column * options.resolution;
			const y = row * options.resolution;

			this.renderer.setViewport(
				x,
				y,
				options.resolution,
				options.resolution,
			);

			this.renderer.setScissor(
				x,
				y,
				options.resolution,
				options.resolution,
			);

			this.bakeMaterial.setFace(definition.face);

			await this.renderBakeScene();

			faces.push({
				           index,
				           name: definition.name,
				           face: definition.face,
			           });
		}

		this.renderer.setScissorTest(previousScissorTest);
		this.renderer.setRenderTarget(previousRenderTarget);

		return new TerrainTextureSet(
			{
				resolution: options.resolution,
				maxEncodedHeight: options.maxEncodedHeight,
				atlasColumns,
				atlasRows,
			},
			faces,
			atlasTarget,
		);
	}

	private async renderBakeScene(): Promise<void> {
		/**
		 * renderAsync() is deprecated in recent Three versions.
		 * The renderer was already awaited during init(), so render() is enough here.
		 */
		this.renderer.render(
			this.scene,
			this.camera,
		);
	}

	private createAtlasRenderTarget(
		resolution: number,
		atlasColumns: number,
		atlasRows: number,
	): THREE.WebGLRenderTarget {
		const target = new THREE.WebGLRenderTarget(
			resolution * atlasColumns,
			resolution * atlasRows,
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

		target.texture.name = 'TerrainDataTexture.Atlas';

		return target;
	}
}
