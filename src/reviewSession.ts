export interface ReviewRequest {
  action: "getHistory" | "addEntry" | "reset";
  payload?: any;
}

export class ReviewSession {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request) {
    const { action, payload } = await request.json<ReviewRequest>(); // must define type explicitly

    if (action === "getHistory") {
      const history = (await this.state.storage.get("history")) as any[] | null ?? [];
      return new Response(JSON.stringify(history));
    }

    if (action === "addEntry") {
      const history = (await this.state.storage.get("history")) as any[] | null ?? [];
      history.push(payload);
      await this.state.storage.put("history", history);
      return Response.json({ success: true });
    }

    if (action === "reset") {
      await this.state.storage.put("history", []);
      return Response.json({ success: true, message: "History cleared" });
    }

    return new Response("Unknown action", { status: 400 });
  }
}
