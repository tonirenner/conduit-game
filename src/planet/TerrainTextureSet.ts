import * as THREE from 'three';

import type {
	CubeFace,
} from './TerrainSource';

export type TerrainTextureSetOptions = {
	resolution: number;
	maxEncodedHeight: number;
};

export type TerrainTextureFace = {
	index: number;
	name: string;
	face: CubeFace;
	dataTarget: THREE.WebGLRenderTarget;
};

export class TerrainTextureSet {
	constructor(
		public readonly options: TerrainTextureSetOptions,
		public readonly faces: TerrainTextureFace[],
	) {}

	getDataTexture(faceIndex: number): THREE.Texture {
		return this.faces[faceIndex].dataTarget.texture;
	}

	dispose(): void {
		for (const face of this.faces) {
			face.dataTarget.dispose();
		}
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
