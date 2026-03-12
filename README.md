# BP-Track-Pi

Lightweight blood pressure tracking web app for Raspberry Pi (or any host). Log morning/evening readings, view trends, earn badges, and export PDF reports.

## Features

- **Log**: Morning and evening SBP/DBP (40–250 mmHg) with optional notes
- **History**: View, edit, and delete past entries
- **Dashboard**: Weekly, monthly, quarterly, yearly trend charts with high-BP zones (SBP > 135, DBP > 85)
- **Badges**: Streaks, first-of-month, and entry milestones (10, 50, 100, 250)
- **PDF report**: Date-range report with summary table and trend chart (doctor-friendly)
- **Backup**: Daily email backup of `data.json` via SMTP (configurable)
- **Import**: One-time Excel import; rows containing "Week average" are skipped

## Tech Stack

- **Backend**: Python, FastAPI, JSON file (`data.json`)
- **Frontend**: React, Vite, Tailwind CSS, Recharts
- **PDF**: ReportLab

## Quick Start

### Virtual environment (.venv)

Create and use a virtual environment so the Python app runs in isolation:

```bash
# From project root
python3 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

Then run the backend with `python run.py` (see below). The migration script and any other Python commands should be run with the same activated `.venv` so they use the same interpreter and dependencies.

### Development

1. **Backend** (from project root, with `.venv` activated):
   ```bash
   python run.py
   ```
   API: http://127.0.0.1:8000

2. **Frontend** (separate terminal):
   ```bash
   cd frontend && npm install && npm run dev
   ```
   App: http://localhost:5173 (proxies `/api` to backend)

### Production (e.g. Raspberry Pi)

1. Copy `backend/.env.example` to `backend/.env` and set SMTP vars for backup (optional).
2. Create and activate `.venv`, install dependencies, then build frontend and run:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r backend/requirements.txt
   cd frontend && npm run build && cd ..
   python run.py
   ```
   Open http://&lt;host&gt;:8000 — backend serves the built frontend.

### Docker

```bash
# Build (includes frontend build in multi-stage Dockerfile)
docker compose up --build
```

Data is stored in `./data.json`; mount it as in `docker-compose.yml` to persist.

## Excel Import

Columns: `date`, `morning_sbp`, `morning_dbp`, `evening_sbp`, `evening_dbp`, `note`. Rows whose first column contains "Week average" are skipped.

- **CLI** (with `.venv` activated): `python -m backend.migration path/to/file.xlsx [import_wins|keep_existing]`
- **API**: `POST /api/import` with multipart file and query `strategy=import_wins|keep_existing`

## Backup

- Daily at 02:00 (APScheduler), or trigger via `POST /api/backup/run`
- Status: `GET /api/backup/status`
- Configure in `backend/.env`: `SMTP_SERVER`, `SMTP_PORT`, `SENDER_EMAIL`, `RECEIVER_EMAIL`, `PASSWORD`

## API Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/records | List records (optional `?from=&to=`) |
| GET | /api/records/{date} | Get one record |
| POST | /api/records | Create (body + optional `?date=`) |
| PUT | /api/records/{date} | Update |
| DELETE | /api/records/{date} | Delete |
| GET | /api/badges | Badges (streaks, milestones) |
| GET | /api/aggregated | Trend data (`?period=week|month|quarter|year&from=&to=`) |
| POST | /api/reports/pdf | PDF report (body: `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}`) |
| POST | /api/import | Excel upload |
| GET/POST | /api/backup/status, /api/backup/run | Backup status and manual run |

## Data

All data lives in `data.json` at project root. Structure:

```json
{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "morning_sbp": 120,
      "morning_dbp": 80,
      "evening_sbp": 118,
      "evening_dbp": 78,
      "note": ""
    }
  ],
  "meta": { "last_updated": "ISO8601", "version": 1 }
}
```

Writes are atomic (temp file + rename) to avoid corruption.
