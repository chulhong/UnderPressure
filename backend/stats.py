"""
Single source of truth for blood pressure statistics (UI + AI insights).

Semantics match the former frontend `utils/stats.js`: one "reading" = one morning or
evening measurement slot; high zone is evaluated per slot (SBP or DBP over threshold).
"""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

from .aggregation import aggregate
from .models import BPRecord
from .settings import get_settings
from .storage import get_all, get_by_date_range

WEEKDAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]

MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

_LABEL_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(n):
        return None
    return n


def _rnd1(x: float) -> float:
    return round(x * 10) / 10


def _mean(nums: list[float]) -> float | None:
    if not nums:
        return None
    return sum(nums) / len(nums)


def _std_dev_population(nums: list[float]) -> float | None:
    if len(nums) < 2:
        return None
    m = sum(nums) / len(nums)
    var = sum((x - m) ** 2 for x in nums) / len(nums)
    return math.sqrt(var)


def _days_between_inclusive(start: date, end: date) -> int:
    return (end - start).days + 1


def _js_weekday(d: date) -> int:
    """0=Sunday .. 6=Saturday (match JavaScript Date.getDay())."""
    return (d.weekday() + 1) % 7


def _day_diff_days(a_iso: str, b_iso: str) -> int:
    da = date.fromisoformat(a_iso)
    db = date.fromisoformat(b_iso)
    return (db - da).days


def _filter_daily_to_range(
    daily: list[dict[str, Any]], range_from: str, range_to: str
) -> list[dict[str, Any]]:
    return [d for d in daily if d.get("label") and range_from <= d["label"] <= range_to]


def compute_all_stats(
    data: list[dict[str, Any]],
    range_from: str | None,
    range_to: str | None,
    sbp_high: int,
    dbp_high: int,
) -> dict[str, Any] | None:
    """Port of frontend computeAllStats (aggregated day rows)."""
    if not data:
        return None

    all_sbp: list[float] = []
    all_dbp: list[float] = []
    total_readings = 0
    high_readings = 0
    sbp_sum = 0.0
    dbp_sum = 0.0
    sbp_count = 0
    dbp_count = 0
    periods_with_high = 0
    morning_sbp_half: list[float] = []
    morning_dbp_half: list[float] = []
    evening_sbp_half: list[float] = []
    evening_dbp_half: list[float] = []
    pulse_pressures: list[float] = []
    periods_all_in_range = 0
    periods_with_data_count = 0
    period_rows: list[dict[str, Any]] = []

    for d in data:
        morning_sbp = _num(d.get("morning_sbp"))
        morning_dbp = _num(d.get("morning_dbp"))
        evening_sbp = _num(d.get("evening_sbp"))
        evening_dbp = _num(d.get("evening_dbp"))
        has_morning = morning_sbp is not None or morning_dbp is not None
        has_evening = evening_sbp is not None or evening_dbp is not None

        if has_morning:
            total_readings += 1
            if (morning_sbp is not None and morning_sbp >= sbp_high) or (
                morning_dbp is not None and morning_dbp >= dbp_high
            ):
                high_readings += 1
        if has_evening:
            total_readings += 1
            if (evening_sbp is not None and evening_sbp >= sbp_high) or (
                evening_dbp is not None and evening_dbp >= dbp_high
            ):
                high_readings += 1

        point_high = (
            has_morning
            and (
                (morning_sbp is not None and morning_sbp >= sbp_high)
                or (morning_dbp is not None and morning_dbp >= dbp_high)
            )
        ) or (
            has_evening
            and (
                (evening_sbp is not None and evening_sbp >= sbp_high)
                or (evening_dbp is not None and evening_dbp >= dbp_high)
            )
        )
        point_all_in_range = True
        period_sbp_sum = 0.0
        period_sbp_count = 0
        period_dbp_sum = 0.0
        period_dbp_count = 0

        vals = [
            (morning_sbp, morning_dbp),
            (evening_sbp, evening_dbp),
        ]
        for sbp, dbp in vals:
            if sbp is not None:
                all_sbp.append(sbp)
                sbp_sum += sbp
                sbp_count += 1
                period_sbp_sum += sbp
                period_sbp_count += 1
                if sbp >= sbp_high:
                    point_all_in_range = False
            if dbp is not None:
                all_dbp.append(dbp)
                dbp_sum += dbp
                dbp_count += 1
                period_dbp_sum += dbp
                period_dbp_count += 1
                if dbp >= dbp_high:
                    point_all_in_range = False
            if sbp is not None and dbp is not None:
                pulse_pressures.append(sbp - dbp)

        if point_high:
            periods_with_high += 1
        if point_all_in_range and (has_morning or has_evening):
            periods_all_in_range += 1
        if has_morning or has_evening:
            periods_with_data_count += 1

        if _num(d.get("morning_sbp")) is not None:
            morning_sbp_half.append(_num(d.get("morning_sbp")))  # type: ignore[arg-type]
        if _num(d.get("morning_dbp")) is not None:
            morning_dbp_half.append(_num(d.get("morning_dbp")))  # type: ignore[arg-type]
        if _num(d.get("evening_sbp")) is not None:
            evening_sbp_half.append(_num(d.get("evening_sbp")))  # type: ignore[arg-type]
        if _num(d.get("evening_dbp")) is not None:
            evening_dbp_half.append(_num(d.get("evening_dbp")))  # type: ignore[arg-type]

        avg_sbp_here = period_sbp_sum / period_sbp_count if period_sbp_count > 0 else None
        avg_dbp_here = period_dbp_sum / period_dbp_count if period_dbp_count > 0 else None
        if avg_sbp_here is not None or avg_dbp_here is not None:
            period_rows.append(
                {
                    "label": d.get("label"),
                    "avgSbp": avg_sbp_here,
                    "avgDbp": avg_dbp_here,
                }
            )

    days_in_range: int | None = None
    if range_from and range_to:
        days_in_range = max(
            1,
            _day_diff_days(range_from, range_to) + 1,
        )
    measurement_ratio = (
        (periods_with_data_count / days_in_range * 100.0)
        if days_in_range is not None and days_in_range > 0
        else None
    )
    high_zone_ratio = (high_readings / total_readings * 100.0) if total_readings > 0 else 0.0
    normal_zone_ratio = (
        ((total_readings - high_readings) / total_readings * 100.0) if total_readings > 0 else 0.0
    )
    pct_periods_all_in_range = (
        (periods_all_in_range / periods_with_data_count * 100.0)
        if periods_with_data_count > 0
        else 0.0
    )

    avg_sbp_v = _mean(all_sbp)
    avg_dbp_v = _mean(all_dbp)
    avg_sbp = _rnd1(avg_sbp_v) if avg_sbp_v is not None else None
    avg_dbp = _rnd1(avg_dbp_v) if avg_dbp_v is not None else None
    avg_pulse_v = _mean(pulse_pressures)
    avg_pulse_pressure = _rnd1(avg_pulse_v) if avg_pulse_v is not None else None
    min_pulse = min(pulse_pressures) if pulse_pressures else None
    max_pulse = max(pulse_pressures) if pulse_pressures else None

    m_sbp = _mean(morning_sbp_half)
    m_dbp = _mean(morning_dbp_half)
    e_sbp = _mean(evening_sbp_half)
    e_dbp = _mean(evening_dbp_half)
    morning_avg_sbp = _rnd1(m_sbp) if m_sbp is not None else None
    morning_avg_dbp = _rnd1(m_dbp) if m_dbp is not None else None
    evening_avg_sbp = _rnd1(e_sbp) if e_sbp is not None else None
    evening_avg_dbp = _rnd1(e_dbp) if e_dbp is not None else None
    morning_evening_diff_sbp = (
        _rnd1(e_sbp - m_sbp)
        if m_sbp is not None and e_sbp is not None
        else None
    )
    morning_evening_diff_dbp = (
        _rnd1(e_dbp - m_dbp)
        if m_dbp is not None and e_dbp is not None
        else None
    )

    data_with_readings = [
        row
        for row in data
        if (
            _num(row.get("morning_sbp")) is not None
            or _num(row.get("morning_dbp")) is not None
            or _num(row.get("evening_sbp")) is not None
            or _num(row.get("evening_dbp")) is not None
        )
    ]
    half = len(data_with_readings) // 2
    first_half = data_with_readings[:half]
    second_half = data_with_readings[half:]

    def collect_sbp_dbp(rows: list[dict[str, Any]]) -> tuple[list[float], list[float]]:
        sbp_l: list[float] = []
        dbp_l: list[float] = []
        for row in rows:
            for key_sbp, key_dbp in (
                ("morning_sbp", "morning_dbp"),
                ("evening_sbp", "evening_dbp"),
            ):
                vs = _num(row.get(key_sbp))
                vd = _num(row.get(key_dbp))
                if vs is not None:
                    sbp_l.append(vs)
                if vd is not None:
                    dbp_l.append(vd)
        return sbp_l, dbp_l

    fh_sbp, fh_dbp = collect_sbp_dbp(first_half)
    sh_sbp, sh_dbp = collect_sbp_dbp(second_half)
    fh_sbp_m = _mean(fh_sbp)
    fh_dbp_m = _mean(fh_dbp)
    sh_sbp_m = _mean(sh_sbp)
    sh_dbp_m = _mean(sh_dbp)
    first_half_avg_sbp = _rnd1(fh_sbp_m) if fh_sbp_m is not None else None
    first_half_avg_dbp = _rnd1(fh_dbp_m) if fh_dbp_m is not None else None
    second_half_avg_sbp = _rnd1(sh_sbp_m) if sh_sbp_m is not None else None
    second_half_avg_dbp = _rnd1(sh_dbp_m) if sh_dbp_m is not None else None
    trend_sbp = (
        _rnd1(sh_sbp_m - fh_sbp_m)
        if fh_sbp_m is not None and sh_sbp_m is not None
        else None
    )
    trend_dbp = (
        _rnd1(sh_dbp_m - fh_dbp_m)
        if fh_dbp_m is not None and sh_dbp_m is not None
        else None
    )

    sbp_rows = [r for r in period_rows if r.get("avgSbp") is not None]
    dbp_rows = [r for r in period_rows if r.get("avgDbp") is not None]
    best_period_sbp = worst_period_sbp = None
    best_period_dbp = worst_period_dbp = None
    if sbp_rows:
        best = min(sbp_rows, key=lambda r: r["avgSbp"])
        worst = max(sbp_rows, key=lambda r: r["avgSbp"])
        best_period_sbp = {"label": best["label"], "value": _rnd1(best["avgSbp"])}
        worst_period_sbp = {"label": worst["label"], "value": _rnd1(worst["avgSbp"])}
    if dbp_rows:
        best = min(dbp_rows, key=lambda r: r["avgDbp"])
        worst = max(dbp_rows, key=lambda r: r["avgDbp"])
        best_period_dbp = {"label": best["label"], "value": _rnd1(best["avgDbp"])}
        worst_period_dbp = {"label": worst["label"], "value": _rnd1(worst["avgDbp"])}

    std_sbp = _std_dev_population(all_sbp)
    std_dbp = _std_dev_population(all_dbp)

    return {
        "totalReadings": total_readings,
        "highReadings": high_readings,
        "highZoneRatio": high_zone_ratio,
        "normalZoneRatio": normal_zone_ratio,
        "avgSbp": avg_sbp,
        "avgDbp": avg_dbp,
        "periodsWithData": periods_with_data_count,
        "periodsWithHigh": periods_with_high,
        "periodsAllInRange": periods_all_in_range,
        "pctPeriodsAllInRange": pct_periods_all_in_range,
        "measurementRatio": measurement_ratio,
        "daysInRange": days_in_range,
        "stdDevSbp": _rnd1(std_sbp) if std_sbp is not None else None,
        "stdDevDbp": _rnd1(std_dbp) if std_dbp is not None else None,
        "minSbp": _rnd1(min(all_sbp)) if all_sbp else None,
        "maxSbp": _rnd1(max(all_sbp)) if all_sbp else None,
        "minDbp": _rnd1(min(all_dbp)) if all_dbp else None,
        "maxDbp": _rnd1(max(all_dbp)) if all_dbp else None,
        "avgPulsePressure": avg_pulse_pressure,
        "minPulsePressure": _rnd1(min_pulse) if min_pulse is not None else None,
        "maxPulsePressure": _rnd1(max_pulse) if max_pulse is not None else None,
        "morningAvgSbp": morning_avg_sbp,
        "morningAvgDbp": morning_avg_dbp,
        "eveningAvgSbp": evening_avg_sbp,
        "eveningAvgDbp": evening_avg_dbp,
        "morningEveningDiffSbp": morning_evening_diff_sbp,
        "morningEveningDiffDbp": morning_evening_diff_dbp,
        "firstHalfAvgSbp": first_half_avg_sbp,
        "secondHalfAvgSbp": second_half_avg_sbp,
        "firstHalfAvgDbp": first_half_avg_dbp,
        "secondHalfAvgDbp": second_half_avg_dbp,
        "trendSbp": trend_sbp,
        "trendDbp": trend_dbp,
        "bestPeriodSbp": best_period_sbp,
        "worstPeriodSbp": worst_period_sbp,
        "bestPeriodDbp": best_period_dbp,
        "worstPeriodDbp": worst_period_dbp,
    }


def compute_overview_from_records(
    records: list[BPRecord], range_from: str, range_to: str
) -> dict[str, Any]:
    """Port of frontend computeOverviewFromRecords."""
    in_range = [r for r in records if range_from <= r.date.isoformat() <= range_to]
    days_in_range = max(1, _day_diff_days(range_from, range_to) + 1)
    if not in_range:
        return {
            "daysWithData": 0,
            "totalReadings": 0,
            "daysInRange": days_in_range,
            "measurementRatio": 0.0,
        }

    def has_any_reading(r: BPRecord) -> bool:
        return any(
            _num(getattr(r, k)) is not None
            for k in ("morning_sbp", "morning_dbp", "evening_sbp", "evening_dbp")
        )

    days_with_data = sum(1 for r in in_range if has_any_reading(r))
    total_readings = 0
    for r in in_range:
        hm = _num(r.morning_sbp) is not None or _num(r.morning_dbp) is not None
        he = _num(r.evening_sbp) is not None or _num(r.evening_dbp) is not None
        if hm:
            total_readings += 1
        if he:
            total_readings += 1
    measurement_ratio = (days_with_data / days_in_range * 100.0) if days_in_range > 0 else None
    return {
        "daysWithData": days_with_data,
        "totalReadings": total_readings,
        "daysInRange": days_in_range,
        "measurementRatio": measurement_ratio,
    }


def compute_measurement_habits(data: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Port of frontend computeMeasurementHabits."""
    if not data:
        return None

    def has_any_reading_row(row: dict[str, Any]) -> bool:
        return any(
            _num(row.get(k)) is not None
            for k in ("morning_sbp", "morning_dbp", "evening_sbp", "evening_dbp")
        )

    data_with_readings = [
        d for d in data if d.get("label") and _LABEL_DAY.match(str(d["label"])) and has_any_reading_row(d)
    ]
    dates = sorted(str(d["label"]) for d in data_with_readings)
    if not dates:
        return None

    max_consecutive = 1
    run = 1
    for i in range(1, len(dates)):
        diff = _day_diff_days(dates[i - 1], dates[i])
        if diff == 1:
            run += 1
        else:
            run = 1
        max_consecutive = max(max_consecutive, run)

    today_str = date.today().isoformat()
    last_date = dates[-1]
    last_to_today = _day_diff_days(last_date, today_str)
    current_streak = 0
    if last_to_today <= 1:
        current_streak = 1
        for i in range(len(dates) - 2, -1, -1):
            if _day_diff_days(dates[i], dates[i + 1]) == 1:
                current_streak += 1
            else:
                break

    by_day_of_week = [0] * 7
    readings_by_day_of_week = [0] * 7
    for d in data_with_readings:
        label = str(d["label"])
        wd = _js_weekday(date.fromisoformat(label[:10]))
        by_day_of_week[wd] += 1
        readings = 0
        if _num(d.get("morning_sbp")) is not None or _num(d.get("morning_dbp")) is not None:
            readings += 1
        if _num(d.get("evening_sbp")) is not None or _num(d.get("evening_dbp")) is not None:
            readings += 1
        readings_by_day_of_week[wd] += max(1, readings)

    by_month: dict[int, int] = {m: 0 for m in range(1, 13)}
    for label in dates:
        m = int(label[5:7])
        if 1 <= m <= 12:
            by_month[m] += 1

    longest_gap = 0
    for i in range(1, len(dates)):
        gap = _day_diff_days(dates[i - 1], dates[i]) - 1
        longest_gap = max(longest_gap, gap)

    day_of_week_counts = [
        {"name": WEEKDAY_NAMES[i], "count": by_day_of_week[i], "readings": readings_by_day_of_week[i]}
        for i in range(7)
    ]
    busiest_weekday = max(day_of_week_counts, key=lambda x: x["count"])
    month_counts = [
        {"month": m, "name": MONTH_NAMES[m - 1], "count": by_month[m]} for m in range(1, 13)
    ]
    busiest_month = max(month_counts, key=lambda x: x["count"])

    return {
        "maxConsecutiveDays": max_consecutive,
        "currentStreak": current_streak if current_streak > 0 else None,
        "byDayOfWeek": day_of_week_counts,
        "byMonth": month_counts,
        "longestGapDays": longest_gap if len(dates) > 1 else None,
        "busiestWeekday": busiest_weekday if busiest_weekday["count"] > 0 else None,
        "busiestMonth": busiest_month if busiest_month["count"] > 0 else None,
        "totalMeasurementDays": len(dates),
    }


def compute_device_stats(
    records: list[BPRecord], sbp_high: int, dbp_high: int
) -> list[dict[str, Any]]:
    """Port of frontend computeDeviceStats."""

    def has_any_reading(r: BPRecord) -> bool:
        return any(
            _num(getattr(r, k)) is not None
            for k in ("morning_sbp", "morning_dbp", "evening_sbp", "evening_dbp")
        )

    by_device: dict[str, dict[str, Any]] = {}
    for r in records:
        if not has_any_reading(r):
            continue
        dev = (r.device or "").strip() or "Unknown"
        if dev not in by_device:
            by_device[dev] = {
                "device": dev,
                "sbpSum": 0.0,
                "sbpCount": 0,
                "dbpSum": 0.0,
                "dbpCount": 0,
                "highReadings": 0,
                "recordCount": 0,
            }
        row = by_device[dev]
        row["recordCount"] += 1
        pairs = [
            (_num(r.morning_sbp), _num(r.morning_dbp)),
            (_num(r.evening_sbp), _num(r.evening_dbp)),
        ]
        for sbp, dbp in pairs:
            if sbp is not None:
                row["sbpSum"] += sbp
                row["sbpCount"] += 1
            if dbp is not None:
                row["dbpSum"] += dbp
                row["dbpCount"] += 1
            if sbp is not None and dbp is not None:
                if sbp >= sbp_high or dbp >= dbp_high:
                    row["highReadings"] += 1

    out: list[dict[str, Any]] = []
    for row in by_device.values():
        total_rc = row["sbpCount"] + row["dbpCount"]
        avg_sbp = (
            _rnd1(row["sbpSum"] / row["sbpCount"]) if row["sbpCount"] > 0 else None
        )
        avg_dbp = (
            _rnd1(row["dbpSum"] / row["dbpCount"]) if row["dbpCount"] > 0 else None
        )
        hz = round(row["highReadings"] / total_rc * 100) if total_rc > 0 else 0
        out.append(
            {
                "device": row["device"],
                "count": row["recordCount"],
                "readingCount": total_rc,
                "avgSbp": avg_sbp,
                "avgDbp": avg_dbp,
                "highReadings": row["highReadings"],
                "highZoneRatio": hz,
            }
        )
    return out


def compute_statistics(
    from_query: date | None,
    to_query: date | None,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """
    Single entry point: load range, thresholds, daily aggregates + records, return UI payload.

    When both from_query and to_query are None ("all data"), calendar metrics inside `stats`
    use daysInRange=None and measurementRatio=None like the former client behavior.
    """
    today = today or date.today()
    settings = get_settings()
    sbp_high = int(settings.get("sbp_high", 135) or 135)
    dbp_high = int(settings.get("dbp_high", 85) or 85)

    empty = {
        "hasData": False,
        "range": {"from": None, "to": None},
        "resolvedRange": None,
        "sbpHigh": sbp_high,
        "dbpHigh": dbp_high,
        "stats": None,
        "overview": None,
        "deviceStats": [],
        "habitStats": None,
    }

    all_records = get_all()
    if not all_records:
        return empty

    min_d = min(r.date for r in all_records)
    max_d = max(r.date for r in all_records)
    no_explicit_range = from_query is None and to_query is None

    from_date = from_query or min_d
    to_date = to_query or max(max_d, today)
    if from_date > to_date:
        return empty

    range_labels: tuple[str, str] | None = None
    if not no_explicit_range:
        range_labels = (from_date.isoformat(), to_date.isoformat())

    records = get_by_date_range(from_date, to_date)
    daily = aggregate(from_date, to_date, "day")
    if range_labels:
        daily = _filter_daily_to_range(daily, range_labels[0], range_labels[1])

    if not daily:
        return {
            **empty,
            "resolvedRange": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        }

    stats = compute_all_stats(daily, range_labels[0] if range_labels else None, range_labels[1] if range_labels else None, sbp_high, dbp_high)
    overview = (
        compute_overview_from_records(records, range_labels[0], range_labels[1])
        if range_labels
        else None
    )
    device_stats = compute_device_stats(records, sbp_high, dbp_high)
    habit_stats = compute_measurement_habits(daily)

    return {
        "hasData": stats is not None,
        "range": {
            "from": None if no_explicit_range else from_date.isoformat(),
            "to": None if no_explicit_range else to_date.isoformat(),
        },
        "resolvedRange": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "sbpHigh": sbp_high,
        "dbpHigh": dbp_high,
        "stats": stats,
        "overview": overview,
        "deviceStats": device_stats,
        "habitStats": habit_stats,
    }


def _stats_for_llm(
    stats: dict[str, Any] | None,
    sbp_high: int,
    dbp_high: int,
    resolved_from: date,
    resolved_to: date,
) -> dict[str, Any]:
    """Compact dict passed to LLM clients; aligned with `stats` from compute_all_stats."""
    if not stats:
        return {}
    days_in_range = stats.get("daysInRange")
    if days_in_range is None:
        days_in_range = _days_between_inclusive(resolved_from, resolved_to)
    return {
        "totalReadings": stats["totalReadings"],
        "highReadings": stats["highReadings"],
        "highZoneRatio": round(float(stats["highZoneRatio"]), 1),
        "normalZoneRatio": round(float(stats["normalZoneRatio"]), 1),
        "avgSbp": stats.get("avgSbp"),
        "avgDbp": stats.get("avgDbp"),
        "periodsWithData": stats["periodsWithData"],
        "periodsWithHigh": stats["periodsWithHigh"],
        "periodsAllInRange": stats["periodsAllInRange"],
        "pctPeriodsAllInRange": round(float(stats["pctPeriodsAllInRange"]), 1),
        "daysInRange": days_in_range,
        "minSbp": stats.get("minSbp"),
        "maxSbp": stats.get("maxSbp"),
        "minDbp": stats.get("minDbp"),
        "maxDbp": stats.get("maxDbp"),
        "sbpHighThreshold": sbp_high,
        "dbpHighThreshold": dbp_high,
    }


def compute_insight_stats(from_date: date | None, to_date: date | None) -> dict[str, Any]:
    """Subset of statistics for LLM prompts; uses same computation as the Statistics page."""
    payload = compute_statistics(from_date, to_date)
    st = payload.get("stats")
    if not st:
        return {}
    rr = payload.get("resolvedRange") or {}
    rf = date.fromisoformat(rr["from"]) if rr.get("from") else date.today()
    rt = date.fromisoformat(rr["to"]) if rr.get("to") else date.today()
    return _stats_for_llm(st, payload["sbpHigh"], payload["dbpHigh"], rf, rt)
