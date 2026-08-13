import * as THREE from 'three';

import type {
	CubeFace,
} from './TerrainSource';

export type TerrainTextureSetOptions = {
	resolution: number;
	maxEncodedHeight: number;
	atlasColumns: number;
	atlasRows: number;
};

export type TerrainTextureFace = {
	index: number;
	name: string;
	face: CubeFace;
};

export class TerrainTextureSet {
	constructor(
		public readonly options: TerrainTextureSetOptions,
		public readonly faces: TerrainTextureFace[],
		public readonly dataAtlasTarget: THREE.WebGLRenderTarget,
	) {}

	getDataAtlasTexture(): THREE.Texture {
		return this.dataAtlasTarget.texture;
	}

	dispose(): void {
		this.dataAtlasTarget.dispose();
	}
}

export function createDefaultCubeFaces(): Array<{
	name: string;
	face: CubeFace;
}> {
	return [
		{
			name: 'positive-x',
			face: {
				normal: new THREE.Vector3(1, 0, 0),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(0, 0, -1),
			},
		},
		{
			name: 'negative-x',
			face: {
				normal: new THREE.Vector3(-1, 0, 0),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(0, 0, 1),
			},
		},
		{
			name: 'positive-y',
			face: {
				normal: new THREE.Vector3(0, 1, 0),
				up: new THREE.Vector3(0, 0, 1),
				right: new THREE.Vector3(-1, 0, 0),
			},
		},
		{
			name: 'negative-y',
			face: {
				normal: new THREE.Vector3(0, -1, 0),
				up: new THREE.Vector3(0, 0, -1),
				right: new THREE.Vector3(-1, 0, 0),
			},
		},
		{
			name: 'positive-z',
			face: {
				normal: new THREE.Vector3(0, 0, 1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(1, 0, 0),
			},
		},
		{
			name: 'negative-z',
			face: {
				normal: new THREE.Vector3(0, 0, -1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(-1, 0, 0),
			},
		},
	];
}
