# SSH Control Panel

Production-oriented web panel for managing Linux servers over SSH.

Project structure:

```text
backend/   FastAPI + SQLAlchemy + Alembic
frontend/  React + TypeScript + Vite
deploy/    Production templates for systemd, nginx and env files
```

## What Is Included

- JWT authentication with session tracking
- First admin bootstrap from environment variables
- Secret encryption for stored server credentials
- SSH terminal over WebSocket
- PM2 process management (cluster / несколько инстансов)
- Bulk command execution and automation presets
- Linux user management
- UFW / firewall management
- SSH / fail2ban security section
- Telegram notifications and alert scheduler
- TOTP 2FA with recovery codes
- Audit log export
- Backup export/import

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

The backend runs Alembic migrations automatically on startup and creates the first admin from:

```env
ADMIN_EMAIL=admin@ssh.norenvpn.com
ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

Recommended database:

```env
DATABASE_URL=postgresql+psycopg://ssh_panel:change_me@127.0.0.1:5432/ssh_panel
```

Run locally:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run build
```

Production frontend env:

```env
VITE_API_BASE_URL=https://ssh.norenvpn.com/api/v1
VITE_TERMINAL_WS_BASE_URL=wss://ssh.norenvpn.com/api/v1/terminal/ws
```

If these variables are omitted, the frontend falls back to the current browser origin and works behind a reverse proxy.

## Production Notes

- PostgreSQL is the primary target database.
- `FRONTEND_ORIGIN` / `FRONTEND_ORIGINS` must match the public domain.
- `ALLOWED_HOSTS` should contain your production hostnames.
- `SECRET_KEY` must be replaced before first launch.
- `ENCRYPTION_KEY` is optional; if omitted it is derived from `SECRET_KEY`.
- Ready-to-use templates are in [deploy/README.md](/c:/Users/Administrator/Desktop/боты/SSH_client_GUI/deploy/README.md).

## Core Endpoints

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/servers`
- `POST /api/v1/servers/run-commands`
- `GET /api/v1/automation/presets`
- `POST /api/v1/automation/run`
- `WS /api/v1/automation/ws/run`
- `WS /api/v1/terminal/ws/{server_id}`
- `GET /api/v1/pm2/{server_id}/apps`
- `POST /api/v1/pm2/{server_id}/apps`
- `POST /api/v1/pm2/{server_id}/apps/{name}/stop`
- `POST /api/v1/pm2/{server_id}/apps/{name}/restart`
- `DELETE /api/v1/pm2/{server_id}/apps/{name}`
- `GET /api/v1/pm2/{server_id}/apps/{name}/logs`
- `GET /api/v1/security/{server_id}/report`
- `GET /api/v1/firewall/{server_id}`
- `GET /api/v1/audit/logs`
- `GET /health`
