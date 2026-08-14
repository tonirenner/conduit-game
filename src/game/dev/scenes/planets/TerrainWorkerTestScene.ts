import * as THREE from 'three';
import {
	TerrainWorkerPool,
	createTerrainSeedConfig,
	type TerrainGrid,
} from '@conduit/planet/terrain';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';

const TEST_RESOLUTION = 64;

export class TerrainWorkerTestScene implements FeatureTestScene {
	readonly id = 'planet-terrain-workers';
	readonly name = 'Terrain Workers';
	readonly category = 'Planets' as const;
	readonly description = 'Smoke test for persistent off-main-thread planet terrain patch generation.';

	private context: FeatureTestContext | null = null;
	private pool: TerrainWorkerPool | null = null;
	private stats: HTMLElement | null = null;
	private runToken = 0;

	init(context: FeatureTestContext): void {
		this.context = context;
		context.clearReport();
		context.uiRoot.innerHTML = `
			<button data-run-workers style="margin:4px;padding:6px 8px;">Run Worker Bake</button>
			<div data-worker-stats style="margin-top:8px;opacity:.78"></div>
		`;
		this.stats = context.uiRoot.querySelector('[data-worker-stats]');
		context.uiRoot
			.querySelector<HTMLButtonElement>('[data-run-workers]')
			?.addEventListener('click', () => void this.runSmokeTest());

		if (!TerrainWorkerPool.isSupported()) {
			context.report({
				status: 'fail',
				label: 'terrain workers unavailable',
				detail: 'Browser Worker API is not available.',
			});
			return;
		}

		try {
			this.pool = new TerrainWorkerPool();
			const stats = this.pool.getStats();
			context.report({
				status: 'info',
				label: 'terrain worker pool created',
				detail: `${stats.size} persistent worker${stats.size === 1 ? '' : 's'}`,
			});
			void this.runSmokeTest();
		} catch (error) {
			context.report({
				status: 'fail',
				label: 'terrain worker pool failed',
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}

	update(): void {
		if (!this.stats || !this.pool) return;
		const stats = this.pool.getStats();
		this.stats.innerHTML = [
			`workers: ${stats.size}`,
			`busy: ${stats.busy}`,
			`queued: ${stats.queued}`,
			`generation: ${stats.generation}`,
			`completed: ${stats.completed}`,
			`discarded: ${stats.discarded}`,
		].join('<br>');
	}

	reset(): void {
		void this.runSmokeTest();
	}

	dispose(): void {
		this.runToken++;
		this.pool?.dispose();
		this.pool = null;
		this.stats = null;
		this.context = null;
	}

	private async runSmokeTest(): Promise<void> {
		if (!this.pool || !this.context) return;
		const token = ++this.runToken;
		const generation = this.pool.invalidate();
		const terrainSeedConfig = createTerrainSeedConfig(3001, 'desert');
		const face = {
			normal: new THREE.Vector3(0, 0, 1),
			up: new THREE.Vector3(0, 1, 0),
			right: new THREE.Vector3(1, 0, 0),
		};
		const bounds = [
			{ x: -1, y: -1, size: 1 },
			{ x: 0, y: -1, size: 1 },
			{ x: -1, y: 0, size: 1 },
			{ x: 0, y: 0, size: 1 },
		];
		const startedAt = performance.now();

		try {
			const grids = await Promise.all(
				bounds.map((patchBounds, index) => this.pool!.requestPatchGrid({
					face,
					bounds: patchBounds,
					resolution: TEST_RESOLUTION,
					terrainSeedConfig,
					priority: bounds.length - index,
					generation,
				})),
			);

			if (token !== this.runToken || !this.context || !this.pool) return;
			validateTerrainGrids(grids, TEST_RESOLUTION);
			const elapsed = performance.now() - startedAt;
			const stats = this.pool.getStats();

			this.context.report({
				status: 'pass',
				label: 'terrain worker bake',
				detail: `${grids.length} patches @ ${TEST_RESOLUTION}² in ${elapsed.toFixed(1)} ms / ${stats.size} workers`,
			});
		} catch (error) {
			if (token !== this.runToken || !this.context) return;
			this.context.report({
				status: 'fail',
				label: 'terrain worker bake',
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function validateTerrainGrids(grids: TerrainGrid[], resolution: number): void {
	const rowSize = resolution + 1;
	const expectedSamples = rowSize * rowSize;

	for (const grid of grids) {
		if (
			grid.rowSize !== rowSize ||
			grid.heights.length !== expectedSamples ||
			grid.landMasks.length !== expectedSamples ||
			grid.continents.length !== expectedSamples ||
			grid.mountainMasks.length !== expectedSamples ||
			grid.colors.length !== expectedSamples * 3
		) {
			throw new Error('Worker returned an invalid terrain grid shape.');
		}

		if (!Number.isFinite(grid.heights[0]) || !Number.isFinite(grid.landMasks[0])) {
			throw new Error('Worker returned non-finite terrain samples.');
		}
	}
}
