# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Next.js Production Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Multi-stage build optimized for Cloud Run (europe-west1) deployment.
# Uses the full Next.js build (non-standalone) for maximum compatibility.
#
# Build:   docker build -t denialdefender-web .
# Run:     docker run -p 8080:8080 -e GCP_PROJECT_ID=denialdefender denialdefender-web
#
# Cloud Run injects PORT=8080 by default.
# Project: denialdefender (315133452553)
# Region:  europe-west1
# Gemini:  gemini-2.5-flash (Vertex AI provider, google-adk framework)
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package manifests + prisma schema for dependency install
COPY package.json bun.lock ./
COPY prisma ./prisma

# Set DATABASE_URL for prisma generate (postinstall hook)
ENV DATABASE_URL=file:./prisma/dev.db

# Install all dependencies (npm for native module support)
RUN npm install

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Create production database directory + file with tables pre-created
# (Cloud Run containers are read-only except /tmp; we bake the SQLite file in)
RUN mkdir -p /app/db && \
    DATABASE_URL=file:/app/db/production.db npx prisma db push --accept-data-loss

# Build Next.js using the production DB URL
ENV DATABASE_URL=file:/app/db/production.db
RUN npm run build

# ── Stage 3: Production Runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat python3 make g++ wget

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
# DATABASE_URL defaults to the SQLite file created during build.
# Cloud Run should NOT override this with a PostgreSQL URL (Prisma schema is SQLite).
# If Turso is used, set TURSO_DB_URL and TURSO_DB_TOKEN instead.
ENV DATABASE_URL=file:/app/db/production.db

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy full Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

# Copy node_modules (needed for non-standalone mode)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy Prisma schema and generated client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy the evidence corpus + cases data (used by runtime auto-seed)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Copy database file (production.db with tables pre-created during build)
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs

# Cloud Run default port
EXPOSE 8080

# GCP environment variables (overridden at deploy time via Cloud Run env config)
ENV GCP_REGION=europe-west1
ENV FIRESTORE_LOCATION=eur3
ENV GEMINI_PROVIDER=vertex_ai
ENV ADK_FRAMEWORK=google-adk
ENV GEMINI_MODEL=gemini-2.5-flash

# Health check — Cloud Run uses this to determine container readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Start Next.js server (respects PORT env var)
CMD ["npx", "next", "start"]
