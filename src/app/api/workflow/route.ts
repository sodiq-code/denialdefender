import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/workflow — Get agent fleet health status
 * POST /api/workflow — Run the full appeal workflow for a case
 *
 * Proxies to the agent fleet service.
 * On Cloud Run, includes an Identity Token for service-to-service auth.
 */

const AGENT_FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const IS_CLOUD_RUN = AGENT_FLEET_URL.includes('.run.app');

// Cloud Run Identity Token cache
let cachedIdToken: string | null = null;
let cachedIdTokenExpiry = 0;

async function getIdentityToken(): Promise<string | null> {
  if (!IS_CLOUD_RUN) return null;

  const now = Date.now();
  if (cachedIdToken && now < cachedIdTokenExpiry) {
    return cachedIdToken;
  }

  try {
    const metaUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${AGENT_FLEET_URL}`;
    const metaResp = await fetch(metaUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3000),
    });

    if (metaResp.ok) {
      const token = await metaResp.text();
      cachedIdToken = token;
      cachedIdTokenExpiry = now + 50 * 60 * 1000; // Cache for 50 min (tokens last 60 min)
      return token;
    }
  } catch {
    // Not on Cloud Run or metadata server unavailable
  }

  return null;
}

export async function GET() {
  try {
    const headers: Record<string, string> = {};
    const idToken = await getIdentityToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch(`${AGENT_FLEET_URL}/health`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const health = await res.json();
      return NextResponse.json({ health });
    }

    return NextResponse.json(
      { health: { status: 'error', message: `Agent fleet returned ${res.status}` } },
      { status: 503 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { health: { status: 'error', message } },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const idToken = await getIdentityToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch(`${AGENT_FLEET_URL}/workflow/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[POST /api/workflow] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Workflow execution failed', details: message },
      { status: 500 }
    );
  }
}
