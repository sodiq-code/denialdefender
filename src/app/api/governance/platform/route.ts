/**
 * API Route — Google Agent Platform Status
 *
 * GET /api/governance/platform — Returns platform integration status
 *
 * This endpoint shows whether DenialDefender is connected to the real
 * Google Agent Platform or running in local-fallback mode.
 *
 * The 3 adopted components (Memory, Policies, Registry) each show:
 *   - Whether the platform API is reachable
 *   - Which backend was used for the last operation
 *   - Whether the integration is genuine or checkbox-level
 *
 * The skipped components show WHY they were cut (per Table 12.1).
 */

import { NextResponse } from 'next/server';
import { getPlatformStatus } from '@/lib/geap-platform';

export async function GET() {
  try {
    const status = getPlatformStatus();

    return NextResponse.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
