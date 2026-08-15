# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender Trace Stream — Cloud Run Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Socket.io server for real-time trace event streaming.
#
# Build:  docker build -t denialdefender-trace-stream .
# Run:    docker run -p 8080:8080 denialdefender-trace-stream
# Cloud Run sets PORT=8080 automatically.
# ══════════════════════════════════════════════════════════════════════════════

FROM bun:1

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile

# Copy application source
COPY index.ts ./

# Cloud Run requires listening on PORT env var (defaults to 8080)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/ || exit 1

# Start the trace stream server
CMD ["bun", "index.ts"]
