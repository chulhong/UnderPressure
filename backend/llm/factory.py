"""Factory for creating LLM clients."""

from __future__ import annotations

import os

from .base import LLMClient
from .dummy_client import DummyClient

try:
    from .gemini_client import GeminiClient
except Exception:  # pragma: no cover - optional dependency
    GeminiClient = None  # type: ignore[assignment]


def get_llm_client(provider: str | None = None) -> LLMClient:
    """Return an LLM client instance for the given provider."""
    provider_name = (provider or os.getenv("LLM_PROVIDER", "dummy")).lower()

    if provider_name == "gemini" and GeminiClient is not None:
        try:
            return GeminiClient()
        except Exception:
            # Fall back to dummy client when Gemini misconfigured.
            return DummyClient()

    # OpenAI or other providers could be added here in the future.
    return DummyClient()

