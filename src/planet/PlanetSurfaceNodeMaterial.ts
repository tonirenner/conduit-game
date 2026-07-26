import * as THREE from 'three/webgpu';

import {
	float,
	vertexColor,
} from 'three/tsl';

/**
 * First TSL / NodeMaterial test surface.
 *
 * Intentionally simple:
 * - uses cached vertex colors from TerrainSource/TerrainPatch
 * - uses Three.js lighting pipeline
 * - no atmosphere
 * - no procedural terrain normals
 * - no procedural surface texture
 *
 * This is only the migration bridge. The existing GLSL material remains
 * the visual reference.
 */
export function createPlanetSurfaceNodeMaterial(): any {
	const material = new THREE.MeshStandardNodeMaterial({
		                                                    vertexColors: true,
		                                                    transparent: false,
		                                                    depthWrite: true,
		                                                    depthTest: true,
	                                                    });

	material.name = 'PlanetSurfaceNodeMaterial';

	material.colorNode = vertexColor();
	material.roughnessNode = float(0.94);
	material.metalnessNode = float(0.0);

	return material;
}
