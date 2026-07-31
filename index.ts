// dev-server.ts
import index from "./index.html";

const server = Bun.serve({
	                         port: 3000,

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

console.log(`Listening on http://localhost:${server.port}`);
