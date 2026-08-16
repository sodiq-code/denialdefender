# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender Agent Fleet — Cloud Run Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# 8-agent workflow service (TypeScript/Bun + Python subprocess).
#
# Build:  docker build -t denialdefender-agent-fleet .
# Run:    docker run -p 8080:8080 -e GEMINI_API_KEY=xxx denialdefender-agent-fleet
# Cloud Run sets PORT=8080 automatically.
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Python dependencies ──────────────────────────────────────────────
FROM python:3.12-slim AS python-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Bun runtime with Python venv ────────────────────────────────────
FROM bun:1

WORKDIR /app

# Install Python runtime and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtual environment from builder
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy bun package files and install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile

# Copy TypeScript application source
COPY index.ts ./
COPY llm_backend.ts ./

# Copy Python agent source
COPY config.py ./
COPY llm_backend.py ./
COPY main.py ./
COPY requirements.txt ./
COPY agents/ ./agents/

# Cloud Run requires listening on PORT env var (defaults to 8080)
EXPOSE 8080

# GCP environment variables (overridden at deploy time via Cloud Run env config)
ENV GCP_PROJECT_ID=denialdefender
ENV GCP_REGION=europe-west1
ENV GEMINI_MODEL=gemini-3.5-flash

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the agent fleet service
CMD ["bun", "index.ts"]
