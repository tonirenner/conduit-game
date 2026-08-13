import * as THREE from 'three';

import {
	type CubeFace,
	type LodOptions,
	TerrainPatch,
	type TerrainPatchEdgeAddress,
	type TerrainPatchLeaf,
} from './TerrainPatch';

import {
	HorizonCulling,
	type HorizonCullingStats,
} from '@conduit/web3d/performance';

import { CachedTerrainSource } from './CachedTerrainSource';

import {
	DEFAULT_TERRAIN_SEED_CONFIG,
	type TerrainSeedConfig,
} from './terrain/noise';
import { createDefaultCubeFaces } from '@conduit/planet/terrain';

import type { TerrainSource } from './TerrainSource';

export type TerrainLodProfile =
	| 'far'
	| 'orbit'
	| 'approach'
	| 'near'
	| 'surface';

type LodBalanceStats = {
	splits: number;
	passes: number;
	violations: number;
};

type LodBalanceEvaluation = {
	candidates: TerrainPatch[];
	violations: number;
};

type PatchBoundaryEdge = {
	leaf: TerrainPatchLeaf;
	side: 'top' | 'right' | 'bottom' | 'left';
	key: string;
	min: number;
	max: number;
};

export class CubeSphere extends THREE.Group {
	private readonly rootPatches: TerrainPatch[] = [];
	private readonly horizonCulling: HorizonCulling;
	private lodBalanceStats: LodBalanceStats = {
		splits: 0,
		passes: 0,
		violations: 0,
	};
	private lodBalanceFrame = 0;
	private horizonCullingOverride: boolean | null = null;

	/**
	 * In the WebGPU path the visible surface uses the GPU-baked terrain atlas,
	 * so CPU geometry only needs the lazy patch cache for:
	 * - initial patch attributes
	 * - normals
	 * - LOD / bounds
	 */
	private readonly terrainSource: TerrainSource;

	private lastLodDebugLogTime = 0;
	private currentLodProfile: TerrainLodProfile = 'far';

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
			maxLevel: 10,
			splitMultiplier: 3.7,
		},

		near: {
			maxLevel: 14,
			splitMultiplier: 4.3,
		},

		surface: {
			maxLevel: 18,
			splitMultiplier: 5.0,
		},
	};

	constructor(
		private readonly radius: number,
		private readonly resolution: number,
		material: THREE.Material,
		private readonly useGpuVertexDisplacement: boolean = false,
		terrainSeedConfig: TerrainSeedConfig = DEFAULT_TERRAIN_SEED_CONFIG,
		private readonly terrainHeightScale = 1,
	) {
		super();

		this.terrainSource = new CachedTerrainSource(
			terrainSeedConfig,
		);

		this.name = 'CubeSphere';

		this.horizonCulling = new HorizonCulling(this.radius, {
			enabled: true,
			debug: false,
			safetyMargin: 0.16,
			minCameraHeightForCulling: 0.42,
		});

		for (const face of createDefaultCubeFaces()) {
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
				this.terrainHeightScale,
			);

			this.rootPatches.push(patch);
			this.add(patch);
		}

		for (const patch of this.rootPatches) {
			patch.forceSplitToLevel(2);
		}
	}

	updateLOD(cameraPosition: THREE.Vector3): void {
		this.horizonCulling.resetFrameStats();

		const cameraDistance = cameraPosition.length();

		const heightAboveSurface = Math.max(
			0,
			cameraDistance - this.radius,
		);

		const normalizedHeight =
			      this.radius > 0
			      ? heightAboveSurface / this.radius
			      : heightAboveSurface;

		const nextProfile = this.selectLodProfile(normalizedHeight);
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

		this.logLodDebug(
			cameraDistance,
			heightAboveSurface,
			normalizedHeight,
			nextProfile,
		);

		this.horizonCulling.setEnabled(
			this.horizonCullingOverride ?? true,
		);

		for (const patch of this.rootPatches) {
			patch.updateLOD(
				cameraPosition,
				lodOptions,
				this.horizonCulling,
			);
		}

		this.lodBalanceFrame++;

		if (
			this.lodBalanceFrame %
			this.getBalanceUpdateInterval(nextProfile) === 0
		) {
			this.lodBalanceStats = this.enforceTwoToOneBalance(
				lodOptions.maxLevel,
				this.getFrameBalanceBudget(nextProfile),
			);
			this.applyEdgeStitching();
			return;
		}

		this.lodBalanceStats = {
			...this.lodBalanceStats,
			splits: 0,
			passes: 0,
		};
		this.applyEdgeStitching();
	}

	setHorizonCullingEnabled(enabled: boolean): void {
		this.horizonCullingOverride = enabled;
		this.horizonCulling.setEnabled(enabled);
	}

	setPatchFrustumCullingEnabled(enabled: boolean): void {
		for (const patch of this.rootPatches) {
			patch.setFrustumCullingEnabled(enabled);
		}
	}

	getHorizonCullingStats(): HorizonCullingStats {
		return this.horizonCulling.getStats();
	}

	getStats(): {
		totalPatches: number;
		visibleMeshes: number;
		maxLevel: number;
		profile: TerrainLodProfile;
		approximateVertexSpacing: number;
		morphingPatches: number;
		balance: {
			splits: number;
			passes: number;
			violations: number;
		};
	} {
		let totalPatches = 0;
		let visibleMeshes = 0;
		let maxLevel = 0;
		let morphingPatches = 0;

		for (const patch of this.rootPatches) {
			const stats = patch.getStats();

			totalPatches += stats.totalPatches;
			visibleMeshes += stats.visibleMeshes;
			maxLevel = Math.max(maxLevel, stats.maxLevel);
			morphingPatches += stats.morphingPatches;
		}

		return {
			totalPatches,
			visibleMeshes,
			maxLevel,
			profile: this.currentLodProfile,
			approximateVertexSpacing:
				(this.radius * 2) /
				(Math.pow(2, maxLevel) * Math.max(1, this.resolution)),
			morphingPatches,
			balance: {
				...this.lodBalanceStats,
			},
		};
	}

	private enforceTwoToOneBalance(
		maxLevel: number,
		splitBudget: number,
	): LodBalanceStats {
		let splits = 0;
		let passes = 0;
		let remainingBudget = splitBudget;

		for (let pass = 0; pass < 6; pass++) {
			const evaluation = this.evaluateTwoToOneBalance(maxLevel);

			if (evaluation.candidates.length === 0 || remainingBudget <= 0) {
				return {
					splits,
					passes,
					violations: evaluation.violations,
				};
			}

			for (const patch of evaluation.candidates) {
				if (remainingBudget <= 0) {
					break;
				}

				patch.split();
				splits++;
				remainingBudget--;
			}

			passes++;
		}

		return {
			splits,
			passes,
			violations: this.evaluateTwoToOneBalance(maxLevel).violations,
		};
	}

	private evaluateTwoToOneBalance(
		maxLevel: number,
	): LodBalanceEvaluation {
		const leaves = this.collectLeavesByFace();
		const candidates = new Set<TerrainPatch>();
		let violations = 0;

		for (const faceLeaves of leaves.values()) {
			violations += this.collectFaceLocalBalanceViolations(
				faceLeaves,
				candidates,
				maxLevel,
			);
		}

		violations += this.collectCrossFaceBalanceViolations(
			leaves,
			candidates,
			maxLevel,
		);

		return {
			candidates: [...candidates],
			violations,
		};
	}

	private collectFaceLocalBalanceViolations(
		leaves: TerrainPatchLeaf[],
		candidates: Set<TerrainPatch>,
		maxLevel: number,
	): number {
		const edgesByKey = this.collectFaceLocalEdgesByKey(leaves);
		let violations = 0;

		for (const edges of edgesByKey.values()) {
			for (let index = 0; index < edges.length; index++) {
				const edge = edges[index];

				for (
					let neighborIndex = index + 1;
					neighborIndex < edges.length;
					neighborIndex++
				) {
					const neighbor = edges[neighborIndex];

					if (edge.leaf === neighbor.leaf) {
						continue;
					}

					if (!this.areCubeBoundaryEdgesOverlapping(edge, neighbor)) {
						continue;
					}

					if (!this.registerBalanceViolation(
						edge.leaf,
						neighbor.leaf,
						candidates,
						maxLevel,
					)) {
						continue;
					}

					violations++;
				}
			}
		}

		return violations;
	}

	private collectCrossFaceBalanceViolations(
		leavesByFace: Map<CubeFace, TerrainPatchLeaf[]>,
		candidates: Set<TerrainPatch>,
		maxLevel: number,
	): number {
		const edgesByKey = this.collectBoundaryEdgesByKey(leavesByFace);
		let violations = 0;

		for (const edges of edgesByKey.values()) {
			for (let index = 0; index < edges.length; index++) {
				const edge = edges[index];

				for (
					let neighborIndex = index + 1;
					neighborIndex < edges.length;
					neighborIndex++
				) {
					const neighbor = edges[neighborIndex];

					if (edge.leaf.face === neighbor.leaf.face) {
						continue;
					}

					if (!this.areCubeBoundaryEdgesOverlapping(edge, neighbor)) {
						continue;
					}

					if (!this.registerBalanceViolation(
						edge.leaf,
						neighbor.leaf,
						candidates,
						maxLevel,
					)) {
						continue;
					}

					violations++;
				}
			}
		}

		return violations;
	}

	private registerBalanceViolation(
		leaf: TerrainPatchLeaf,
		neighbor: TerrainPatchLeaf,
		candidates: Set<TerrainPatch>,
		maxLevel: number,
	): boolean {
		const levelDelta = Math.abs(leaf.level - neighbor.level);

		if (levelDelta <= 1) {
			return false;
		}

		const coarser =
			      leaf.level < neighbor.level
			      ? leaf
			      : neighbor;

		if (coarser.patch.canSplit(maxLevel)) {
			candidates.add(coarser.patch);
		}

		return true;
	}

	private collectLeavesByFace(): Map<CubeFace, TerrainPatchLeaf[]> {
		const leavesByFace = new Map<CubeFace, TerrainPatchLeaf[]>();

		for (const rootPatch of this.rootPatches) {
			const leaves: TerrainPatchLeaf[] = [];
			rootPatch.collectLeaves(leaves);

			for (const leaf of leaves) {
				const faceLeaves = leavesByFace.get(leaf.face) ?? [];

				faceLeaves.push(leaf);
				leavesByFace.set(leaf.face, faceLeaves);
			}
		}

		return leavesByFace;
	}

	private collectFaceLocalEdgesByKey(
		leaves: TerrainPatchLeaf[],
	): Map<string, PatchBoundaryEdge[]> {
		const edgesByKey = new Map<string, PatchBoundaryEdge[]>();

		for (const leaf of leaves) {
			const bounds = leaf.bounds;
			const right = bounds.x + bounds.size;
			const bottom = bounds.y + bounds.size;

			for (const edge of [
				{
					side: 'left' as const,
					key: `f${leaf.address.faceId}:v:${this.numberKey(bounds.x)}`,
					min: bounds.y,
					max: bottom,
				},
				{
					side: 'right' as const,
					key: `f${leaf.address.faceId}:v:${this.numberKey(right)}`,
					min: bounds.y,
					max: bottom,
				},
				{
					side: 'top' as const,
					key: `f${leaf.address.faceId}:h:${this.numberKey(bounds.y)}`,
					min: bounds.x,
					max: right,
				},
				{
					side: 'bottom' as const,
					key: `f${leaf.address.faceId}:h:${this.numberKey(bottom)}`,
					min: bounds.x,
					max: right,
				},
			]) {
				const edges = edgesByKey.get(edge.key) ?? [];

				edges.push({
					           leaf,
					           side: edge.side,
					           key: edge.key,
					           min: edge.min,
					           max: edge.max,
				           });
				edgesByKey.set(edge.key, edges);
			}
		}

		return edgesByKey;
	}

	private collectBoundaryEdgesByKey(
		leavesByFace: Map<CubeFace, TerrainPatchLeaf[]>,
	): Map<string, PatchBoundaryEdge[]> {
		const edgesByKey = new Map<string, PatchBoundaryEdge[]>();

		for (const faceLeaves of leavesByFace.values()) {
			for (const leaf of faceLeaves) {
				for (const edge of this.createBoundaryEdgesForLeaf(leaf)) {
					const edges = edgesByKey.get(edge.key) ?? [];

					edges.push(edge);
					edgesByKey.set(edge.key, edges);
				}
			}
		}

		return edgesByKey;
	}

	private createBoundaryEdgesForLeaf(
		leaf: TerrainPatchLeaf,
	): PatchBoundaryEdge[] {
		const edges: PatchBoundaryEdge[] = [];
		const bounds = leaf.bounds;
		const right = bounds.x + bounds.size;
		const bottom = bounds.y + bounds.size;
		const epsilon = 0.000001;

		if (Math.abs(bounds.x + 1) <= epsilon) {
			edges.push(this.createBoundaryEdge(leaf, leaf.address.edges.left));
		}

		if (Math.abs(right - 1) <= epsilon) {
			edges.push(this.createBoundaryEdge(leaf, leaf.address.edges.right));
		}

		if (Math.abs(bounds.y + 1) <= epsilon) {
			edges.push(this.createBoundaryEdge(leaf, leaf.address.edges.top));
		}

		if (Math.abs(bottom - 1) <= epsilon) {
			edges.push(this.createBoundaryEdge(leaf, leaf.address.edges.bottom));
		}

		return edges;
	}

	private createBoundaryEdge(
		leaf: TerrainPatchLeaf,
		edge: TerrainPatchEdgeAddress,
	): PatchBoundaryEdge {
		return {
			leaf,
			side: this.getLeafEdgeSide(leaf, edge),
			key: edge.cubeEdgeKey,
			min: edge.min,
			max: edge.max,
		};
	}

	private getLeafEdgeSide(
		leaf: TerrainPatchLeaf,
		edge: TerrainPatchEdgeAddress,
	): 'top' | 'right' | 'bottom' | 'left' {
		if (edge === leaf.address.edges.top) return 'top';
		if (edge === leaf.address.edges.right) return 'right';
		if (edge === leaf.address.edges.bottom) return 'bottom';
		return 'left';
	}

	private applyEdgeStitching(): void {
		const leavesByFace = this.collectLeavesByFace();
		const edgesByKey = new Map<string, PatchBoundaryEdge[]>();
		const stitchByPatch = new Map<TerrainPatch, {
			top: boolean;
			right: boolean;
			bottom: boolean;
			left: boolean;
		}>();

		for (const leaves of leavesByFace.values()) {
			for (const [key, edges] of this.collectFaceLocalEdgesByKey(leaves)) {
				edgesByKey.set(`local:${key}`, edges);
			}
		}

		for (const [key, edges] of this.collectBoundaryEdgesByKey(leavesByFace)) {
			edgesByKey.set(`boundary:${key}`, edges);
		}

		for (const leaves of leavesByFace.values()) {
			for (const leaf of leaves) {
				stitchByPatch.set(leaf.patch, {
					top: false,
					right: false,
					bottom: false,
					left: false,
				});
			}
		}

		for (const edges of edgesByKey.values()) {
			for (let index = 0; index < edges.length; index++) {
				for (let neighborIndex = index + 1; neighborIndex < edges.length; neighborIndex++) {
					const edge = edges[index];
					const neighbor = edges[neighborIndex];
					if (
						edge.leaf === neighbor.leaf ||
						!this.areCubeBoundaryEdgesOverlapping(edge, neighbor) ||
						Math.abs(edge.leaf.level - neighbor.leaf.level) !== 1
					) {
						continue;
					}

					const finer = edge.leaf.level > neighbor.leaf.level
						? edge
						: neighbor;
					const flags = stitchByPatch.get(finer.leaf.patch);
					if (flags) flags[finer.side] = true;
				}
			}
		}

		for (const [patch, edges] of stitchByPatch) {
			patch.setEdgeStitching(edges);
		}
	}

	private areCubeBoundaryEdgesOverlapping(
		a: PatchBoundaryEdge,
		b: PatchBoundaryEdge,
	): boolean {
		if (a.key !== b.key) {
			return false;
		}

		const epsilon = 0.000001;
		const overlapMin = Math.max(a.min, b.min);
		const overlapMax = Math.min(a.max, b.max);

		return overlapMax - overlapMin > epsilon;
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
				return 8;

			case 'near':
				return 10;

			case 'surface':
				return 12;
		}
	}

	private getFrameBalanceBudget(profile: TerrainLodProfile): number {
		switch (profile) {
			case 'far':
				return 6;

			case 'orbit':
				return 8;

			case 'approach':
				return 10;

			case 'near':
				return 14;

			case 'surface':
				return 18;
		}
	}

	private getBalanceUpdateInterval(profile: TerrainLodProfile): number {
		switch (profile) {
			case 'far':
				return 8;

			case 'orbit':
				return 6;

			case 'approach':
				return 4;

			case 'near':
				return 2;

			case 'surface':
				return 1;
		}
	}

	private numberKey(value: number): string {
		return value.toFixed(6);
	}

	private selectLodProfile(
		normalizedHeightAboveSurface: number,
	): TerrainLodProfile {
		if (normalizedHeightAboveSurface > 4.0) {
			return 'far';
		}

		if (normalizedHeightAboveSurface > 1.25) {
			return 'orbit';
		}

		if (normalizedHeightAboveSurface > 0.34) {
			return 'approach';
		}

		if (normalizedHeightAboveSurface > 0.10) {
			return 'near';
		}

		return 'surface';
	}

	private logLodDebug(
		cameraDistance: number,
		heightAboveSurface: number,
		normalizedHeight: number,
		profile: TerrainLodProfile,
	): void {
		if (
			typeof window === 'undefined' ||
			new URLSearchParams(window.location.search).get('lodDebug') !== '1'
		) {
			return;
		}

		const now = performance.now();

		if (now - this.lastLodDebugLogTime < 750) {
			return;
		}

		this.lastLodDebugLogTime = now;

		console.log('[CubeSphere LOD]', {
			name: this.name,
			radius: this.radius,
			cameraDistance,
			heightAboveSurface,
			normalizedHeight,
			profile,
			stats: this.getStats(),
		});
	}

}
