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
import { logger } from '../utils/logger';

export class CubeSphere extends THREE.Group {
	private readonly rootPatches: TerrainPatch[] = [];

	private readonly lodOptions: LodOptions = {
		maxLevel: 5,
		splitMultiplier: 3.2,
	};

	private readonly horizonCulling: HorizonCulling;

	constructor(
		private readonly radius: number,
		private readonly resolution: number,
		material: THREE.Material,
	) {
		super();

		this.name = 'CubeSphere';

		logger.info('CubeSphere created', {
			radius: this.radius,
			resolution: this.resolution,
			maxLevel: this.lodOptions.maxLevel,
			splitMultiplier: this.lodOptions.splitMultiplier,
		});

		this.horizonCulling = new HorizonCulling(this.radius, {
			enabled: true,
			debug: false,
			safetyMargin: 0.08,
			minCameraHeightForCulling: 0.22,
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

		for (const patch of this.rootPatches) {
			patch.updateLOD(
				cameraPosition,
				this.lodOptions,
				this.horizonCulling,
			);
		}
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
}
