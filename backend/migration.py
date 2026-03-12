"""One-time Excel import into data.json. Reads all sheets; skips rows containing 'Week average'."""

import sys
from datetime import date as date_type
from pathlib import Path

import pandas as pd

# Import cutoff: records with date > today are skipped (no future dates).
def _sanitize_date(d: date_type) -> date_type | None:
    """Correct obvious year typos (e.g. 2924 -> 2024) and return None if in the future."""
    if d is None:
        return None
    year = d.year
    # 29xx typo: treat as 20xx (e.g. 2924 -> 2024)
    if 2900 <= year <= 2999:
        d = d.replace(year=2000 + (year % 100))
    today = date_type.today()
    if d > today:
        return None  # skip future dates
    return d

# Add parent so we can import from backend
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.storage import _load_raw, _save_raw


# Expected column names (flexible: allow different casing/spacing)
COL_DATE = "date"
COL_MORNING_SBP = "morning_sbp"
COL_MORNING_DBP = "morning_dbp"
COL_EVENING_SBP = "evening_sbp"
COL_EVENING_DBP = "evening_dbp"
COL_NOTE = "note"

# Aliases for Excel headers (first row). Order: date first, then note last, BP in between.
COLUMN_ALIASES = {
    "date": [COL_DATE, "Date", "DATE", "Datum", "날짜", "日付"],
    "morning_sbp": [
        COL_MORNING_SBP, "morning_sbp", "Morning SBP", "morning sbp", "AM SBP", "오전 SBP",
        "오전 수축기", "Morning Systolic", "AM Systolic", "SBP (AM)", "수축기(오전)",
    ],
    "morning_dbp": [
        COL_MORNING_DBP, "morning_dbp", "Morning DBP", "morning dbp", "AM DBP", "오전 DBP",
        "오전 이완기", "Morning Diastolic", "AM Diastolic", "DBP (AM)", "이완기(오전)",
    ],
    "evening_sbp": [
        COL_EVENING_SBP, "evening_sbp", "Evening SBP", "evening sbp", "PM SBP", "오후 SBP",
        "오후 수축기", "Evening Systolic", "PM Systolic", "SBP (PM)", "수축기(오후)",
    ],
    "evening_dbp": [
        COL_EVENING_DBP, "evening_dbp", "Evening DBP", "evening dbp", "PM DBP", "오후 DBP",
        "오후 이완기", "Evening Diastolic", "PM Diastolic", "DBP (PM)", "이완기(오후)",
    ],
    "note": [COL_NOTE, "Note", "note", "NOTE", "Memo", "메모", "備考", "Remarks"],
}


def _normalized_header(s: str) -> str:
    """Lowercase, strip, collapse spaces for matching."""
    return " ".join(str(s).strip().lower().split())


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map Excel columns to canonical names. Uses exact alias match, then normalized match, then keyword."""
    col_map = {}
    used = set()
    for c in df.columns:
        c_str = str(c).strip()
        c_norm = _normalized_header(c_str)
        matched = False
        for key, aliases in COLUMN_ALIASES.items():
            if key in used:
                continue
            if c_str in aliases or c_norm == key.lower():
                col_map[c] = key
                used.add(key)
                matched = True
                break
        if matched:
            continue
        # Fuzzy: normalized name contains the key (e.g. "date" in "measurement date")
        for key, aliases in COLUMN_ALIASES.items():
            if key in used:
                continue
            if key in c_norm or c_norm in (a.lower() for a in aliases):
                col_map[c] = key
                used.add(key)
                break
    df = df.rename(columns=col_map)
    return df


def _skip_week_average(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows where first column contains 'Week average' (case-insensitive)."""
    if df.empty:
        return df
    first_col = df.iloc[:, 0].astype(str)
    mask = first_col.str.contains("Week average", case=False, na=False)
    return df.loc[~mask].copy()


def _safe_int(val) -> int | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _apply_positional_bp_fallback(df: pd.DataFrame) -> pd.DataFrame:
    """
    If date (and optionally note) are present but BP columns are not mapped by name,
    map columns by position: after date, assume order is morning_sbp, morning_dbp, evening_sbp, evening_dbp, then note.
    """
    needed = [COL_MORNING_SBP, COL_MORNING_DBP, COL_EVENING_SBP, COL_EVENING_DBP]
    if all(c in df.columns for c in needed):
        return df
    if COL_DATE not in df.columns:
        return df
    # Get column list; date and note might be anywhere by name, rest by position
    cols = list(df.columns)
    # Indices of date and note
    date_idx = cols.index(COL_DATE) if COL_DATE in cols else None
    note_idx = cols.index(COL_NOTE) if COL_NOTE in cols else None
    # Other indices (candidates for BP) in order
    other_idxs = [i for i in range(len(cols)) if i != date_idx and i != note_idx]
    # We need 4 BP columns; assign first 4 non-date, non-note columns in order
    if len(other_idxs) >= 4:
        for j, key in enumerate(needed):
            if key not in df.columns:
                df[key] = df.iloc[:, other_idxs[j]]
    return df


def _process_sheet_to_dataframe(df: pd.DataFrame) -> pd.DataFrame | None:
    """
    Normalize columns, skip 'Week average' rows, ensure date column.
    Returns a dataframe with canonical columns or None if sheet has no date column.
    """
    if df.empty or len(df.columns) == 0:
        return None
    df = _normalize_columns(df.copy())
    df = _skip_week_average(df)
    if df.empty:
        return None
    if COL_DATE not in df.columns:
        first_col = df.columns[0]
        try:
            parsed = pd.to_datetime(df[first_col], errors="coerce")
            if parsed.notna().any():
                df = df.rename(columns={first_col: COL_DATE})
            else:
                return None
        except Exception:
            return None
    df[COL_DATE] = pd.to_datetime(df[COL_DATE], errors="coerce").dt.date
    df = df.dropna(subset=[COL_DATE])
    if df.empty:
        return None
    df = _apply_positional_bp_fallback(df)
    return df


def run_import(excel_path: str | Path, merge_strategy: str = "import_wins") -> int:
    """
    Import Excel into data.json. Reads all sheets in the workbook.
    merge_strategy: 'import_wins' = overwrite existing dates; 'keep_existing' = skip if date exists.
    Returns number of records written.
    """
    path = Path(excel_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    data = _load_raw()
    records = list(data.get("records", []))
    existing_dates = {r["date"] for r in records}
    by_date = {r["date"]: r for r in records}
    count = 0

    with pd.ExcelFile(path, engine="openpyxl") as xl:
        sheet_names = xl.sheet_names
        for sheet_name in sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet_name)
            processed = _process_sheet_to_dataframe(df)
            if processed is None:
                continue
            for _, row in processed.iterrows():
                d = row[COL_DATE]
                if not isinstance(d, date_type):
                    try:
                        d = pd.Timestamp(d).date()
                    except Exception:
                        continue
                d = _sanitize_date(d)
                if d is None:
                    continue  # skip future dates or invalid
                key = d.isoformat()
                if merge_strategy == "keep_existing" and key in existing_dates:
                    continue
                morning_sbp = _safe_int(row.get(COL_MORNING_SBP))
                morning_dbp = _safe_int(row.get(COL_MORNING_DBP))
                evening_sbp = _safe_int(row.get(COL_EVENING_SBP))
                evening_dbp = _safe_int(row.get(COL_EVENING_DBP))
                note = _normalize_note_for_import(row.get(COL_NOTE, ""))
                rec = {
                    "date": key,
                    "morning_sbp": morning_sbp,
                    "morning_dbp": morning_dbp,
                    "evening_sbp": evening_sbp,
                    "evening_dbp": evening_dbp,
                    "note": note,
                }
                by_date[key] = rec
                count += 1
            existing_dates = set(by_date.keys())

    new_records = sorted(by_date.values(), key=lambda x: x["date"])
    data["records"] = new_records
    from datetime import datetime
    data["meta"] = data.get("meta", {})
    data["meta"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    data["meta"]["version"] = data["meta"].get("version", 1)
    _save_raw(data)
    return count


def _normalize_note_for_import(note) -> str:
    """Treat 'nan' (case-insensitive) as empty."""
    s = str(note or "").strip()
    return "" if s.lower() == "nan" else s


def run_cleanup() -> dict:
    """
    Fix existing data.json: correct 29xx year typos to 20xx, remove future-dated records,
    and clear 'nan' from note fields. Returns counts { date_fixed, future_removed, note_cleaned }.
    """
    from datetime import datetime

    data = _load_raw()
    records = list(data.get("records", []))
    today = date_type.today()
    stats = {"date_fixed": 0, "future_removed": 0, "note_cleaned": 0}
    by_date = {}

    for r in records:
        try:
            d = date_type.fromisoformat(r["date"])
        except (ValueError, TypeError):
            continue
        # Fix 29xx -> 20xx
        if 2900 <= d.year <= 2999:
            d = d.replace(year=2000 + (d.year % 100))
            stats["date_fixed"] += 1
            r = {**r, "date": d.isoformat()}
        # Skip future
        if d > today:
            stats["future_removed"] += 1
            continue
        note = _normalize_note_for_import(r.get("note", ""))
        if (r.get("note") or "").strip().lower() == "nan" and note == "":
            stats["note_cleaned"] += 1
        r["note"] = note
        by_date[r["date"]] = r

    data["records"] = sorted(by_date.values(), key=lambda x: x["date"])
    data["meta"] = data.get("meta", {})
    data["meta"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    data["meta"]["version"] = data["meta"].get("version", 1)
    _save_raw(data)
    return stats


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m backend.migration <path_to_excel.xlsx> [import_wins|keep_existing]")
        print("       python -m backend.migration --cleanup   # fix existing data (29xx, future dates, nan notes)")
        sys.exit(1)
    if sys.argv[1] == "--cleanup":
        stats = run_cleanup()
        print(f"Cleanup done: date typos fixed={stats['date_fixed']}, future removed={stats['future_removed']}, notes cleared={stats['note_cleaned']}")
        sys.exit(0)
    excel_path = sys.argv[1]
    strategy = sys.argv[2] if len(sys.argv) > 2 else "import_wins"
    n = run_import(excel_path, merge_strategy=strategy)
    print(f"Imported {n} records into data.json.")


if __name__ == "__main__":
    main()
