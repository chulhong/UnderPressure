"""Daily email backup: send data.json to user via SMTP."""

import json
import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv
import os

from .settings import get_settings
from .storage import _load_raw

load_dotenv()

logger = logging.getLogger(__name__)


def get_smtp_config():
    return {
        "server": os.getenv("SMTP_SERVER", "").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "sender": os.getenv("SENDER_EMAIL", "").strip(),
        "receiver": os.getenv("RECEIVER_EMAIL", "").strip(),
        "password": os.getenv("PASSWORD", "").strip(),
    }


def run_backup_to(receiver_email: str | None = None) -> tuple[bool, str]:
    """
    Send data.json as email attachment via SMTP.
    If receiver_email is given, send to that address; otherwise use RECEIVER_EMAIL from config.
    Returns (success, message).
    """
    cfg = get_smtp_config()
    to_email = (receiver_email or cfg["receiver"] or "").strip()
    if not cfg["server"] or not cfg["sender"]:
        msg = "Email backup skipped: SMTP_SERVER, SENDER_EMAIL must be set in .env"
        logger.warning(msg)
        return False, msg
    if not to_email:
        msg = "Email backup skipped: no receiver (set RECEIVER_EMAIL in .env or pass receiver_email)"
        logger.warning(msg)
        return False, msg

    try:
        # Same shape as /api/export: records + meta + settings (so auto_backup_enabled etc. are in the attachment)
        data = dict(_load_raw())
        data["settings"] = get_settings()
        data_bytes = json.dumps(data, indent=2).encode("utf-8")
    except OSError as e:
        logger.exception("Failed to read data for backup")
        return False, str(e)

    msg = MIMEMultipart()
    msg["Subject"] = "BP-Track-Pi backup"
    msg["From"] = cfg["sender"]
    msg["To"] = to_email
    msg.attach(MIMEText("Backup of all records (data.json) attached.", "plain"))
    part = MIMEApplication(data_bytes, Name="data.json")
    part["Content-Disposition"] = "attachment; filename=data.json"
    msg.attach(part)

    try:
        with smtplib.SMTP(cfg["server"], cfg["port"]) as smtp:
            smtp.starttls()
            if cfg["password"]:
                smtp.login(cfg["sender"], cfg["password"])
            smtp.sendmail(cfg["sender"], [to_email], msg.as_string())
        logger.info("Backup email sent to %s", to_email)
        return True, "Backup email sent."
    except Exception as e:
        logger.exception("Backup email failed")
        return False, str(e)


def run_backup() -> tuple[bool, str]:
    """Send data.json to RECEIVER_EMAIL (for scheduled backup)."""
    return run_backup_to(None)
