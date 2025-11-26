import { fromHono } from "chanfana";
import { Hono } from "hono";
import { ReviewSession } from "./reviewSession";
import { env } from "hono/adapter";

export { ReviewSession };

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Send code, get AI review, history is saved
openapi.post("/api/review", async (c) => {
	// safe JSON body
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const { code, sessionId } = body;
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

	// build prompt
	const prompt = `You are an AI code reviewer. User's Code: ${code}

	Past review context:
	${history.map((h) => "- " + h).join("\n")}

	Return JSON only with this structure:

	{
	"bugs": [...],
	"performance_issues": [...],
	"security_vulnerabilities": [...],
	"code_smells": [...],
	"suggested_improvements": [...]
	}
	`;

	// Call Cloudflare Workers AI (Llama 3.3)
	const aiResponse = await c.env.AI.run(
		"@cf/llama/3.3-70b-instruct",
		{
			messages: [
				{ role: "user", content: prompt }
			]
		}
	);

	let outputText = aiResponse.result;

	// try parsing clean JSON
	let output;
	try {
		output = JSON.parse(outputText);
	} catch {
		output = {
			bugs: [],
			performance_issues: [],
			security_vulnerabilities: [],
			code_smells: [],
			suggested_improvements: [],
			raw: outputText   // keep original model text for debugging
		};
	}

	// Save result to memory
	await session.fetch("http://dummy/", {
		method: "POST",
		body: JSON.stringify({
			action: "addEntry",
			payload: `Reviewed code: ${JSON.stringify(output)}`
		}),
	});

	return c.json({ result: output });
});

export interface Env {
	AI: any;
	REVIEW_SESSIONS: DurableObjectNamespace;
}

// get review history for a session
openapi.get("/api/history/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");

	const id = c.env.REVIEW_SESSIONS.idFromName(sessionId);
	const session = c.env.REVIEW_SESSIONS.get(id);

	const historyRes = await session.fetch("http://dummy/", {
		method: "POST",
		body: JSON.stringify({ action: "getHistory" }),
	});

	return c.json(await historyRes.json());
});

// clears the session history
openapi.post("/api/session/:sessionId/reset", async (c) => {
	const sessionId = c.req.param("sessionId");

	const id = c.env.REVIEW_SESSIONS.idFromName(sessionId);
	const session = c.env.REVIEW_SESSIONS.get(id);

	const resetRes = await session.fetch("http://dummy/", {
		method: "POST",
		body: JSON.stringify({ action: "reset" }),
	});

	return c.json(await resetRes.json());
});


// for debugging
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
