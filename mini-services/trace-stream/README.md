# DenialDefender — trace-stream mini-service

A standalone **Bun + Socket.io** server that streams DenialDefender decision-trace
events to subscribed web clients in real time.

- **Port**: `3003` (hardcoded — never read from env)
- **Health check**: `GET /` → `{ status: "ok", service: "trace-stream", ... }`
- **Internal emit**: `POST /emit` with `{ event, caseId, payload }` → broadcasts to room `case:<caseId>`
- **Socket.io events** (re-broadcast): `case:created`, `trace:event`, `gate:pending`, `gate:resolved`, `case:state:changed`
- **CORS**: allows `localhost:3000`, `127.0.0.1:3000`, any `*.run.app`, and sandbox preview origins

## Run

```bash
bun install
bun run dev   # bun --hot index.ts (auto-restart on changes)
```

## How clients connect

The Caddy gateway routes `/?XTransformPort=3003` to port 3003. The frontend uses:

```ts
import { io } from "socket.io-client";
const socket = io("/?XTransformPort=3003");
socket.emit("subscribe:case", { case_id: "case_001" });
socket.on("trace:event", (e) => console.log(e));
```

The Next.js backend broadcasts trace events by calling this service directly:

```ts
await fetch("http://localhost:3003/emit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event: "trace:event", caseId: "case_001", payload: { ... } }),
});
```

## Architecture

```
  Browser ──(Socket.io via Caddy /?XTransformPort=3003)──► trace-stream :3003
                                                              │
  Next.js API ──(HTTP POST /emit)───────────────────────────►┘
```

The trace-stream service is stateless beyond in-memory client subscriptions — restart
drops all subscriptions, and clients must reconnect + re-subscribe.
