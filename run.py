#!/usr/bin/env python3
"""
Start UnderPressure backend (and serve frontend if frontend/dist exists).

Run from project root using the project venv, e.g. `.venv/bin/python run.py`.
If `.venv` exists but you invoked this with another interpreter, the script
re-execs using `.venv/bin/python` (or `Scripts\\python.exe` on Windows).
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
if os.name == "nt":
    VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"

# Use .venv when present and current interpreter is not already from .venv
if VENV_PYTHON.exists() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
    os.execv(VENV_PYTHON, [str(VENV_PYTHON), __file__] + sys.argv[1:])

os.chdir(ROOT)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("DEV", "").lower() in ("1", "true"),
    )
