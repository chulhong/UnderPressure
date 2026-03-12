"""Aggregate BP records by week, month, quarter, year for charts and PDF."""

from datetime import date, timedelta
from typing import Literal

from .models import BPRecord
from .storage import get_by_date_range

Period = Literal["day", "week", "month", "quarter", "year"]


def _week_start(d: date) -> date:
    """Monday of the week containing d."""
    return d - timedelta(days=d.weekday())


def _quarter_start(d: date) -> date:
    """First day of quarter."""
    month = ((d.month - 1) // 3) * 3 + 1
    return date(d.year, month, 1)


def _group_key(r: BPRecord, period: Period) -> str:
    d = r.date
    if period == "day":
        return d.isoformat()
    if period == "week":
        ws = _week_start(d)
        return ws.isoformat()
    if period == "month":
        return d.replace(day=1).isoformat()[:7]  # YYYY-MM
    if period == "quarter":
        qs = _quarter_start(d)
        return f"{qs.year}-Q{(qs.month - 1) // 3 + 1}"
    if period == "year":
        return str(d.year)
    return d.isoformat()


def _avg(values: list[int | None]) -> float | None:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def aggregate(
    from_date: date,
    to_date: date,
    period: Period,
) -> list[dict]:
    """
    Return list of { period_key, label, morning_sbp, morning_dbp, evening_sbp, evening_dbp, count }.
    Averages are over the period; count is number of days with data.
    """
    records = get_by_date_range(from_date, to_date)
    if not records:
        return []

    buckets: dict[str, list[BPRecord]] = {}
    for r in records:
        key = _group_key(r, period)
        buckets.setdefault(key, []).append(r)

    out = []
    for key in sorted(buckets.keys()):
        group = buckets[key]
        morning_sbp = _avg([r.morning_sbp for r in group])
        morning_dbp = _avg([r.morning_dbp for r in group])
        evening_sbp = _avg([r.evening_sbp for r in group])
        evening_dbp = _avg([r.evening_dbp for r in group])
        # Label for display
        if period == "day":
            label = key  # YYYY-MM-DD
        elif period == "week":
            try:
                d = date.fromisoformat(key)
                label = f"{d.isoformat()}"
            except Exception:
                label = key
        elif period == "month":
            label = key  # YYYY-MM
        elif period == "quarter":
            label = key  # YYYY-Qn
        else:
            label = key
        out.append({
            "period_key": key,
            "label": label,
            "morning_sbp": round(morning_sbp, 1) if morning_sbp is not None else None,
            "morning_dbp": round(morning_dbp, 1) if morning_dbp is not None else None,
            "evening_sbp": round(evening_sbp, 1) if evening_sbp is not None else None,
            "evening_dbp": round(evening_dbp, 1) if evening_dbp is not None else None,
            "count": len(group),
        })
    return out
