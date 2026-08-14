# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender Agent Fleet — Python ADK Dockerfile
# ══════════════════════════════════════════════════════════════════════════════
# Multi-stage build for the Python agent fleet running on Google ADK.
# Agents: Researcher, Drafter, Reviewer, PHI Guard, Orchestrator
#
# Build:  docker build -t denialdefender-agents .
# Run:    docker run -p 3004:3004 -e GEMINI_API_KEY=xxx denialdefender-agents
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .

# Create virtual environment and install deps
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Production Runtime ──────────────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user for security
RUN groupadd --gid 1001 agents && \
    useradd --uid 1001 --gid agents --create-home agentuser

# Copy agent fleet source code
COPY --chown=agentuser:agents . .

# Install agent fleet package (if setup.py/pyproject.toml exists)
RUN if [ -f "pyproject.toml" ]; then \
      pip install --no-cache-dir -e .; \
    elif [ -f "setup.py" ]; then \
      pip install --no-cache-dir -e .; \
    fi

USER agentuser

EXPOSE 3004

# GCP environment variables (overridden at deploy time via Cloud Run env config)
ENV GCP_PROJECT_ID=project-8a09278a-5593-4289-b2e
ENV GCP_REGION=europe-west1
ENV FIRESTORE_LOCATION=eur3
ENV AGENT_PORT=3004
ENV LOG_LEVEL=info
ENV GEMINI_MODEL=gemini-2.0-flash
ENV EMBEDDING_MODEL=text-embedding-004
ENV EMBEDDING_DIMENSIONS=768

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3004/health')" || exit 1

# Start the agent fleet via uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3004", "--workers", "2", "--log-level", "info"]
