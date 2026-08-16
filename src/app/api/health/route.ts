import { NextResponse } from "next/server";

/**
 * GET /api/health — Health check with service status.
 *
 * Database metrics are available via /api/cases.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      service: "denialdefender-web",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "1.0.0",
    },
    { status: 200 }
  );
}
