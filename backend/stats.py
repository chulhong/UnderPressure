"""Server-side statistics for AI insights."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

from .models import BPRecord
from .settings import get_settings
from .storage import get_all, get_by_date_range


@dataclass
class _Accum:
    sbp_sum: float = 0.0
    sbp_count: int = 0
    dbp_sum: float = 0.0
    dbp_count: int = 0
    total_readings: int = 0
    high_readings: int = 0
    periods_with_high: int = 0
    periods_all_in_range: int = 0
    min_sbp: int | None = None
    max_sbp: int | None = None
    min_dbp: int | None = None
    max_dbp: int | None = None


def _iter_values(record: BPRecord) -> Iterable[tuple[int | None, int | None]]:
    yield record.morning_sbp, record.morning_dbp
    yield record.evening_sbp, record.evening_dbp


def _update_accum(acc: _Accum, record: BPRecord, sbp_high: int, dbp_high: int) -> None:
    point_high = False
    point_all_in_range = True

    for sbp, dbp in _iter_values(record):
        if sbp is not None:
            acc.total_readings += 1
            acc.sbp_sum += sbp
            acc.sbp_count += 1
            acc.min_sbp = sbp if acc.min_sbp is None else min(acc.min_sbp, sbp)
            acc.max_sbp = sbp if acc.max_sbp is None else max(acc.max_sbp, sbp)
            if sbp >= sbp_high:
                acc.high_readings += 1
                point_high = True
                point_all_in_range = False
        if dbp is not None:
            acc.total_readings += 1
            acc.dbp_sum += dbp
            acc.dbp_count += 1
            acc.min_dbp = dbp if acc.min_dbp is None else min(acc.min_dbp, dbp)
            acc.max_dbp = dbp if acc.max_dbp is None else max(acc.max_dbp, dbp)
            if dbp >= dbp_high:
                acc.high_readings += 1
                point_high = True
                point_all_in_range = False

    if point_high:
        acc.periods_with_high += 1
    if point_all_in_range and record.has_any_measurement():
        acc.periods_all_in_range += 1


def _days_between(start: date, end: date) -> int:
    return (end - start).days + 1


def compute_insight_stats(from_date: date | None, to_date: date | None) -> dict[str, Any]:
    """
    Compute compact statistics suitable for feeding into an LLM.

    Returns a JSON-serializable dict similar in spirit to the frontend stats, but
    intentionally smaller and backend-only.
    """
    settings = get_settings()
    sbp_high = int(settings.get("sbp_high", 135) or 135)
    dbp_high = int(settings.get("dbp_high", 85) or 85)

    if from_date is None or to_date is None:
        all_records = get_all()
        if not all_records:
            return {}
        min_d = min(r.date for r in all_records)
        max_d = max(r.date for r in all_records)
        if from_date is None:
            from_date = min_d
        if to_date is None:
            to_date = max_d

    if from_date > to_date:
        return {}

    records = get_by_date_range(from_date, to_date)
    if not records:
        return {}

    acc = _Accum()
    for r in records:
        _update_accum(acc, r, sbp_high=sbp_high, dbp_high=dbp_high)

    days_in_range = _days_between(from_date, to_date)
    # Only count days that have at least one reading (records can be all-null placeholders)
    periods_with_data = sum(1 for r in records if r.has_any_measurement())
    measurement_ratio = (periods_with_data / days_in_range * 100.0) if days_in_range > 0 else None
    high_zone_ratio = (
        acc.high_readings / acc.total_readings * 100.0 if acc.total_readings > 0 else 0.0
    )
    normal_zone_ratio = (
        (acc.total_readings - acc.high_readings) / acc.total_readings * 100.0
        if acc.total_readings > 0
        else 0.0
    )
    pct_periods_all_in_range = (
        acc.periods_all_in_range / periods_with_data * 100.0 if periods_with_data > 0 else 0.0
    )

    avg_sbp = acc.sbp_sum / acc.sbp_count if acc.sbp_count > 0 else None
    avg_dbp = acc.dbp_sum / acc.dbp_count if acc.dbp_count > 0 else None

    return {
        "totalReadings": acc.total_readings,
        "highReadings": acc.high_readings,
        "highZoneRatio": round(high_zone_ratio, 1),
        "normalZoneRatio": round(normal_zone_ratio, 1),
        "avgSbp": round(avg_sbp, 1) if avg_sbp is not None else None,
        "avgDbp": round(avg_dbp, 1) if avg_dbp is not None else None,
        "periodsWithData": periods_with_data,
        "periodsWithHigh": acc.periods_with_high,
        "periodsAllInRange": acc.periods_all_in_range,
        "pctPeriodsAllInRange": round(pct_periods_all_in_range, 1),
        "daysInRange": days_in_range,
        "minSbp": acc.min_sbp,
        "maxSbp": acc.max_sbp,
        "minDbp": acc.min_dbp,
        "maxDbp": acc.max_dbp,
        "sbpHighThreshold": sbp_high,
        "dbpHighThreshold": dbp_high,
    }

