# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Next.js Production Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Multi-stage build optimized for Cloud Run deployment.
# Uses Next.js standalone output for minimal image size.
#
# Build:  docker build -t denialdefender-web .
# Run:    docker run -p 8080:8080 -e GCP_PROJECT_ID=denialdefender denialdefender-web
#
# Cloud Run injects PORT=8080 by default. The standalone Next.js server
# respects the PORT environment variable automatically.
#
# Note: The agent-fleet service has its own Dockerfile at
#       mini-services/agent-fleet/Dockerfile and is deployed separately.
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package manifests for dependency install
COPY package.json bun.lock ./

# Install bun for reproducible dependency installation (matches local dev)
RUN npm install -g bun@latest

# Install all dependencies (including devDependencies needed for build)
RUN bun install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (uses standalone output mode via next.config.ts)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── Stage 3: Production Runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT=8080 by default; standalone server.js respects it
ENV PORT=8080

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone Next.js server (minimal footprint)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema and generated client (needed at runtime for DB queries)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy database file if using SQLite locally
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs

# Cloud Run default port
EXPOSE 8080

# GCP environment variables (overridden at deploy time via Cloud Run env config)
ENV GCP_PROJECT_ID=denialdefender
ENV GCP_REGION=europe-west1
ENV FIRESTORE_LOCATION=eur3

# Health check — Cloud Run uses this to determine container readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Start Next.js standalone server (respects PORT env var)
CMD ["node", "server.js"]
