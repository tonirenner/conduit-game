import * as THREE from 'three';

export { createDefaultCubeFaces } from './terrain/TerrainGeometryUtils';

export type TerrainTextureSetOptions = {
	resolution: number;
	maxEncodedHeight: number;
	atlasColumns: number;
	atlasRows: number;
};

export class TerrainTextureSet {
	constructor(
		public readonly options: TerrainTextureSetOptions,
		public readonly dataAtlasTarget: THREE.WebGLRenderTarget,
	) {}

	getDataAtlasTexture(): THREE.Texture {
		return this.dataAtlasTarget.texture;
	}

	dispose(): void {
		this.dataAtlasTarget.dispose();
	}
}
