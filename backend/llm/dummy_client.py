"""Dummy LLM client for development and fallback."""

from __future__ import annotations

from datetime import date
from typing import Any

from .base import InsightFocus


class DummyClient:
    def generate_insights(
        self,
        stats: dict[str, Any],
        from_date: date | None,
        to_date: date | None,
        focus: InsightFocus = "overview",
        locale: str | None = None,
    ) -> str:
        if not stats or not stats.get("totalReadings"):
            return "Not enough data to provide insights yet. Log more blood pressure readings first."

        fr = from_date.isoformat() if from_date else "the beginning"
        to = to_date.isoformat() if to_date else "today"
        avg_sbp = stats.get("avgSbp")
        avg_dbp = stats.get("avgDbp")

        parts: list[str] = []
        parts.append(
            f"This is a placeholder AI summary for your readings from {fr} to {to}. "
            f"There are {stats['totalReadings']} total readings across {stats['periodsWithData']} days."
        )
        if avg_sbp is not None and avg_dbp is not None:
            parts.append(f"Average blood pressure in this period is approximately {avg_sbp}/{avg_dbp} mmHg.")
        high_ratio = stats.get("highZoneRatio")
        if isinstance(high_ratio, (int, float)):
            parts.append(
                f"About {high_ratio:.1f}% of readings are at or above your configured high zone thresholds."
            )
        parts.append("Connect a real LLM provider in Admin to see richer narrative insights.")
        return " ".join(parts)

