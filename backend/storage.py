"""JSON storage layer with atomic writes for BP records."""

import json
import os
from datetime import date
from pathlib import Path
from typing import Optional

from .models import BPRecord

# Default path: project root / data.json
DATA_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = DATA_DIR / "data.json"
TMP_SUFFIX = ".tmp"


def _default_data() -> dict:
    return {"records": [], "meta": {"last_updated": None, "version": 1}}


def _ensure_file() -> None:
    """Create data.json with default structure if it doesn't exist."""
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_FILE, "w") as f:
            json.dump(_default_data(), f, indent=2)


def _load_raw() -> dict:
    _ensure_file()
    with open(DATA_FILE) as f:
        return json.load(f)


def _save_raw(data: dict) -> None:
    tmp_path = DATA_FILE.with_suffix(DATA_FILE.suffix + TMP_SUFFIX)
    with open(tmp_path, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, DATA_FILE)


def _record_to_dict(r: BPRecord) -> dict:
    return {
        "date": r.date.isoformat(),
        "morning_sbp": r.morning_sbp,
        "morning_dbp": r.morning_dbp,
        "evening_sbp": r.evening_sbp,
        "evening_dbp": r.evening_dbp,
        "note": r.note or "",
        "device": r.device if r.device else None,
    }


def _normalize_note(note) -> str:
    """Return note string; treat 'nan' (case-insensitive) as empty."""
    s = (note if isinstance(note, str) else str(note or "")).strip()
    return "" if s.lower() == "nan" else s


def _dict_to_record(d: dict) -> BPRecord:
    dev = d.get("device")
    if isinstance(dev, str) and dev.strip():
        dev = dev.strip()
    else:
        dev = None
    return BPRecord(
        date=date.fromisoformat(d["date"]),
        morning_sbp=d.get("morning_sbp"),
        morning_dbp=d.get("morning_dbp"),
        evening_sbp=d.get("evening_sbp"),
        evening_dbp=d.get("evening_dbp"),
        note=_normalize_note(d.get("note", "")),
        device=dev,
    )


def get_all() -> list[BPRecord]:
    """Return all records (order preserved from file)."""
    data = _load_raw()
    return [_dict_to_record(r) for r in data.get("records", [])]


def get_by_date(d: date) -> Optional[BPRecord]:
    """Return the record for the given date, or None."""
    data = _load_raw()
    records = data.get("records", [])
    for r in records:
        if r.get("date") == d.isoformat():
            return _dict_to_record(r)
    return None


def get_by_date_range(start: date, end: date) -> list[BPRecord]:
    """Return records with date in [start, end], sorted by date."""
    data = _load_raw()
    out = []
    for r in data.get("records", []):
        rd = date.fromisoformat(r["date"])
        if start <= rd <= end:
            out.append(_dict_to_record(r))
    out.sort(key=lambda x: x.date)
    return out


def upsert(record: BPRecord) -> None:
    """Insert or update record by date. Atomic write."""
    data = _load_raw()
    records = data.get("records", [])
    key = record.date.isoformat()
    new_row = _record_to_dict(record)
    found = False
    for i, r in enumerate(records):
        if r.get("date") == key:
            records[i] = new_row
            found = True
            break
    if not found:
        records.append(new_row)
    records.sort(key=lambda x: x["date"])
    data["records"] = records
    from datetime import datetime
    data["meta"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    _save_raw(data)


def delete(d: date) -> bool:
    """Remove record for date. Return True if removed."""
    data = _load_raw()
    records = data.get("records", [])
    key = d.isoformat()
    new_records = [r for r in records if r.get("date") != key]
    if len(new_records) == len(records):
        return False
    data["records"] = new_records
    from datetime import datetime
    data["meta"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    _save_raw(data)
    return True


def replace_all(data: dict) -> None:
    """
    Replace entire storage with the given data (e.g. from restore).
    data must have "records" (list of record dicts with "date", etc.) and optionally "meta".
    """
    if not isinstance(data.get("records"), list):
        raise ValueError("data must contain 'records' array")
    from datetime import datetime
    normalized = []
    for r in data["records"]:
        if not isinstance(r, dict) or "date" not in r:
            raise ValueError(f"Each record must have 'date'; got {type(r)}")
        dev = r.get("device")
        if isinstance(dev, str) and dev.strip():
            dev = dev.strip()
        else:
            dev = None
        normalized.append({
            "date": r["date"],
            "morning_sbp": r.get("morning_sbp"),
            "morning_dbp": r.get("morning_dbp"),
            "evening_sbp": r.get("evening_sbp"),
            "evening_dbp": r.get("evening_dbp"),
            "note": _normalize_note(r.get("note", "")) if r.get("note") else "",
            "device": dev,
        })
    normalized.sort(key=lambda x: x["date"])
    out = {
        "records": normalized,
        "meta": data.get("meta") or {},
    }
    if "last_updated" not in out["meta"]:
        out["meta"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    if "version" not in out["meta"]:
        out["meta"]["version"] = 1
    _save_raw(out)
