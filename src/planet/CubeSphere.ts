import * as THREE from 'three';

import {
	type CubeFace,
	type LodOptions,
	TerrainPatch,
} from './TerrainPatch';

import {
	HorizonCulling,
	type HorizonCullingStats,
} from './HorizonCulling';

import { CachedTerrainSource } from './CachedTerrainSource';

import type {
	TerrainSource,
	TerrainSourceStats,
} from './TerrainSource';

export type TerrainLodProfile =
	| 'far'
	| 'orbit'
	| 'approach'
	| 'near'
	| 'surface';

export class CubeSphere extends THREE.Group {
	private readonly rootPatches: TerrainPatch[] = [];
	private readonly horizonCulling: HorizonCulling;

	/**
	 * Phase 5c.1 hotfix:
	 *
	 * Do not use TextureTerrainSource here.
	 *
	 * TextureTerrainSource performs a CPU-side full-face bake and causes
	 * brutal startup time. In the WebGPU path the visible surface already uses
	 * the GPU-baked terrain atlas, so CPU geometry only needs the old lazy
	 * patch cache for:
	 * - initial patch attributes
	 * - normals
	 * - LOD / bounds
	 */
	private readonly terrainSource: TerrainSource = new CachedTerrainSource();

	private currentLodProfile: TerrainLodProfile = 'orbit';

	private readonly lodProfiles: Record<TerrainLodProfile, LodOptions> = {
		far: {
			maxLevel: 4,
			splitMultiplier: 2.6,
		},

		orbit: {
			maxLevel: 5,
			splitMultiplier: 3.0,
		},

		approach: {
			maxLevel: 6,
			splitMultiplier: 3.7,
		},

		near: {
			maxLevel: 7,
			splitMultiplier: 4.3,
		},

		surface: {
			maxLevel: 7,
			splitMultiplier: 5.0,
		},
	};

	constructor(
		private readonly radius: number,
		private readonly resolution: number,
		material: THREE.Material,
		private readonly useGpuVertexDisplacement: boolean = false,
	) {
		super();

		this.name = 'CubeSphere';

		this.horizonCulling = new HorizonCulling(this.radius, {
			enabled: true,
			debug: false,
			safetyMargin: 0.16,
			minCameraHeightForCulling: 0.42,
		});

		for (const face of this.createFaces()) {
			const patch = new TerrainPatch(
				face,
				{
					x: -1,
					y: -1,
					size: 2,
				},
				this.radius,
				this.resolution,
				material,
				this.terrainSource,
				0,
				this.useGpuVertexDisplacement,
			);

			this.rootPatches.push(patch);
			this.add(patch);
		}

		for (const patch of this.rootPatches) {
			patch.forceSplitToLevel(2);
		}
	}

	updateLOD(cameraPosition: THREE.Vector3): void {
		this.updateMatrixWorld(true);
		this.horizonCulling.resetFrameStats();

		const cameraDistance = cameraPosition.length();

		const heightAboveSurface = Math.max(
			0,
			cameraDistance - this.radius,
		);

		const nextProfile = this.selectLodProfile(heightAboveSurface);

		this.currentLodProfile = nextProfile;

		const frameSplitBudget = this.getFrameSplitBudget(nextProfile);

		const lodOptions: LodOptions = {
			...this.lodProfiles[nextProfile],
			allowMerge:
				nextProfile !== 'near' &&
				nextProfile !== 'surface',
			splitBudget: {
				remaining: frameSplitBudget,
			},
			adaptiveDetail: this.getAdaptiveDetailOptions(nextProfile),
		};

		this.horizonCulling.setEnabled(
			nextProfile === 'far' ||
			nextProfile === 'orbit' ||
			nextProfile === 'approach',
		);

		for (const patch of this.rootPatches) {
			patch.updateLOD(
				cameraPosition,
				lodOptions,
				this.horizonCulling,
			);
		}
	}

	getCurrentLodProfile(): TerrainLodProfile {
		return this.currentLodProfile;
	}

	getCurrentLodOptions(): LodOptions {
		return this.lodProfiles[this.currentLodProfile];
	}

	getTerrainSourceStats(): TerrainSourceStats {
		return this.terrainSource.getStats();
	}

	/**
	 * Backwards-compatible alias for existing HUD/debug code.
	 */
	getTerrainHeightCacheStats(): TerrainSourceStats {
		return this.getTerrainSourceStats();
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.horizonCulling.setEnabled(enabled);
	}

	setHorizonCullingDebug(debug: boolean): void {
		this.horizonCulling.setDebug(debug);
	}

	isHorizonCullingEnabled(): boolean {
		return this.horizonCulling.isEnabled();
	}

	isHorizonCullingDebugEnabled(): boolean {
		return this.horizonCulling.isDebugEnabled();
	}

	getHorizonCulling(): HorizonCulling {
		return this.horizonCulling;
	}

	getHorizonCullingStats(): HorizonCullingStats {
		return this.horizonCulling.getStats();
	}

	getStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
	} {
		let totalPatches = 0;
		let visibleMeshes = 0;
		let maxLevel = 0;

		for (const patch of this.rootPatches) {
			const stats = patch.getStats();

			totalPatches += stats.totalPatches;
			visibleMeshes += stats.visibleMeshes;
			maxLevel = Math.max(maxLevel, stats.maxLevel);
		}

		return {
			totalPatches,
			visibleMeshes,
			maxLevel,
		};
	}

	private getAdaptiveDetailOptions(
		profile: TerrainLodProfile,
	): NonNullable<LodOptions['adaptiveDetail']> {
		switch (profile) {
			case 'far':
				return {
					enabled: false,
					maxBoost: 0,
					minLevel: 99,
					maxCameraHeightMultiplier: 0,
					coastWeight: 0,
					reliefWeight: 0,
					mountainWeight: 0,
				};

			case 'orbit':
				return {
					enabled: true,
					maxBoost: 0.12,
					minLevel: 3,
					maxCameraHeightMultiplier: 1.55,
					coastWeight: 0.80,
					reliefWeight: 0.15,
					mountainWeight: 0.05,
				};

			case 'approach':
				return {
					enabled: true,
					maxBoost: 0.34,
					minLevel: 2,
					maxCameraHeightMultiplier: 1.20,
					coastWeight: 0.72,
					reliefWeight: 0.20,
					mountainWeight: 0.08,
				};

			case 'near':
				return {
					enabled: true,
					maxBoost: 0.48,
					minLevel: 2,
					maxCameraHeightMultiplier: 0.70,
					coastWeight: 0.60,
					reliefWeight: 0.28,
					mountainWeight: 0.12,
				};

			case 'surface':
				return {
					enabled: true,
					maxBoost: 0.56,
					minLevel: 2,
					maxCameraHeightMultiplier: 0.36,
					coastWeight: 0.48,
					reliefWeight: 0.34,
					mountainWeight: 0.18,
				};
		}
	}

	private getFrameSplitBudget(profile: TerrainLodProfile): number {
		switch (profile) {
			case 'far':
				return 4;

			case 'orbit':
				return 4;

			case 'approach':
				return 4;

			case 'near':
				return 3;

			case 'surface':
				return 2;
		}
	}

	private selectLodProfile(
		heightAboveSurface: number,
	): TerrainLodProfile {
		if (heightAboveSurface > this.radius * 4.0) {
			return 'far';
		}

		if (heightAboveSurface > this.radius * 1.25) {
			return 'orbit';
		}

		if (heightAboveSurface > this.radius * 0.34) {
			return 'approach';
		}

		if (heightAboveSurface > this.radius * 0.10) {
			return 'near';
		}

		return 'surface';
	}

	private createFaces(): CubeFace[] {
		return [
			{
				normal: new THREE.Vector3(1, 0, 0),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(0, 0, -1),
			},
			{
				normal: new THREE.Vector3(-1, 0, 0),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(0, 0, 1),
			},
			{
				normal: new THREE.Vector3(0, 1, 0),
				up: new THREE.Vector3(0, 0, 1),
				right: new THREE.Vector3(-1, 0, 0),
			},
			{
				normal: new THREE.Vector3(0, -1, 0),
				up: new THREE.Vector3(0, 0, -1),
				right: new THREE.Vector3(-1, 0, 0),
			},
			{
				normal: new THREE.Vector3(0, 0, 1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(1, 0, 0),
			},
			{
				normal: new THREE.Vector3(0, 0, -1),
				up: new THREE.Vector3(0, 1, 0),
				right: new THREE.Vector3(-1, 0, 0),
			},
		];
	}
}
