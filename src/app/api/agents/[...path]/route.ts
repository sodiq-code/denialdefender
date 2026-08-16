import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for agent fleet API calls.
 *
 * Forwards requests from /api/agents/* to the agent fleet service.
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
      cachedIdTokenExpiry = now + 50 * 60 * 1000;
      return token;
    }
  } catch {
    // Not on Cloud Run
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
) {
  try {
    const { path } = await params;
    const pathStr = path.join('/');

    let targetPath: string;
    if (pathStr === 'health') {
      targetPath = '/health';
    } else if (pathStr === 'gcp/status') {
      targetPath = '/gcp/status';
    } else if (pathStr === 'workflow/run') {
      targetPath = '/workflow/run';
    } else if (pathStr.startsWith('workflow/status/')) {
      targetPath = `/${pathStr}`;
    } else {
      targetPath = `/agents/${pathStr}`;
    }

    const targetUrl = `${AGENT_FLEET_URL}${targetPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const idToken = await getIdentityToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(120000),
    };

    if (request.method === 'POST') {
      fetchOptions.body = await request.text();
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[/api/agents/*] Proxy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return NextResponse.json(
      { error: 'Agent fleet proxy error', details: message },
      { status: 502 }
    );
  }
}
