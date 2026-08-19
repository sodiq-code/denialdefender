# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender Trace Stream — Cloud Run Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Socket.io server for real-time trace event streaming.
# Port: HARDCODED to 3003 in index.ts (per task spec — never read from env).
# Cloud Run must be told to expect traffic on port 3003 (--port=3003).
#
# Build:  docker build -t denialdefender-trace-stream .
# Run:    docker run -p 3003:3003 denialdefender-trace-stream
# ══════════════════════════════════════════════════════════════════════════════

FROM oven/bun:1

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy application source
COPY index.ts ./
COPY README.md ./

# Trace-stream listens on port 3003 (hardcoded in index.ts)
EXPOSE 3003

# Health check — trace-stream health endpoint is GET /
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3003/ || exit 1

CMD ["bun", "index.ts"]
