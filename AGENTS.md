# Agent notes

## Python

- Use the project virtual environment at **`.venv`** in the repo root.
- Prefer explicit invocations: **`.venv/bin/python`** and **`.venv/bin/pip`** (Linux/macOS), or **`.venv\Scripts\python.exe`** / **pip** on Windows.
- Create once: `python3 -m venv .venv`, then `.venv/bin/pip install -r backend/requirements.txt`.
- Run the API from the repo root: `.venv/bin/python run.py` (or `python3 run.py`; `run.py` re-execs into `.venv` when it exists).
- Other modules: `.venv/bin/python -m backend.migration …` from the repo root.

## Layout

- **Backend**: `backend/` (FastAPI), entry `backend.main:app`.
- **Frontend**: `frontend/` (Vite + React); dev server proxies `/api` to the backend.
