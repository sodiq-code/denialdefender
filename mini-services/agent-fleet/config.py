"""
DenialDefender Agent Fleet Configuration.

Reads environment variables for Gemini API access and service configuration.
If GEMINI_API_KEY is not set, agents return mock/simulated responses for demo.
"""

import os

# ─── Gemini / Google ADK Configuration ─────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "denialdefender")

# ─── Dual-Backend LLM Configuration ────────────────────────────────
# Force a specific backend: "gemini" (direct API) or "zai" (z-ai-web-dev-sdk)
# Leave empty for auto-detection (try Gemini first, fall back to z-ai)
FORCE_LLM_BACKEND = os.getenv("FORCE_LLM_BACKEND", "")
# Timeout in seconds for Gemini API health check
GEMINI_CHECK_TIMEOUT = int(os.getenv("GEMINI_CHECK_TIMEOUT", "5"))
# Timeout in seconds for LLM generation calls
LLM_GENERATION_TIMEOUT = int(os.getenv("LLM_GENERATION_TIMEOUT", "60"))
# z-ai SDK CLI path (default: "z-ai")
ZAI_SDK_CLI_PATH = os.getenv("ZAI_SDK_CLI_PATH", "z-ai")

# ─── Service Configuration ─────────────────────────────────────────
AGENT_FLEET_PORT = int(os.getenv("AGENT_FLEET_PORT", "3004"))
SERVICE_NAME = "denialdefender-agent-fleet"
SERVICE_VERSION = "1.0.0"

# ─── Agent Configuration ───────────────────────────────────────────
# Temperature for deterministic agent outputs (low = more consistent)
AGENT_TEMPERATURE = 0.2
# Maximum output tokens per agent call
AGENT_MAX_OUTPUT_TOKENS = 4096
# Maximum review-revision loops before forcing completion
MAX_REVISION_LOOPS = 3

# ─── Feature Flags ─────────────────────────────────────────────────
# When True, agents return structured mock data without calling Gemini
MOCK_MODE = GEMINI_API_KEY == ""

# ─── CORS ──────────────────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3004",
    "http://127.0.0.1:3004",
]
