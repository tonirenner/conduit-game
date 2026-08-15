import * as THREE from 'three';
import { attribute, color, texture, vertexStage } from 'three/tsl';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV9,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats,
} from './PlanetInstancedCubeSphereDebugV9';

export type { PlanetInstancedColorMode, PlanetInstancedCubeSphereStats };

type InstancedShadingMode = 'orbit' | 'unlit';

type V7Runtime = {
	colorMode: PlanetInstancedColorMode;
	forceRebuild: boolean;
	resetTopologyCandidate: () => void;
	createMaterial: (colorAtlas: THREE.DataTexture) => THREE.Material;
};

type NodeMaterialRuntime = THREE.Material & {
	colorNode?: unknown;
	toneMapped?: boolean;
};

/**
 * Feature-Lab v10: fragment-cost isolation for the instanced CubeSphere.
 *
 * The existing Terrain material selector drives this automatically:
 * - Orbit  -> existing v9 day/night shading
 * - Simple -> same selected instanced color source, but completely unlit
 *
 * Geometry, topology, atlas sampling mode and height displacement stay
 * unchanged, so Orbit vs Simple isolates only the shading work.
 *
 * For the strongest fill-rate isolation use:
 * - Terrain material: Simple
 * - Instanced color: Flat
 * - Height displacement: Off
 * - Atmosphere: Off
 *
 * In that combination no atlas texture node is created at all; the fragment
 * path receives only a constant color.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV9 {
	private shadingMode: InstancedShadingMode = 'orbit';

	constructor(planetRadius: number) {
		super(planetRadius);

		const runtime = this as unknown as V7Runtime;
		const createV9Material = runtime.createMaterial.bind(this);

		runtime.createMaterial = (colorAtlas) => {
			const material = createV9Material(colorAtlas) as NodeMaterialRuntime;

			if (this.shadingMode === 'unlit') {
				if (runtime.colorMode === 'flat') {
					// Intentionally do not even construct an atlas sample node here.
					// This is the strict solid-color/fill-rate isolation path.
					material.colorNode = color(0xc58b4f);
				} else {
					const patchUv = attribute('patchUv', 'vec2');
					const atlasRect = attribute('iAtlasRect', 'vec4');
					const atlasUv = atlasRect.xy.add(patchUv.mul(atlasRect.zw));
					const colorSample = texture(colorAtlas, atlasUv).xyz;

					material.colorNode =
						runtime.colorMode === 'vertex-rgb'
							? vertexStage(colorSample)
							: colorSample;
				}

				material.toneMapped = false;
			}

			material.name = `${material.name}:${this.shadingMode}`;
			return material;
		};
	}

	override update(terrain: THREE.Object3D): void {
		const nextMode = detectShadingMode(terrain);
		if (nextMode !== this.shadingMode) {
			this.shadingMode = nextMode;
			const runtime = this as unknown as V7Runtime;
			runtime.forceRebuild = true;
			runtime.resetTopologyCandidate();
		}

		super.update(terrain);
	}
}

function detectShadingMode(terrain: THREE.Object3D): InstancedShadingMode {
	let mode: InstancedShadingMode = 'orbit';
	let found = false;

	terrain.traverse((object) => {
		if (found || !(object instanceof THREE.Mesh)) return;
		if (!(object.parent?.name.startsWith('TerrainPatch L') ?? false)) return;

		const material = Array.isArray(object.material)
			? object.material[0]
			: object.material;
		mode = material instanceof THREE.MeshBasicMaterial ? 'unlit' : 'orbit';
		found = true;
	});

	return mode;
}
