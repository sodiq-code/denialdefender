/**
 * DenialDefender Trace Stream — Socket.io Server (port 3003 fixed)
 *
 * A standalone Bun mini-service that:
 *  - Serves a health check on GET /
 *  - Accepts Socket.io client connections (path /socket.io/)
 *  - Lets clients `subscribe:case` with a caseId to join room `case:<id>`
 *  - Re-broadcasts trace events to the case room:
 *      case:created, trace:event, gate:pending, gate:resolved, case:state:changed
 *  - Exposes an internal POST /emit (no auth) used by the Next.js backend
 *    to push events: body { event, caseId, payload }
 *  - CORS: localhost:3000, 127.0.0.1:3000, *.run.app origins, sandbox preview origins
 *
 * Frontend connects via the Caddy gateway: io("/?XTransformPort=3003")
 * Next.js backend calls directly: http://localhost:3003/emit
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Server, Socket } from "socket.io";

// ─── Configuration ────────────────────────────────────────────────────────────
// Port is HARDCODED to 3003 — never read from env (per task spec).
const PORT = 3003;
const SERVICE_NAME = "trace-stream";
const SERVICE_VERSION = "1.0.0";

// ─── Allowed CORS Origins ─────────────────────────────────────────────────────
// Sandbox dev origins
const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Sandbox preview origins (the preview panel hosts). Allow any host with these
// patterns — the sandbox may rotate hostnames.
const PREVIEW_REGEXES: RegExp[] = [
  /^https?:\/\/.*\.preview\..*$/,        // generic preview panel
  /^https?:\/\/.*\.preview\.zai\..*$/,   // z-ai preview
  /^https?:\/\/.*-preview\..*$/,         // hyphenated preview
  /^https?:\/\/preview\..*$/,            // preview subdomain
];

// Cloud Run production origins
const PROD_REGEXES: RegExp[] = [
  /^https:\/\/denialdefender-web.*\.run\.app$/,  // any *.run.app Cloud Run URL
  /^https?:\/\/.*\.run\.app$/,                   // broader *.run.app (per task spec)
];

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // allow same-origin / no-origin requests (curl, etc.)
  if (DEV_ORIGINS.includes(origin)) return true;
  for (const r of PREVIEW_REGEXES) {
    if (r.test(origin)) return true;
  }
  for (const r of PROD_REGEXES) {
    if (r.test(origin)) return true;
  }
  return false;
}

// ─── HTTP Server (health check + internal /emit) ──────────────────────────────
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req.headers.origin));
    res.end();
    return;
  }

  // GET / — health check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
    res.end(JSON.stringify({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      port: PORT,
      connectedClients: io.engine.clientsCount,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // POST /emit — internal broadcast endpoint (no auth, internal-only by convention)
  // Body: { event: string, caseId: string, payload: unknown }
  // Server emits the event to room `case:<caseId>` with the payload.
  if (req.method === "POST" && req.url === "/emit") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: { event?: string; caseId?: string; payload?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    const event = (body.event ?? "").toString();
    const caseId = (body.caseId ?? "").toString();
    const payload = body.payload ?? {};

    if (!event || !caseId) {
      res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
      res.end(JSON.stringify({ error: "Missing required fields: event, caseId" }));
      return;
    }

    const room = `case:${caseId}`;
    const enriched = { ...(typeof payload === "object" && payload ? payload : {}), broadcast_at: new Date().toISOString() };
    io.to(room).emit(event, enriched);

    // For gate:* and case:state:changed events also broadcast a global feed
    // so dashboards can subscribe to all activity.
    if (event === "gate:pending" || event === "gate:resolved" || event === "case:state:changed") {
      io.emit(`${event}:global`, enriched);
    }
    if (event === "case:created") {
      io.emit(event, enriched);
    }

    console.log(`[EMIT] room=${room} event=${event}`);
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
    res.end(JSON.stringify({ ok: true, room, event, broadcast_at: enriched.broadcast_at }));
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
  res.end(JSON.stringify({ error: "Not Found", path: req.url }));
});

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && originAllowed(origin) ? origin : DEV_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// ─── Socket.io Server ─────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (originAllowed(origin)) {
        cb(null, true);
      } else {
        // In development, be permissive — log and still allow (sandbox previews vary)
        console.warn(`[CORS] Rejecting origin: ${origin ?? "(none)"}`);
        cb(null, false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ─── Client Tracking ──────────────────────────────────────────────────────────
interface ClientState {
  id: string;
  subscribedCases: Set<string>;
  connectedAt: string;
}
const connectedClients = new Map<string, ClientState>();

// ─── Connection Handler ───────────────────────────────────────────────────────
io.on("connection", (socket: Socket) => {
  const clientId = socket.id;
  connectedClients.set(clientId, {
    id: clientId,
    subscribedCases: new Set(),
    connectedAt: new Date().toISOString(),
  });
  console.log(`[CONNECT] ${clientId} (total: ${connectedClients.size})`);

  // subscribe:case — client joins the case room
  socket.on("subscribe:case", (payload: { case_id?: string; caseId?: string }) => {
    const caseId = payload?.case_id ?? payload?.caseId;
    if (!caseId) {
      socket.emit("error", { message: "case_id is required for subscription" });
      return;
    }
    const room = `case:${caseId}`;
    socket.join(room);
    const c = connectedClients.get(clientId);
    if (c) c.subscribedCases.add(caseId);
    console.log(`[SUBSCRIBE] ${clientId} → ${room}`);
    socket.emit("subscribed", { case_id: caseId, room, timestamp: new Date().toISOString() });
  });

  // unsubscribe:case
  socket.on("unsubscribe:case", (payload: { case_id?: string; caseId?: string }) => {
    const caseId = payload?.case_id ?? payload?.caseId;
    if (!caseId) return;
    const room = `case:${caseId}`;
    socket.leave(room);
    const c = connectedClients.get(clientId);
    if (c) c.subscribedCases.delete(caseId);
    console.log(`[UNSUBSCRIBE] ${clientId} ← ${room}`);
    socket.emit("unsubscribed", { case_id: caseId, room, timestamp: new Date().toISOString() });
  });

  // ── Re-broadcast events from clients (so any client can publish) ────────────
  // Note: in production these come from the Next.js backend via POST /emit,
  // but we also support clients emitting directly for testing/dev.

  socket.on("case:created", (payload: Record<string, unknown> & { case_id?: string }) => {
    const enriched = { ...payload, broadcast_at: new Date().toISOString() };
    io.emit("case:created", enriched);
    if (payload?.case_id) {
      io.to(`case:${payload.case_id}`).emit("case:created", enriched);
    }
  });

  socket.on("trace:event", (payload: Record<string, unknown> & { case_id?: string }) => {
    const room = payload?.case_id ? `case:${payload.case_id}` : null;
    const enriched = { ...payload, broadcast_at: new Date().toISOString() };
    if (room) {
      io.to(room).emit("trace:event", enriched);
    } else {
      io.emit("trace:event", enriched);
    }
  });

  socket.on("gate:pending", (payload: Record<string, unknown> & { case_id?: string }) => {
    const enriched = { ...payload, broadcast_at: new Date().toISOString() };
    if (payload?.case_id) {
      io.to(`case:${payload.case_id}`).emit("gate:pending", enriched);
    }
    io.emit("gate:pending:global", enriched);
  });

  socket.on("gate:resolved", (payload: Record<string, unknown> & { case_id?: string }) => {
    const enriched = { ...payload, broadcast_at: new Date().toISOString() };
    if (payload?.case_id) {
      io.to(`case:${payload.case_id}`).emit("gate:resolved", enriched);
    }
    io.emit("gate:resolved:global", enriched);
  });

  socket.on("case:state:changed", (payload: Record<string, unknown> & { case_id?: string }) => {
    const enriched = { ...payload, broadcast_at: new Date().toISOString() };
    if (payload?.case_id) {
      io.to(`case:${payload.case_id}`).emit("case:state:changed", enriched);
    }
    io.emit("case:state:changed:global", enriched);
  });

  // ping / pong keepalive
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date().toISOString() });
  });

  socket.on("disconnect", (reason: string) => {
    const c = connectedClients.get(clientId);
    const n = c?.subscribedCases.size ?? 0;
    connectedClients.delete(clientId);
    console.log(`[DISCONNECT] ${clientId} (reason: ${reason}; was in ${n} case rooms; total: ${connectedClients.size})`);
  });
});

// ─── Start Server (port hardcoded to 3003) ────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 DenialDefender trace-stream v${SERVICE_VERSION} running on port ${PORT}`);
  console.log(`   Health:     GET  http://localhost:${PORT}/`);
  console.log(`   Emit (int): POST http://localhost:${PORT}/emit  { event, caseId, payload }`);
  console.log(`   Socket.io:  path /socket.io/  (gateway: io("/?XTransformPort=3003"))`);
  console.log(`   CORS:       ${DEV_ORIGINS.join(", ")}, *.run.app, preview.*`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function shutdown(signal: string) {
  console.log(`[SHUTDOWN] ${signal} received — closing trace-stream`);
  io.close();
  httpServer.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
