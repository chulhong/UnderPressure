"""Canonical export payload: records + meta + settings. Used by download, send-to-email, and automatic backup."""

from .settings import get_settings
from .storage import _load_raw


def get_export_payload() -> dict:
    """
    Return the full export payload (records, meta, settings).
    Same structure for: Download JSON, Send to email, and Automatic email backup.
    """
    data = dict(_load_raw())
    data["settings"] = get_settings()
    return data
