# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender Agent Fleet — Cloud Run Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Bun agent-fleet service (8 agents, mock mode in sandbox).
# Port: HARDCODED to 3004 in index.ts (per task spec — never read from env).
# Cloud Run must be told to expect traffic on port 3004 (--port=3004).
#
# Build:  docker build -t denialdefender-agents .
# Run:    docker run -p 3004:3004 -e GEMINI_API_KEY=xxx denialdefender-agents
# ══════════════════════════════════════════════════════════════════════════════

FROM oven/bun:1

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies (no external deps required,
# but run bun install for lockfile integrity)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy application source
COPY index.ts ./
COPY README.md ./

# Agent fleet listens on port 3004 (hardcoded in index.ts)
EXPOSE 3004

# Health check — agent-fleet health endpoint is GET /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

# GCP environment variables (overridden at deploy time via Cloud Run env config)
ENV GCP_PROJECT_ID=denialdefender
ENV GCP_REGION=europe-west1
ENV GEMINI_MODEL=gemini-2.5-flash
ENV GEMINI_PROVIDER=vertex_ai
ENV ADK_FRAMEWORK=google-adk

CMD ["bun", "index.ts"]
