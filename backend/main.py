"""FastAPI application for BP-Track-Pi."""

import logging
import tempfile
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .aggregation import aggregate
from .backup import run_backup, run_backup_to
from .badges import compute_badges
from .migration import run_import
from .models import BPRecord, BPRecordCreate, ReportRequest
from .pdf_report import build_report
from .settings import get_settings, save_settings
from .storage import _load_raw, delete, get_all, get_by_date, get_by_date_range, replace_all, upsert

logger = logging.getLogger(__name__)
_scheduler = None
_last_backup = {"success": None, "message": None}


def _scheduled_backup():
    global _last_backup
    success, msg = run_backup()
    _last_backup = {"success": success, "message": msg}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_scheduled_backup, "cron", hour=2, minute=0)  # 02:00 daily
    _scheduler.start()
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="BP-Track-Pi", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/records")
def list_records(
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
):
    """List records, optionally filtered by date range."""
    if from_date is not None and to_date is not None:
        if from_date > to_date:
            raise HTTPException(400, "from must be <= to")
        records = get_by_date_range(from_date, to_date)
    else:
        records = get_all()
    return [r.model_dump(mode="json") for r in records]


@app.get("/api/records/{record_date}")
def get_record(record_date: date):
    """Get a single record by date."""
    record = get_by_date(record_date)
    if record is None:
        raise HTTPException(404, "Record not found")
    return record.model_dump(mode="json")


@app.post("/api/records")
def create_record(
    background_tasks: BackgroundTasks,
    payload: BPRecordCreate,
    record_date: date | None = Query(None, alias="date"),
):
    """Create a record. If date is omitted, today is used. Triggers email backup to configured address."""
    d = record_date or date.today()
    existing = get_by_date(d)
    if existing is not None:
        raise HTTPException(409, "Record for this date already exists; use PUT to update")
    record = BPRecord(
        date=d,
        morning_sbp=payload.morning_sbp,
        morning_dbp=payload.morning_dbp,
        evening_sbp=payload.evening_sbp,
        evening_dbp=payload.evening_dbp,
        note=payload.note or "",
        device=payload.device or None,
    )
    upsert(record)
    settings = get_settings()
    if settings.get("auto_backup_enabled") and settings.get("receiver_email"):
        background_tasks.add_task(run_backup_to, settings["receiver_email"])
    return record.model_dump(mode="json")


@app.put("/api/records/{record_date}")
def update_record(
    background_tasks: BackgroundTasks,
    record_date: date,
    payload: BPRecordCreate,
):
    """Update an existing record by date. Triggers email backup to configured address."""
    record = BPRecord(
        date=record_date,
        morning_sbp=payload.morning_sbp,
        morning_dbp=payload.morning_dbp,
        evening_sbp=payload.evening_sbp,
        evening_dbp=payload.evening_dbp,
        note=payload.note or "",
        device=payload.device or None,
    )
    upsert(record)
    settings = get_settings()
    if settings.get("auto_backup_enabled") and settings.get("receiver_email"):
        background_tasks.add_task(run_backup_to, settings["receiver_email"])
    return record.model_dump(mode="json")


@app.delete("/api/records/{record_date}")
def remove_record(record_date: date):
    """Delete the record for the given date."""
    if not delete(record_date):
        raise HTTPException(404, "Record not found")
    return {"ok": True}


@app.get("/api/badges")
def get_badges():
    """Return computed badges (streaks, milestones)."""
    return compute_badges()


@app.get("/api/aggregated")
def get_aggregated(
    period: str = Query("month", description="day | week | month | quarter | year"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
):
    """Aggregated series for charts. When from/to omitted, use full range of stored records."""
    if period not in ("day", "week", "month", "quarter", "year"):
        raise HTTPException(400, "period must be day, week, month, quarter, or year")
    today = date.today()
    if from_date is None or to_date is None:
        all_records = get_all()
        if not all_records:
            return []
        min_d = min(r.date for r in all_records)
        max_d = max(r.date for r in all_records)
        if from_date is None:
            from_date = min_d
        if to_date is None:
            to_date = max(max_d, today)
    if from_date > to_date:
        raise HTTPException(400, "from must be <= to")
    return aggregate(from_date, to_date, period)


@app.post("/api/reports/pdf")
def report_pdf(body: ReportRequest):
    """Generate PDF report for date range."""
    if body.from_date > body.to_date:
        raise HTTPException(400, "from must be <= to")
    pdf_bytes = build_report(body.from_date, body.to_date)
    filename = f"bp-report-{body.from_date.isoformat()}-to-{body.to_date.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/import")
async def import_excel(
    file: UploadFile,
    strategy: str = Query("import_wins", description="import_wins | keep_existing"),
):
    """One-time import from Excel. Skips rows containing 'Week average'."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Upload an Excel file (.xlsx or .xls)")
    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename).suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            n = run_import(tmp_path, merge_strategy=strategy)
            return {"imported": n, "message": f"Imported {n} records."}
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except FileNotFoundError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/backup/status")
def backup_status():
    """Return last backup result (for cron or manual trigger)."""
    return _last_backup


@app.get("/api/settings")
def api_get_settings():
    """Return system settings (receiver_email, auto_backup_enabled)."""
    return get_settings()


@app.put("/api/settings")
def api_put_settings(body: dict):
    """Update settings. Body: { receiver_email?, auto_backup_enabled?, devices?, sbp_high?, dbp_high? }."""
    receiver_email = body.get("receiver_email") if "receiver_email" in body else None
    auto_backup_enabled = body.get("auto_backup_enabled") if "auto_backup_enabled" in body else None
    devices = body.get("devices") if "devices" in body else None
    sbp_high = body.get("sbp_high") if "sbp_high" in body else None
    dbp_high = body.get("dbp_high") if "dbp_high" in body else None
    updated = save_settings(
        receiver_email=receiver_email,
        auto_backup_enabled=auto_backup_enabled,
        devices=devices,
        sbp_high=sbp_high,
        dbp_high=dbp_high,
    )
    return updated


@app.get("/api/export")
def export_data():
    """Return full data (records + meta + settings) for download."""
    data = dict(_load_raw())
    data["settings"] = get_settings()
    return data


@app.post("/api/backup/send-email")
def backup_send_email():
    """Send current data as email to the configured receiver address."""
    settings = get_settings()
    to_email = (settings.get("receiver_email") or "").strip()
    if not to_email:
        raise HTTPException(400, "Set receiver email in Admin settings first.")
    success, message = run_backup_to(to_email)
    return {"success": success, "message": message}


@app.post("/api/backup/run")
def trigger_backup():
    """Run backup now (e.g. from cron). Returns success and message."""
    success, message = run_backup()
    global _last_backup
    _last_backup = {"success": success, "message": message}
    return {"success": success, "message": message}


@app.post("/api/restore")
def restore(body: dict):
    """
    Replace all records (and optionally settings) with the provided JSON.
    Body must have "records" (array). Optional "settings" restores system settings (e.g. devices).
    """
    if "records" not in body:
        raise HTTPException(400, "Body must contain 'records' array")
    try:
        replace_all(body)
        msg = f"Restored {len(body['records'])} records."
        if "settings" in body and isinstance(body["settings"], dict):
            s = body["settings"]
            opts = {}
            if "receiver_email" in s:
                opts["receiver_email"] = s["receiver_email"]
            if "auto_backup_enabled" in s:
                opts["auto_backup_enabled"] = s["auto_backup_enabled"]
            if "devices" in s:
                opts["devices"] = s["devices"]
            if "sbp_high" in s:
                opts["sbp_high"] = s["sbp_high"]
            if "dbp_high" in s:
                opts["dbp_high"] = s["dbp_high"]
            if opts:
                save_settings(**opts)
                msg += " Settings restored."
        return {"ok": True, "message": msg}
    except ValueError as e:
        raise HTTPException(400, str(e))


# Serve frontend static build when present (e.g. production / Raspberry Pi)
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist.parent, html=True), name="frontend")
