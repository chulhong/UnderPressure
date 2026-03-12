"""System settings (receiver email, auto backup). Stored in settings.json."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

SETTINGS_FILE = Path(__file__).resolve().parent.parent / "settings.json"

_DEFAULTS = {
    "receiver_email": os.getenv("RECEIVER_EMAIL", "").strip() or "",
    "auto_backup_enabled": True,
    "devices": [],
    "sbp_high": 135,
    "dbp_high": 85,
}


def _int_setting(value, default: int, lo: int, hi: int) -> int:
    """Coerce value to int in [lo, hi], else default."""
    if value is None:
        return default
    try:
        n = int(value)
        return max(lo, min(hi, n))
    except (TypeError, ValueError):
        return default


def get_settings() -> dict:
    """Return current settings (receiver_email, auto_backup_enabled, devices, sbp_high, dbp_high)."""
    if not SETTINGS_FILE.exists():
        return dict(_DEFAULTS)
    try:
        with open(SETTINGS_FILE) as f:
            data = json.load(f)
        devices = data.get("devices")
        if not isinstance(devices, list):
            devices = []
        devices = [str(d).strip() for d in devices if d and str(d).strip()]
        return {
            "receiver_email": (data.get("receiver_email") or "").strip(),
            "auto_backup_enabled": data.get("auto_backup_enabled", _DEFAULTS["auto_backup_enabled"]),
            "devices": devices,
            "sbp_high": _int_setting(data.get("sbp_high"), _DEFAULTS["sbp_high"], 90, 200),
            "dbp_high": _int_setting(data.get("dbp_high"), _DEFAULTS["dbp_high"], 60, 120),
        }
    except (json.JSONDecodeError, OSError):
        return dict(_DEFAULTS)


def save_settings(
    receiver_email: str | None = None,
    auto_backup_enabled: bool | None = None,
    devices: list | None = None,
    sbp_high: int | None = None,
    dbp_high: int | None = None,
) -> dict:
    """Update and persist settings. None means leave unchanged. Returns new settings."""
    current = get_settings()
    if receiver_email is not None:
        current["receiver_email"] = (receiver_email or "").strip()
    if auto_backup_enabled is not None:
        current["auto_backup_enabled"] = bool(auto_backup_enabled)
    if devices is not None:
        current["devices"] = [str(d).strip() for d in devices if d and str(d).strip()]
    if sbp_high is not None:
        current["sbp_high"] = _int_setting(sbp_high, current["sbp_high"], 90, 200)
    if dbp_high is not None:
        current["dbp_high"] = _int_setting(dbp_high, current["dbp_high"], 60, 120)
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(current, f, indent=2)
    return current
