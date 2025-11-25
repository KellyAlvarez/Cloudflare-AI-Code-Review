import { fromHono } from "chanfana";
import { Hono } from "hono";
// import { TaskCreate } from "./endpoints/taskCreate";
// import { TaskDelete } from "./endpoints/taskDelete";
// import { TaskFetch } from "./endpoints/taskFetch";
// import { TaskList } from "./endpoints/taskList";
import { ReviewSession } from "./reviewSession";
import { env } from "hono/adapter";

export { ReviewSession };

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// // Register OpenAPI endpoints
// openapi.get("/api/tasks", TaskList);
// openapi.post("/api/tasks", TaskCreate);
// openapi.get("/api/tasks/:taskSlug", TaskFetch);
// openapi.delete("/api/tasks/:taskSlug", TaskDelete);

// // You may also register routes for non OpenAPI directly on Hono
// // app.get('/test', (c) => c.text('Hono!'))

// POST /api/review
openapi.post("/api/review", async (c) => {
	const { code, sessionId } = await c.req.json();

	if (!code || !sessionId) {
		return c.json({ error: "Missing code or sessionId" }, 400);
	}

	// Durable Object: Load previous history
	const id = c.env.REVIEW_SESSIONS.idFromName(sessionId);
	const session = c.env.REVIEW_SESSIONS.get(id);

	const historyReq = await session.fetch("http://dummy/", {
		method: "POST",
		body: JSON.stringify({ action: "getHistory" }),
	});
	const history = await historyReq.json();

	const prompt = `You are an AI code reviewer. User's Code: ${code}

	Past review context:
	${history.map((h) => "- " + h).join("\n")}

	Return a structured review containing:
	- Bugs
	- Performance issues
	- Security vulnerabilities
	- Code smell / style notes
	- Suggested improvements
	`;

	// Call Cloudflare Workers AI (Llama 3.3)
	const aiResponse = await c.env.AI.run(
		"@cf/llama/3.3-70b-instruct",
		{ prompt }
	);

	const output = aiResponse.response;

	// Save result to memory
	await session.fetch("http://dummy/", {
		method: "POST",
		body: JSON.stringify({
			action: "addEntry",
			payload: `Reviewed code: ${output}`,
		}),
	});

	return c.json({ result: output });
});

export interface Env {
  AI: any;
  REVIEW_SESSIONS: DurableObjectNamespace;
}

app.post("/do/review", async (c) => {
  const original = c.req;
  const body = await original.json();

  const { REVIEW_SESSIONS } = env(c);
  const id = REVIEW_SESSIONS.idFromName("main");
  const stub = REVIEW_SESSIONS.get(id);

  // Rebuild the request for the DO
  const forwardReq = new Request("http://dummy/", {
    method: "POST",
    headers: original.header(),  // copy headers
    body: JSON.stringify(body),  // reuse parsed body
  });

  return stub.fetch(forwardReq);
});


// Export the Hono app
export default app;
