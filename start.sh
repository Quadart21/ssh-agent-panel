#!/usr/bin/env bash
#
# Полная установка SSH Control Panel (backend + frontend), генерация секретов и .env.
# Использование:
#   ./start.sh                    # SQLite, только установка
#   ./start.sh --run              # установить и запустить API + Vite dev
#   ./start.sh --postgres         # создать БД в локальном PostgreSQL (нужен sudo)
#   ./start.sh --install-deps     # apt: python3-venv, nodejs, npm (Debian/Ubuntu)
#   ./start.sh --force            # перезаписать .env (старый пароль админа в БД может перестать совпадать)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RUN_AFTER=0
INSTALL_SYSTEM_DEPS=0
USE_POSTGRES=0
FORCE=0
BIND_HOST="${BIND_HOST:-0.0.0.0}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@panel.local}"

for arg in "$@"; do
  case "$arg" in
    --run) RUN_AFTER=1 ;;
    --install-deps) INSTALL_SYSTEM_DEPS=1 ;;
    --postgres) USE_POSTGRES=1 ;;
    --force) FORCE=1 ;;
    --help|-h)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# //' | head -n 20
      exit 0
      ;;
  esac
done

log() { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[✖]\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Нужна команда «$1». Установите её или запустите с --install-deps (Debian/Ubuntu)."; }

random_secret_hex() { openssl rand -hex 32; }
random_password() { python3 -c "import secrets; print(secrets.token_urlsafe(18))" 2>/dev/null || openssl rand -base64 24 | tr '$`\"' 'X' | cut -c1-22; }

if [[ "$INSTALL_SYSTEM_DEPS" -eq 1 ]]; then
  if [[ -f /etc/debian_version ]]; then
    log "Установка системных пакетов (apt)…"
    sudo apt-get update -y
    sudo apt-get install -y python3 python3-venv python3-pip curl openssl ca-certificates
    if ! command -v node >/dev/null 2>&1; then
      sudo apt-get install -y nodejs npm || warn "Не удалось поставить nodejs/npm из apt — поставьте Node 18+ вручную (nodesource/nvm)."
    fi
  else
    warn "--install-deps поддерживает только Debian/Ubuntu. На другой ОС поставьте Python 3.10+, Node 18+, openssl вручную."
  fi
fi

need_cmd python3
need_cmd openssl
need_cmd npm

BACKEND_ENV="$ROOT/backend/.env"
if [[ -f "$BACKEND_ENV" && "$FORCE" -ne 1 ]]; then
  die "Уже есть $BACKEND_ENV. Чтобы перегенерировать пароли и .env: ./start.sh --force [...другие флаги]"
fi

CREDS_FILE="$ROOT/install-credentials.txt"
mkdir -p "$ROOT/logs" "$ROOT/backend/data"

SECRET_KEY="$(random_secret_hex)"
ADMIN_PASSWORD="$(random_password)"

FRONTEND_DEV_ORIGIN="http://127.0.0.1:5173"
FRONTEND_PREVIEW_ORIGIN="http://127.0.0.1:4173"
API_PUBLIC="${API_PUBLIC:-http://127.0.0.1:8000}"

if [[ "$USE_POSTGRES" -eq 1 ]]; then
  need_cmd sudo
  command -v psql >/dev/null 2>&1 || die "Для --postgres нужен PostgreSQL (команда psql)."
  DB_NAME="${POSTGRES_DB:-ssh_panel}"
  DB_USER="${POSTGRES_USER:-ssh_panel}"
  DB_PASS="$(openssl rand -hex 24)"
  log "Создаю роль и БД PostgreSQL (sudo)…"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
SELECT format('CREATE DATABASE %I OWNER %I', '$DB_NAME', '$DB_USER')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DB_NAME')\gexec
SQL
  export P="$DB_PASS"
  DATABASE_URL="postgresql+psycopg://${DB_USER}:$(python3 -c "import urllib.parse, os; print(urllib.parse.quote(os.environ['P'], safe=''))")@127.0.0.1:5432/${DB_NAME}"
  unset P
else
  SQLITE_PATH="$ROOT/backend/data/panel.db"
  DATABASE_URL="sqlite:///${SQLITE_PATH}"
FRONTEND_ENV="$ROOT/frontend/.env"

log "Пишу $BACKEND_ENV …"
cat >"$BACKEND_ENV" <<EOF
APP_NAME=SSH Control Panel API
APP_DISPLAY_NAME=SSH Control Panel
API_V1_PREFIX=/api/v1
FRONTEND_ORIGIN=$FRONTEND_DEV_ORIGIN
FRONTEND_ORIGINS=$FRONTEND_DEV_ORIGIN,$FRONTEND_PREVIEW_ORIGIN
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=$DATABASE_URL
SECRET_KEY=$SECRET_KEY
ACCESS_TOKEN_EXPIRE_MINUTES=720
ENCRYPTION_KEY=
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SCHEDULER_ENABLED=true
SCHEDULER_INTERVAL_SECONDS=300
ALERT_REPEAT_MINUTES=180
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
SESSION_INACTIVITY_MINUTES=720
EOF

if [[ "$API_PUBLIC" == https://* ]]; then
  WS_PUBLIC="wss://${API_PUBLIC#https://}"
elif [[ "$API_PUBLIC" == http://* ]]; then
  WS_PUBLIC="ws://${API_PUBLIC#http://}"
else
  WS_PUBLIC="ws://127.0.0.1:8000"
fi

log "Пишу $FRONTEND_ENV …"
cat >"$FRONTEND_ENV" <<EOF
VITE_API_BASE_URL=${API_PUBLIC}/api/v1
VITE_TERMINAL_WS_BASE_URL=${WS_PUBLIC}/api/v1/terminal/ws
EOF

log "Python venv + pip …"
python3 -m venv "$ROOT/backend/.venv"
# shellcheck source=/dev/null
source "$ROOT/backend/.venv/bin/activate"
pip install --upgrade pip
pip install -r "$ROOT/backend/requirements.txt"

log "npm install + build frontend …"
(cd "$ROOT/frontend" && npm install && npm run build)

{
  echo "# SSH Control Panel — сгенерировано $(date -Iseconds)"
  echo "# Храните файл в безопасном месте. Права: chmod 600"
  echo ""
  echo "ADMIN_EMAIL=$ADMIN_EMAIL"
  echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"
  echo "SECRET_KEY=$SECRET_KEY"
  echo "DATABASE_URL=$DATABASE_URL"
  if [[ "$USE_POSTGRES" -eq 1 ]]; then
    echo "POSTGRES_USER=$DB_USER"
    echo "POSTGRES_DB=$DB_NAME"
    echo "POSTGRES_PASSWORD=$DB_PASS"
  fi
  echo ""
  echo "Backend .env:  $BACKEND_ENV"
  echo "Frontend .env: $FRONTEND_ENV"
} >"$CREDS_FILE"
chmod 600 "$CREDS_FILE"

log "Готово."

cat <<OUT

══════════════════════════════════════════════════════════════════
  SSH Control Panel — установка завершена
══════════════════════════════════════════════════════════════════

  \033[1mВход в панель (после запуска frontend):\033[0m
    Email:    $ADMIN_EMAIL
    Пароль:   $ADMIN_PASSWORD
    (При первом входе панель попросит \033[1mсменить пароль\033[0m — это норма.)

  \033[1mAPI:\033[0m
    $API_PUBLIC/docs   — Swagger
    $API_PUBLIC/api/v1

  \033[1mФайлы:\033[0m
    Учётные данные:  $CREDS_FILE  (chmod 600)
    Backend config:  $BACKEND_ENV
    Frontend build:  $ROOT/frontend/dist/

  \033[1mЗапуск вручную:\033[0m
    Терминал 1 — API:
      cd $ROOT/backend && source .venv/bin/activate \\
        && uvicorn app.main:app --host $BIND_HOST --port 8000

    Терминал 2 — интерфейс (dev):
      cd $ROOT/frontend && npm run dev
      → откройте http://127.0.0.1:5173

    Или только статика (уже собрана):
      cd $ROOT/frontend && npx --yes serve -s dist -l 4173
      → добавьте в backend .env FRONTEND_ORIGIN=http://127.0.0.1:4173
        и перезапустите API (CORS).

══════════════════════════════════════════════════════════════════
OUT

if [[ "$RUN_AFTER" -eq 1 ]]; then
  log "Запускаю API в фоне и Vite dev на переднем плане (Ctrl+C остановит dev; API — по PID)…"
  # shellcheck source=/dev/null
  source "$ROOT/backend/.venv/bin/activate"
  cd "$ROOT/backend"
  nohup uvicorn app.main:app --host "$BIND_HOST" --port 8000 >"$ROOT/logs/backend.log" 2>&1 &
  echo $! >"$ROOT/logs/backend.pid"
  sleep 1
  if kill -0 "$(cat "$ROOT/logs/backend.pid")" 2>/dev/null; then
    log "API pid $(cat "$ROOT/logs/backend.pid"), лог: $ROOT/logs/backend.log"
  else
    warn "API не поднялся, см. $ROOT/logs/backend.log"
  fi
  cleanup() {
    if [[ -f "$ROOT/logs/backend.pid" ]]; then
      kill "$(cat "$ROOT/logs/backend.pid")" 2>/dev/null || true
      rm -f "$ROOT/logs/backend.pid"
    fi
  }
  trap cleanup EXIT
  cd "$ROOT/frontend" && npm run dev
fi
