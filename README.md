# UnderPressure

Lightweight blood pressure tracking web app for Raspberry Pi (or any host). Log morning/evening readings, view trends, earn badges, optional AI insights, and export PDF reports.

## Features

- **Log**: Morning and evening SBP/DBP (40–250 mmHg) with optional notes
- **History**: View, edit, and delete past entries
- **Dashboard**: Weekly, monthly, quarterly, yearly trend charts with high-BP zones (SBP ≥ 135, DBP ≥ 85, configurable in Admin)
- **Statistics**: Aggregated stats, morning vs evening, trends, device breakdown, measurement habits
- **AI insights**: Optional LLM-generated summary of your BP data (Statistics page). Choose target language (English/Korean), refresh on demand, and use a copyable prompt for external LLM services; raw measurement data is included in the prompt for week/month/quarter ranges when length allows
- **Badges**: Streaks, first-of-month, and entry milestones (10, 50, 100, 250)
- **PDF report**: Date-range report with summary table and trend chart (doctor-friendly)
- **Backup**: Daily email backup of `data.json` via SMTP (configurable)
- **Import**: One-time Excel import; rows containing "Week average" are skipped
- **Export/restore**: Full backup JSON includes records, meta, and settings (including LLM configuration)

## Tech Stack

- **Backend**: Python, FastAPI, JSON file (`data.json`), optional LLM (Google Gemini via `google-genai`)
- **Frontend**: React, Vite, Tailwind CSS, Recharts
- **PDF**: ReportLab

## Quick Start

### Virtual environment (.venv)

Use a virtual environment at the project root named **`.venv`** for all Python work (backend, migration CLI, tests). Do not rely on the system Python for project dependencies.

```bash
# From project root — create once
python3 -m venv .venv

# Install dependencies (paths below avoid needing `activate` first)
.venv/bin/pip install -r backend/requirements.txt
# Windows: .venv\Scripts\pip install -r backend\requirements.txt
```

Optional: `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`) and then use `pip` / `python` as usual.

`run.py` re-executes with `.venv`’s interpreter when `.venv` exists, so `python3 run.py` still picks up the venv for the server. For **any other** Python command (e.g. migration), call `.venv/bin/python` explicitly or activate the venv first.

### Development

1. **Backend** (from project root):
   ```bash
   .venv/bin/python run.py
   ```
   (Or: activate `.venv`, then `python run.py`.)
   API: http://127.0.0.1:8000

2. **Frontend** (separate terminal):
   ```bash
   cd frontend && npm install && npm run dev
   ```
   App: http://localhost:5173 (proxies `/api` to backend)

### Production (e.g. Raspberry Pi)

1. Copy `backend/.env.example` to `backend/.env` and set SMTP vars for backup (optional). For AI insights, set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, `LLM_PROVIDER=gemini`); enable and choose provider/model in **Admin → System settings → AI / LLM settings**.
2. Create `.venv`, install Python deps, build frontend, then run:
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r backend/requirements.txt
   cd frontend && npm run build && cd ..
   .venv/bin/python run.py
   ```
   (On Windows, use `.venv\Scripts\pip` and `.venv\Scripts\python`.)
   Open http://&lt;host&gt;:8000 — backend serves the built frontend.

### Docker

```bash
# Build (includes frontend build in multi-stage Dockerfile)
docker compose up --build
```

Data is stored in `./data.json`; mount it as in `docker-compose.yml` to persist.

## Excel Import

Columns: `date`, `morning_sbp`, `morning_dbp`, `evening_sbp`, `evening_dbp`, `note`. Rows whose first column contains "Week average" are skipped.

- **CLI**: `.venv/bin/python -m backend.migration path/to/file.xlsx [import_wins|keep_existing]` (or activate `.venv` first, then `python -m backend.migration …`)
- **API**: `POST /api/import` with multipart file and query `strategy=import_wins|keep_existing`

## Backup

- Daily at 02:00 (APScheduler), or trigger via `POST /api/backup/run`
- Status: `GET /api/backup/status`
- Configure in `backend/.env`: `SMTP_SERVER`, `SMTP_PORT`, `SENDER_EMAIL`, `RECEIVER_EMAIL`, `PASSWORD`

## AI Insights

- **Statistics page**: An "AI insights" block appears between the time-range selector and the Overview. Click **Refresh AI insights** to generate a summary for the current range; the last result is shown until you refresh again.
- **Target language**: In the "Prompt for external AI service" area, choose **English** or **Korean**; the prompt and (when using the in-app LLM) the response use this language.
- **Copyable prompt**: The prompt includes aggregated stats and, for week/month/quarter ranges, raw daily records so you can paste it into an external LLM (e.g. ChatGPT, Claude) if the built-in provider is unavailable or rate-limited.
- **Admin**: Enable AI insights and set **Provider** (e.g. Gemini, Dummy) and **Model** (e.g. `gemini-2.5-flash`) under **System settings → AI / LLM settings**. API keys are not stored in the app; set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in `backend/.env`.

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
| POST | /api/insights | AI insights (body: `from`, `to`, `focus`, `locale`; uses settings `llm_enabled`, `llm_provider`, `llm_model`) |
| GET/PUT | /api/settings | Get/update settings (receiver_email, devices, sbp_high, dbp_high, llm_enabled, llm_provider, llm_model) |
| POST | /api/import | Excel upload |
| GET/POST | /api/backup/status, /api/backup/run | Backup status and manual run |

## Data

- **`data.json`** (project root): Records and meta. Structure:

```json
{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "morning_sbp": 120,
      "morning_dbp": 80,
      "evening_sbp": 118,
      "evening_dbp": 78,
      "note": "",
      "device": null
    }
  ],
  "meta": { "last_updated": "ISO8601", "version": 1 }
}
```

Writes are atomic (temp file + rename) to avoid corruption.

- **`settings.json`** (project root): App settings—receiver email, auto backup, devices, high-zone thresholds (sbp_high, dbp_high), and LLM options (llm_enabled, llm_provider, llm_model). Exported and restored with **Export/restore** in Admin so backups include LLM configuration (API keys stay in `.env` only).
