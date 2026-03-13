"""LLM abstraction for provider-agnostic AI insights."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Protocol

InsightFocus = Literal["overview", "trend", "habits", "device"]


class LLMClient(Protocol):
    def generate_insights(
        self,
        stats: dict[str, Any],
        from_date: date | None,
        to_date: date | None,
        focus: InsightFocus = "overview",
        locale: str | None = None,
    ) -> str: ...

