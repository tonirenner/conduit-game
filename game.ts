import index from "./index.html";
import { loadServerConfig } from "./server/src/config";

const TERRAIN_WORKER_ENTRY =
	"./packages/conduit-planet/src/terrain/workers/TerrainPatchGridWorker.ts";
const TERRAIN_WORKER_ROUTE = "/terrain-patch-grid-worker.js";

const config = await loadServerConfig();
const terrainWorkerScript = await buildTerrainWorkerScript();

const server = Bun.serve({
	hostname: config.game.host,
	port: config.game.port,

	routes: {
		"/": index,

		[TERRAIN_WORKER_ROUTE]: () =>
			new Response(terrainWorkerScript, {
				headers: {
					"content-type": "text/javascript; charset=utf-8",
					"cache-control": "no-store",
				},
			}),

		"/models/:file": async (req) => {
			const fileName = req.params.file;
			const file = Bun.file(`./public/models/${fileName}`);

			if (!(await file.exists())) {
				return new Response("Not found", { status: 404 });
			}

			return new Response(file);
		},
	},

	development: true,
});

console.log(`Game dev server listening on http://localhost:${server.port}`);

async function buildTerrainWorkerScript(): Promise<string> {
	const result = await Bun.build({
		entrypoints: [TERRAIN_WORKER_ENTRY],
		target: "browser",
		format: "esm",
		splitting: false,
	});

	if (!result.success) {
		for (const log of result.logs) {
			console.error(log);
		}
		throw new Error("Terrain worker dev build failed.");
	}

	const output = result.outputs.find((artifact) => artifact.path.endsWith(".js"));
	if (!output) {
		throw new Error("Terrain worker dev build produced no JavaScript output.");
	}

	return output.text();
}
