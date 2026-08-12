import index from "./index.html";
import { loadServerConfig } from "./server/src/config";

const config = await loadServerConfig();

const server = Bun.serve({
	                         hostname: config.game.host,
	                         port: config.game.port,

	                         routes: {
		                         "/": index,

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
