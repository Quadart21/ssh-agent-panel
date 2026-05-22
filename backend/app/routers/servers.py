from datetime import datetime, timedelta
import hashlib
import secrets
import shlex

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.security import encrypt_secret
from app.core.config import settings
from app.db import get_db
from app.db import SessionLocal
from app.deps import (
    ensure_action_access,
    ensure_section_access,
    ensure_server_access,
    get_allowed_server_ids,
    get_current_user,
    require_admin,
)
from app.models import CommandPattern, Server, ServerGroup
from app.models import User
from app.schemas import (
    AlertRead,
    BulkCommandRequest,
    BulkCommandResponse,
    CommandExecutionResult,
    ConnectionTestResult,
    DashboardStats,
    AgentEnrollRead,
    ServerAccountingSummary,
    ServerConnectionCheck,
    ServerCreate,
    ServerMetricSnapshot,
    ServerRead,
    ServerUpdate,
)
from app.services.accounting import build_accounting_summary, normalize_monthly_cost
from app.services.alerts import collect_server_alerts
from app.services.auth_state import validate_user_session
from app.services.ssh import execute_commands, fetch_server_metrics, run_command_on_server, stream_command_on_server, test_ssh_connection
from app.services.audit import write_audit_log

router = APIRouter(prefix="/servers", tags=["servers"])


def serialize_server(server: Server) -> ServerRead:
    model = ServerRead.model_validate(server, from_attributes=True)
    agent_online = bool(server.agent_last_seen_at and server.agent_last_seen_at >= datetime.utcnow() - timedelta(seconds=90))
    return model.model_copy(
        update={
            "group_name": server.group.name if server.group else None,
            "monthly_equivalent": normalize_monthly_cost(server.monthly_cost, server.billing_period),
            "agent_online": agent_online,
        }
    )


def _servers_query_for_user(db: Session, current_user: User):
    query = db.query(Server)
    allowed_ids = get_allowed_server_ids(current_user)
    if current_user.role != "admin":
        if not allowed_ids:
            return query.filter(Server.id == -1)
        query = query.filter(Server.id.in_(allowed_ids))
    return query


def collect_target_servers(payload: BulkCommandRequest, db: Session, current_user: User) -> tuple[list[Server], list[str]]:
    commands = payload.commands
    if payload.pattern_id:
        pattern = db.get(CommandPattern, payload.pattern_id)
        if not pattern:
            raise HTTPException(status_code=404, detail="Шаблон не найден.")
        commands = pattern.commands

    if not commands:
        raise HTTPException(status_code=400, detail="Добавьте команды для выполнения.")

    servers_query = db.query(Server)
    collected_servers: list[Server] = []
    seen_ids: set[int] = set()

    if payload.group_id:
        group = db.get(ServerGroup, payload.group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена.")
        for server in servers_query.filter(Server.group_id == payload.group_id).all():
            ensure_server_access(current_user, server)
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if payload.server_ids:
        for server in servers_query.filter(Server.id.in_(payload.server_ids)).all():
            ensure_server_access(current_user, server)
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if not collected_servers:
        raise HTTPException(status_code=400, detail="Не выбраны серверы для выполнения команд.")

    return collected_servers, commands


@router.get("", response_model=list[ServerRead])
def list_servers(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    servers = _servers_query_for_user(db, current_user).order_by(Server.created_at.desc()).all()
    return [serialize_server(server) for server in servers]


@router.get("/accounting", response_model=ServerAccountingSummary)
def servers_accounting_summary(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    servers = _servers_query_for_user(db, current_user).order_by(Server.name.asc()).all()
    return build_accounting_summary(servers)


@router.post("", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
def create_server(
    payload: ServerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_create")
    if payload.group_id and not db.get(ServerGroup, payload.group_id):
        raise HTTPException(status_code=404, detail="Группа не найдена.")

    if payload.test_connection:
        result = test_ssh_connection(
            ServerConnectionCheck(
                ip=payload.ip,
                port=payload.port,
                login=payload.login,
                password_enc=payload.password_enc,
                key_path=payload.key_path,
            )
        )
        if not result.ok:
            raise HTTPException(status_code=400, detail=result.message)

    encrypted_password = encrypt_secret(payload.password_enc)
    server = Server(**payload.model_dump(exclude={"test_connection", "auto_install_agent"}))
    server.password_enc = encrypted_password
    db.add(server)

    if payload.auto_install_agent and (payload.password_enc or payload.key_path):
        token = secrets.token_urlsafe(32)
        server.agent_enabled = True
        server.agent_token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        try:
            _install_agent_over_ssh(server, _build_external_base_url(request), token)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Агент не установлен: {exc}") from exc

    db.commit()
    db.refresh(server)
    write_audit_log(db, user=current_user, action="server.create", target_type="server", target_id=str(server.id), details=server.name)
    return serialize_server(server)


@router.post("/test-connection", response_model=ConnectionTestResult)
def test_connection(
    payload: ServerConnectionCheck,
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_create")
    return test_ssh_connection(payload)


def _build_agent_install_script(base_url: str, token: str) -> str:
    heartbeat_url = f"{base_url}/agent/heartbeat"
    script = f"""#!/usr/bin/env bash
set -euo pipefail
cat > /usr/local/bin/panel-agent.py <<'EOF'
#!/usr/bin/env python3
import json
import subprocess
import time
from urllib import request

TOKEN = "{token}"
HEARTBEAT_URL = "{heartbeat_url}"
VERSION = "1.1.0"
last_result = None


def read_cpu_percent():
    try:
        with open("/proc/stat", "r", encoding="utf-8") as f:
            parts = f.readline().split()
        user, nice, system, idle, iowait = map(int, parts[1:6])
        total = user + nice + system + idle + iowait
        busy = user + nice + system
        if total <= 0:
            return 0
        return int((busy * 100) / total)
    except Exception:
        return 0


def read_ram_percent():
    try:
        total = 0
        avail = 0
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    avail = int(line.split()[1])
        if total <= 0:
            return 0
        return int(((total - avail) * 100) / total)
    except Exception:
        return 0


def read_disk_percent():
    try:
        output = subprocess.check_output(["df", "-P", "/"], text=True)
        line = output.strip().splitlines()[1]
        value = line.split()[4].replace("%", "")
        return int(value)
    except Exception:
        return 0


def read_uptime():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as f:
            seconds = int(float(f.read().split()[0]))
        return f"{{seconds}}s"
    except Exception:
        return "0s"


def post_heartbeat(payload):
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        HEARTBEAT_URL,
        data=data,
        headers={{"Content-Type": "application/json"}},
        method="POST",
    )
    with request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        if not body:
            return {{}}
        return json.loads(body)


while True:
    payload = {{
        "token": TOKEN,
        "version": VERSION,
        "cpu_percent": read_cpu_percent(),
        "ram_percent": read_ram_percent(),
        "disk_percent": read_disk_percent(),
        "uptime": read_uptime(),
    }}
    if last_result:
        payload.update(last_result)
        last_result = None
    try:
        response = post_heartbeat(payload)
        task = response.get("task") if isinstance(response, dict) else None
        if task and task.get("id") and task.get("command"):
            command = str(task["command"])
            try:
                proc = subprocess.run(
                    command,
                    shell=True,
                    text=True,
                    capture_output=True,
                    timeout=300,
                )
                last_result = {{
                    "task_id": int(task["id"]),
                    "task_status": "done" if proc.returncode == 0 else "error",
                    "task_stdout": proc.stdout[-16000:],
                    "task_stderr": proc.stderr[-16000:],
                    "task_exit_code": int(proc.returncode),
                }}
            except Exception as exc:
                last_result = {{
                    "task_id": int(task["id"]),
                    "task_status": "error",
                    "task_stdout": "",
                    "task_stderr": str(exc),
                    "task_exit_code": 1,
                }}
            time.sleep(1)
            continue
    except Exception:
        pass
    time.sleep(30)
EOF

chmod +x /usr/local/bin/panel-agent.py

cat > /etc/systemd/system/panel-agent.service <<'EOF'
[Unit]
Description=SSH Panel Node Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env python3 /usr/local/bin/panel-agent.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now panel-agent
systemctl status panel-agent --no-pager -l
"""
    return script


def _build_external_base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    return f"{proto}://{host}{settings.api_v1_prefix}"


def _install_agent_over_ssh(server: Server, base_url: str, token: str) -> None:
    script = _build_agent_install_script(base_url, token)
    command = "bash -lc " + shlex.quote(script)
    exit_code, output, error = run_command_on_server(server, command, timeout=180)
    if exit_code != 0:
        raise RuntimeError(error or output or "Не удалось установить агент на сервер.")


@router.post("/{server_id}/agent/enroll", response_model=AgentEnrollRead)
def enroll_server_agent(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")

    token = secrets.token_urlsafe(32)
    server.agent_enabled = True
    server.agent_token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db.commit()
    db.refresh(server)
    write_audit_log(db, user=current_user, action="server.agent.enroll", target_type="server", target_id=str(server.id), details=server.name)

    base_url = _build_external_base_url(request)
    install_script = _build_agent_install_script(base_url, token)
    return AgentEnrollRead(ok=True, message="Токен агента сгенерирован.", token=token, install_script=install_script)


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "dashboard")
    query = db.query(Server)
    allowed_ids = get_allowed_server_ids(current_user)
    if current_user.role != "admin":
        if not allowed_ids:
            return DashboardStats(total_servers=0, online_servers=0, expiring_soon=0, groups_total=0, patterns_total=0)
        query = query.filter(Server.id.in_(allowed_ids))
    servers = query.all()
    total_servers = len(servers)
    online_servers = 0
    expiring_soon = 0
    now = datetime.utcnow()

    for server in servers:
        snapshot = fetch_server_metrics(server)
        if bool(snapshot["online"]):
            online_servers += 1
        if server.pay_until and server.pay_until <= now + timedelta(days=3):
            expiring_soon += 1

    return DashboardStats(
        total_servers=total_servers,
        online_servers=online_servers,
        expiring_soon=expiring_soon,
        groups_total=db.query(ServerGroup).count(),
        patterns_total=db.query(CommandPattern).count(),
    )


@router.get("/metrics", response_model=list[ServerMetricSnapshot])
def list_metrics(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "dashboard")
    snapshots: list[ServerMetricSnapshot] = []
    query = db.query(Server)
    allowed_ids = get_allowed_server_ids(current_user)
    if current_user.role != "admin":
        if not allowed_ids:
            return []
        query = query.filter(Server.id.in_(allowed_ids))
    for server in query.all():
        snapshot = fetch_server_metrics(server)
        snapshots.append(
            ServerMetricSnapshot(
                server_id=server.id,
                cpu_percent=int(snapshot["cpu_percent"]),
                ram_percent=int(snapshot["ram_percent"]),
                disk_percent=int(snapshot["disk_percent"]),
                uptime=str(snapshot["uptime"]),
                online=bool(snapshot["online"]),
            )
        )
    return snapshots


@router.get("/alerts", response_model=list[AlertRead])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "alerts")
    alerts = collect_server_alerts(db)
    if current_user.role == "admin":
        return alerts
    allowed_ids = set(get_allowed_server_ids(current_user))
    return [alert for alert in alerts if alert.server_id is None or alert.server_id in allowed_ids]


@router.post("/run-commands", response_model=BulkCommandResponse)
def run_commands(
    payload: BulkCommandRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "commands")
    ensure_action_access(current_user, "command_run")
    collected_servers, commands = collect_target_servers(payload, db, current_user)

    results: list[CommandExecutionResult] = []
    for server in collected_servers:
        try:
            results.extend(execute_commands(server, commands))
        except Exception as exc:
            results.append(
                CommandExecutionResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=False,
                    command="; ".join(commands),
                    stdout="",
                    stderr=str(exc),
                )
            )

    write_audit_log(
        db,
        user=current_user,
        action="command.run_bulk",
        target_type="servers",
        target_id=",".join(str(server.id) for server in collected_servers),
        details=" | ".join(commands),
    )
    return BulkCommandResponse(results=results)


@router.websocket("/ws/run-commands")
async def run_commands_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return

    try:
        token_payload = decode_access_token(token)
    except ValueError:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    db = SessionLocal()

    try:
        email = token_payload.get("sub")
        session_token_id = token_payload.get("sid")
        if not email:
            await websocket.send_json({"type": "error", "message": "Токен не содержит пользователя."})
            await websocket.close(code=4401)
            return

        user = db.query(User).filter(User.email == email).first()
        validate_user_session(db, session_token_id)
        if not user:
            await websocket.send_json({"type": "error", "message": "Пользователь не найден."})
            await websocket.close(code=4403)
            return

        ensure_section_access(user, "commands")
        ensure_action_access(user, "command_run")
        raw_payload = await websocket.receive_json()
        request_payload = BulkCommandRequest.model_validate(raw_payload)
        collected_servers, commands = collect_target_servers(request_payload, db, user)

        await websocket.send_json(
            {
                "type": "run_started",
                "server_count": len(collected_servers),
                "command_count": len(commands),
            }
        )

        results: list[CommandExecutionResult] = []
        for server in collected_servers:
            await websocket.send_json(
                {
                    "type": "server_started",
                    "server_id": server.id,
                    "server_name": server.name,
                }
            )
            server_failed = False

            for index, command in enumerate(commands, start=1):
                await websocket.send_json(
                    {
                        "type": "command_started",
                        "server_id": server.id,
                        "server_name": server.name,
                        "step": index,
                        "command": command,
                    }
                )
                stdout_chunks: list[str] = []
                stderr_chunks: list[str] = []
                exit_code = 1

                try:
                    for event_type, payload_item in stream_command_on_server(server, command, timeout=3600):
                        if event_type == "stdout":
                            stdout_chunks.append(str(payload_item))
                            await websocket.send_json(
                                {
                                    "type": "command_output",
                                    "stream": "stdout",
                                    "server_id": server.id,
                                    "server_name": server.name,
                                    "command": command,
                                    "chunk": str(payload_item),
                                }
                            )
                        elif event_type == "stderr":
                            stderr_chunks.append(str(payload_item))
                            await websocket.send_json(
                                {
                                    "type": "command_output",
                                    "stream": "stderr",
                                    "server_id": server.id,
                                    "server_name": server.name,
                                    "command": command,
                                    "chunk": str(payload_item),
                                }
                            )
                        elif event_type == "exit":
                            exit_code = int(payload_item)
                except Exception as exc:
                    stderr_chunks.append(str(exc))
                    exit_code = 1

                result = CommandExecutionResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=exit_code == 0,
                    command=command,
                    stdout="".join(stdout_chunks).strip(),
                    stderr="".join(stderr_chunks).strip(),
                )
                results.append(result)
                await websocket.send_json(
                    {
                        "type": "command_finished",
                        "server_id": server.id,
                        "server_name": server.name,
                        "command": command,
                        "ok": result.ok,
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                    }
                )

                if exit_code != 0:
                    server_failed = True
                    break

            await websocket.send_json(
                {
                    "type": "server_finished",
                    "server_id": server.id,
                    "server_name": server.name,
                    "ok": not server_failed,
                }
            )

        write_audit_log(
            db,
            user=user,
            action="command.run_bulk_stream",
            target_type="servers",
            target_id=",".join(str(server.id) for server in collected_servers),
            details=" | ".join(commands),
        )
        await websocket.send_json(
            {
                "type": "run_finished",
                "results": [result.model_dump() for result in results],
            }
        )
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
    finally:
        db.close()


@router.put("/{server_id}", response_model=ServerRead)
def update_server(
    server_id: int,
    payload: ServerUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_update")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)

    if payload.group_id and not db.get(ServerGroup, payload.group_id):
        raise HTTPException(status_code=404, detail="Группа не найдена.")

    for field, value in payload.model_dump().items():
        if field == "password_enc":
            value = encrypt_secret(value)
        setattr(server, field, value)

    db.commit()
    db.refresh(server)
    write_audit_log(db, user=current_user, action="server.update", target_type="server", target_id=str(server.id), details=server.name)
    return serialize_server(server)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_delete")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)

    db.delete(server)
    db.commit()
    write_audit_log(db, user=current_user, action="server.delete", target_type="server", target_id=str(server_id), details=server.name)
