import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/auto-seed";

/**
 * GET /api/health — Health check with service + live-fleet status.
 * Triggers an idempotent auto-seed of the evidence corpus on cold start.
 */
export async function GET() {
  // Fire-and-forget the seed so the health check stays fast (<50ms).
  void ensureSeeded();

  let mockMode = true;
  let agents: string[] | undefined;
  const fleetUrl = process.env.AGENT_FLEET_URL || "";
  if (fleetUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`${fleetUrl}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const f = await res.json();
        mockMode = f.mock_mode === true;
        agents = f.agents;
      }
    } catch {
      // Fleet unreachable — stays mock.
    }
  }

  return NextResponse.json(
    {
      status: "healthy",
      service: "denialdefender-web",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "1.0.0",
      mockMode,
      liveMode: !mockMode,
      agents,
      geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    },
    { status: 200 },
  );
}
