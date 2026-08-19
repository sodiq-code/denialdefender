import { NextResponse } from 'next/server';

/**
 * GET /api/config — Runtime configuration for client-side code
 *
 * Returns URLs that are configured at runtime (via Cloud Run env vars)
 * but need to be accessible from client-side JavaScript.
 * NEXT_PUBLIC_* vars are inlined at build time and don't reflect
 * runtime changes, so this endpoint provides the correct values.
 */
export async function GET() {
  return NextResponse.json({
    traceStreamUrl: process.env.NEXT_PUBLIC_TRACE_STREAM_URL || '',
    agentFleetUrl: process.env.AGENT_FLEET_URL || '',
    gcpProjectId: process.env.GCP_PROJECT_ID || '',
    gcpRegion: process.env.GCP_REGION || '',
    isCloudRun: (process.env.NEXT_PUBLIC_TRACE_STREAM_URL || process.env.AGENT_FLEET_URL || '') !== '',
  });
}
