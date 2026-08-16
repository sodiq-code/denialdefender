import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloud Run Docker deployment — produces a standalone server
  // that does not require the full node_modules directory
  // (Disabled for local dev to avoid standalone mode issues)
  // output: 'standalone',

  reactStrictMode: true,

  // Image optimization — disable default loader for Cloud Run (no external optimizer)
  images: {
    unoptimized: true,
  },

  // Ensure Prisma can find the database at build time
  env: {
    DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
  },

  // Security headers for production
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
