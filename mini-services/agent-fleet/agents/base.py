"""
Base Agent class for DenialDefender's 8-Agent Fleet.

Provides the foundational pattern for all agents:
- Gemini API client initialization (or mock mode)
- Structured system prompt management
- Standardized run() method with error handling
- Decision trace event logging
- JSON response parsing with fallback
"""

from __future__ import annotations

import json
import logging
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from config import (
    AGENT_MAX_OUTPUT_TOKENS,
    AGENT_TEMPERATURE,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MOCK_MODE,
)

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract base class for all DenialDefender agents."""

    name: str = "base"
    role: str = "Base agent"
    system_prompt: str = "You are a helpful assistant."

    def __init__(self) -> None:
        self.client = None
        if not MOCK_MODE:
            try:
                from google import genai

                self.client = genai.Client(api_key=GEMINI_API_KEY)
                logger.info(f"[{self.name}] Gemini client initialized (model={GEMINI_MODEL})")
            except Exception as e:
                logger.warning(
                    f"[{self.name}] Failed to init Gemini client, falling back to mock: {e}"
                )
                self.client = None
        else:
            logger.info(f"[{self.name}] Running in MOCK_MODE (no Gemini API key)")

    # ─── Core run method ────────────────────────────────────────────
    async def run(self, input_data: dict) -> dict:
        """
        Execute the agent with the given input data.

        In mock mode or if Gemini client is unavailable, returns mock response.
        Otherwise, calls Gemini API with the agent's system prompt.
        """
        trace_id = str(uuid.uuid4())
        start_time = datetime.now(timezone.utc)

        logger.info(
            f"[{self.name}] Starting execution | trace_id={trace_id} | mock={self._is_mock()}"
        )

        try:
            if self._is_mock():
                result = await self.mock_run(input_data)
            else:
                result = await self._call_gemini(input_data)

            # Attach trace metadata
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            result["_trace"] = {
                "agent": self.name,
                "trace_id": trace_id,
                "mock": self._is_mock(),
                "elapsed_seconds": round(elapsed, 3),
                "timestamp": start_time.isoformat(),
            }

            logger.info(f"[{self.name}] Completed | trace_id={trace_id} | elapsed={elapsed:.3f}s")
            return result

        except Exception as e:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(f"[{self.name}] FAILED | trace_id={trace_id} | error={e}")

            return {
                "error": str(e),
                "agent": self.name,
                "_trace": {
                    "agent": self.name,
                    "trace_id": trace_id,
                    "mock": self._is_mock(),
                    "elapsed_seconds": round(elapsed, 3),
                    "timestamp": start_time.isoformat(),
                    "error": str(e),
                },
            }

    # ─── Gemini API call ────────────────────────────────────────────
    async def _call_gemini(self, input_data: dict) -> dict:
        """Call Gemini API with the agent's system prompt and parse the response."""
        contents = self._build_contents(input_data)

        response = await self.client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config={
                "system_instruction": self.system_prompt,
                "temperature": AGENT_TEMPERATURE,
                "max_output_tokens": AGENT_MAX_OUTPUT_TOKENS,
            },
        )

        return self._parse_response(response)

    # ─── Content building ───────────────────────────────────────────
    def _build_contents(self, input_data: dict) -> str:
        """
        Build the user message content from input data.
        Subclasses can override for custom formatting.
        """
        return json.dumps(input_data, indent=2, default=str)

    # ─── Response parsing ───────────────────────────────────────────
    def _parse_response(self, response: Any) -> dict:
        """
        Parse the Gemini API response into a structured dict.
        Attempts to extract JSON from the response text.
        Falls back to wrapping the raw text if JSON parsing fails.
        """
        try:
            text = response.text
        except AttributeError:
            # Handle candidate-based response
            try:
                text = response.candidates[0].content.parts[0].text
            except (AttributeError, IndexError):
                text = str(response)

        # Try to parse as JSON
        try:
            # Strip markdown code fences if present
            cleaned = text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[len("```json"):]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"raw_response": text}

    # ─── Mock response ──────────────────────────────────────────────
    @abstractmethod
    async def mock_run(self, input_data: dict) -> dict:
        """
        Return a mock/simulated response for demo purposes.
        Each agent must implement its own mock response.
        """
        ...

    # ─── Utilities ──────────────────────────────────────────────────
    def _is_mock(self) -> bool:
        """Check if this agent should run in mock mode."""
        return MOCK_MODE or self.client is None

    def _now_iso(self) -> str:
        """Return current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()
