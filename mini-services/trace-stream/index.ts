import { createServer } from "http";
import { Server, Socket } from "socket.io";

const PORT = parseInt(process.env.PORT || "3003", 10);

// ─── HTTP Server ───────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "denialdefender-trace-stream",
        version: "1.0.0",
        connectedClients: io.engine.clientsCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end("Not Found");
});

// ─── Socket.io Server ─────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      // Allow sandbox preview origins
      /^https?:\/\/.*\.preview\..*$/,
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Transport settings for reliability
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ─── Types ────────────────────────────────────────────────────
interface CaseCreatedPayload {
  case_id: string;
  patient_id: string;
  claim_id: string;
  created_at: string;
  initial_state: string;
}

interface TraceEventPayload {
  case_id: string;
  trace_id: string;
  step: number;
  rule_id: string;
  rule_name: string;
  decision: "approve" | "deny" | "escalate" | "review" | "info";
  confidence: number;
  reason: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface GatePendingPayload {
  case_id: string;
  gate_id: string;
  gate_type: string;
  description: string;
  assigned_to?: string;
  priority: "low" | "medium" | "high" | "critical";
  created_at: string;
}

interface GateResolvedPayload {
  case_id: string;
  gate_id: string;
  resolved_by: string;
  resolution: "approved" | "denied" | "escalated" | "deferred";
  notes?: string;
  resolved_at: string;
}

interface CaseStateChangedPayload {
  case_id: string;
  from_state: string;
  to_state: string;
  transition_reason: string;
  timestamp: string;
}

interface SubscribePayload {
  case_id: string;
}

// ─── Client Tracking ──────────────────────────────────────────
const connectedClients = new Map<
  string,
  {
    id: string;
    subscribedCases: Set<string>;
    connectedAt: string;
  }
>();

// ─── Connection Handler ───────────────────────────────────────
io.on("connection", (socket: Socket) => {
  const clientId = socket.id;

  // Register client
  connectedClients.set(clientId, {
    id: clientId,
    subscribedCases: new Set(),
    connectedAt: new Date().toISOString(),
  });

  console.log(
    `[CONNECT] Client ${clientId} connected. Total: ${connectedClients.size}`
  );

  // ── Subscribe to a case room ──────────────────────────────
  socket.on("subscribe:case", (payload: SubscribePayload) => {
    const { case_id } = payload;
    if (!case_id) {
      socket.emit("error", { message: "case_id is required for subscription" });
      return;
    }

    const room = `case:${case_id}`;
    socket.join(room);

    const client = connectedClients.get(clientId);
    if (client) {
      client.subscribedCases.add(case_id);
    }

    console.log(
      `[SUBSCRIBE] Client ${clientId} subscribed to case ${case_id} (room: ${room})`
    );

    // Confirm subscription to the client
    socket.emit("subscribed", {
      case_id,
      room,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Unsubscribe from a case room ─────────────────────────
  socket.on("unsubscribe:case", (payload: SubscribePayload) => {
    const { case_id } = payload;
    if (!case_id) return;

    const room = `case:${case_id}`;
    socket.leave(room);

    const client = connectedClients.get(clientId);
    if (client) {
      client.subscribedCases.delete(case_id);
    }

    console.log(
      `[UNSUBSCRIBE] Client ${clientId} unsubscribed from case ${case_id}`
    );

    socket.emit("unsubscribed", {
      case_id,
      room,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Event: case:created ───────────────────────────────────
  // Broadcast globally — any connected client may want to know
  socket.on("case:created", (payload: CaseCreatedPayload) => {
    console.log(
      `[CASE:CREATED] case_id=${payload.case_id} patient_id=${payload.patient_id}`
    );

    // Broadcast to all connected clients
    io.emit("case:created", {
      ...payload,
      broadcast_at: new Date().toISOString(),
    });

    // Also emit to the specific case room if someone already subscribed
    const room = `case:${payload.case_id}`;
    io.to(room).emit("case:created", {
      ...payload,
      broadcast_at: new Date().toISOString(),
    });
  });

  // ── Event: trace:event ────────────────────────────────────
  // Broadcast to the case room only
  socket.on("trace:event", (payload: TraceEventPayload) => {
    console.log(
      `[TRACE:EVENT] case_id=${payload.case_id} step=${payload.step} rule=${payload.rule_name} decision=${payload.decision}`
    );

    const room = `case:${payload.case_id}`;
    io.to(room).emit("trace:event", {
      ...payload,
      broadcast_at: new Date().toISOString(),
    });
  });

  // ── Event: gate:pending ───────────────────────────────────
  // HITL gate needs attention — broadcast to case room + global
  socket.on("gate:pending", (payload: GatePendingPayload) => {
    console.log(
      `[GATE:PENDING] case_id=${payload.case_id} gate_id=${payload.gate_id} type=${payload.gate_type} priority=${payload.priority}`
    );

    const room = `case:${payload.case_id}`;
    const enrichedPayload = {
      ...payload,
      broadcast_at: new Date().toISOString(),
    };

    // Broadcast to case room
    io.to(room).emit("gate:pending", enrichedPayload);

    // Also broadcast globally for dashboards that track all pending gates
    io.emit("gate:pending:global", enrichedPayload);
  });

  // ── Event: gate:resolved ──────────────────────────────────
  socket.on("gate:resolved", (payload: GateResolvedPayload) => {
    console.log(
      `[GATE:RESOLVED] case_id=${payload.case_id} gate_id=${payload.gate_id} resolution=${payload.resolution}`
    );

    const room = `case:${payload.case_id}`;
    const enrichedPayload = {
      ...payload,
      broadcast_at: new Date().toISOString(),
    };

    // Broadcast to case room
    io.to(room).emit("gate:resolved", enrichedPayload);

    // Global notification
    io.emit("gate:resolved:global", enrichedPayload);
  });

  // ── Event: case:state:changed ─────────────────────────────
  socket.on("case:state:changed", (payload: CaseStateChangedPayload) => {
    console.log(
      `[CASE:STATE:CHANGED] case_id=${payload.case_id} ${payload.from_state} → ${payload.to_state}`
    );

    const room = `case:${payload.case_id}`;
    const enrichedPayload = {
      ...payload,
      broadcast_at: new Date().toISOString(),
    };

    // Broadcast to case room
    io.to(room).emit("case:state:changed", enrichedPayload);

    // Global for dashboard tracking
    io.emit("case:state:changed:global", enrichedPayload);
  });

  // ── Ping / keepalive ─────────────────────────────────────
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date().toISOString() });
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    const client = connectedClients.get(clientId);
    const caseCount = client?.subscribedCases.size ?? 0;
    connectedClients.delete(clientId);

    console.log(
      `[DISCONNECT] Client ${clientId} disconnected (reason: ${reason}). Was subscribed to ${caseCount} cases. Total: ${connectedClients.size}`
    );
  });
});

// ─── Start Server ─────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(
    `🚀 DenialDefender Trace Stream server running on port ${PORT}`
  );
  console.log(`   Health check: http://localhost:${PORT}/`);
  console.log(`   Socket.io path: /socket.io/`);
  console.log(`   CORS: localhost:3000`);
});

// ─── Graceful Shutdown ────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received, closing server...");
  io.close();
  httpServer.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] SIGINT received, closing server...");
  io.close();
  httpServer.close();
  process.exit(0);
});
