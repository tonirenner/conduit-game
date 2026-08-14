import { rm } from 'node:fs/promises';

const DIST_DIR = './dist';
const TERRAIN_WORKER_ENTRY =
	'./packages/conduit-planet/src/terrain/workers/TerrainPatchGridWorker.ts';

await rm(DIST_DIR, { recursive: true, force: true });

const appBuild = await Bun.build({
	entrypoints: ['./index.html'],
	outdir: DIST_DIR,
	target: 'browser',
});

assertBuildSucceeded('app', appBuild);

const workerBuild = await Bun.build({
	entrypoints: [TERRAIN_WORKER_ENTRY],
	outdir: DIST_DIR,
	target: 'browser',
	format: 'esm',
	splitting: false,
	naming: 'terrain-patch-grid-worker.[ext]',
});

assertBuildSucceeded('terrain worker', workerBuild);

console.log(
	`Built app + terrain worker (${appBuild.outputs.length + workerBuild.outputs.length} outputs).`,
);

function assertBuildSucceeded(
	label: string,
	result: Awaited<ReturnType<typeof Bun.build>>,
): void {
	if (result.success) return;

	for (const log of result.logs) {
		console.error(log);
	}

	throw new Error(`${label} build failed.`);
}
