export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OVERLAY_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  UC_PER_UNIT: string;
}

export class OverlayRoom {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();

      server.addEventListener("message", (event) => {
        server.send(JSON.stringify({ type: "ack", received: String(event.data) }));
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      return Response.json({ ok: true, event: payload });
    }

    return new Response("OverlayRoom OK");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "MonaWorld", version: 6 });
    }

    if (url.pathname.startsWith("/room/")) {
      const roomName = url.pathname.split("/")[2] || "default";
      const id = env.OVERLAY_ROOM.idFromName(roomName);
      return env.OVERLAY_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
