# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Next.js Production Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Multi-stage build optimized for Cloud Run deployment.
# Uses full Next.js build (non-standalone) for maximum compatibility.
#
# Build:  docker build -t denialdefender-web .
# Run:    docker run -p 8080:8080 -e GCP_PROJECT_ID=denialdefender denialdefender-web
#
# Cloud Run injects PORT=8080 by default.
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package manifests + prisma schema for dependency install
COPY package.json bun.lock ./
COPY prisma ./prisma

# Set DATABASE_URL for prisma generate (postinstall hook)
ENV DATABASE_URL=file:./prisma/dev.db

# Install all dependencies (using npm for better native module support)
RUN npm install

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
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

# Create production database directory and file
# This ensures tables exist at runtime for Cloud Run
RUN mkdir -p /app/db && \
    DATABASE_URL=file:/app/db/production.db npx prisma db push --accept-data-loss

# Build Next.js (use the production DB URL)
ENV DATABASE_URL=file:/app/db/production.db
RUN npm run build

# ── Stage 3: Production Runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat python3 make g++

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

# Copy Prisma schema and generated client (needed at runtime for DB queries)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy database file (production.db with tables pre-created during build)
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

# Ensure the database directory is writable (Cloud Run containers are read-only except /tmp)
# The db.ts auto-initialization will create tables if they don't exist.

USER nextjs

# Cloud Run default port
EXPOSE 8080

# GCP environment variables (overridden at deploy time via Cloud Run env config)
# GCP_PROJECT_ID is set by Cloud Run deploy --set-env-vars
ENV GCP_REGION=europe-west1
ENV FIRESTORE_LOCATION=eur3

# Health check — Cloud Run uses this to determine container readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Start Next.js server (respects PORT env var)
CMD ["npx", "next", "start"]
