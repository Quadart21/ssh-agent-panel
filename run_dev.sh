#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID=""
FRONTEND_PID=""

log() {
  printf '[gui-ssh-manager] %s\n' "$1"
}

fail() {
  printf '[gui-ssh-manager] Error: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  local exit_code=$?

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup INT TERM EXIT

is_windows_shell=false
case "${OSTYPE:-}" in
  msys*|cygwin*|win32*)
    is_windows_shell=true
    ;;
esac

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v py >/dev/null 2>&1; then
  PYTHON_BIN="py"
else
  fail "Python is not installed or not available in PATH."
fi

if $is_windows_shell; then
  NPM_BIN="npm.cmd"
  VENV_PY="$BACKEND_DIR/.venv/Scripts/python.exe"
else
  NPM_BIN="npm"
  VENV_PY="$BACKEND_DIR/.venv/bin/python"
fi

command -v "$NPM_BIN" >/dev/null 2>&1 || fail "npm is not installed or not available in PATH."

[[ -d "$BACKEND_DIR" ]] || fail "Missing backend directory."
[[ -d "$FRONTEND_DIR" ]] || fail "Missing frontend directory."

if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  log "Created backend/.env from example."
fi

if [[ ! -f "$FRONTEND_DIR/.env" && -f "$FRONTEND_DIR/.env.example" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
  log "Created frontend/.env from example."
fi

if [[ ! -x "$VENV_PY" ]]; then
  log "Creating backend virtual environment..."
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
fi

log "Installing backend dependencies..."
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r "$BACKEND_DIR/requirements.txt"

log "Installing frontend dependencies..."
(cd "$FRONTEND_DIR" && "$NPM_BIN" install)

log "Starting backend on http://localhost:8000 ..."
(
  cd "$BACKEND_DIR"
  exec "$VENV_PY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

log "Starting frontend on http://localhost:5173 ..."
(
  cd "$FRONTEND_DIR"
  exec "$NPM_BIN" run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

log "Both services are running."
log "Press Ctrl+C to stop backend and frontend together."

wait "$BACKEND_PID" "$FRONTEND_PID"
