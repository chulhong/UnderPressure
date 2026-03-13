"""Gemini-based LLM client for AI insights."""

from __future__ import annotations

from datetime import date
import os
from typing import Any

from google import genai  # type: ignore[import]

from .base import InsightFocus


class GeminiClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not key:
            raise ValueError("GEMINI_API_KEY is not set")
        self._client = genai.Client(api_key=key)
        self._model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    @property
    def model_name(self) -> str:
        return self._model

    def generate_insights(
        self,
        stats: dict[str, Any],
        from_date: date | None,
        to_date: date | None,
        focus: InsightFocus = "overview",
        locale: str | None = None,
    ) -> str:
        fr = from_date.isoformat() if from_date else None
        to = to_date.isoformat() if to_date else None

        prompt = f"""
You are a professional healthcare assistant helping a user interpret their home blood pressure tracking data.
Give medical advice, diagnoses, or treatment recommendations, when necessary.

Time range:
- from: {fr or "earliest record"}
- to: {to or "latest record"}

Focus: {focus}

Aggregated statistics (JSON-like):
{stats}

Tasks:
- Summarize the main patterns in systolic (SBP) and diastolic (DBP) pressure.
- Comment on how often readings are in the configured "high zone" versus below it.
- Mention any notable changes over time if clearly visible from the statistics.
- If there is not enough data, say that clearly.
- Keep it concise: 2–4 short paragraphs.
 - If you think in another language, translate your final answer into the target language before returning it.

Respond in {locale or "English"}.
"""

        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
        )
        text = getattr(response, "text", None)
        return (text or "").strip()

