from datetime import datetime, timedelta
import hashlib
import logging
import secrets
import shlex
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, WebSocket, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_access_token
from app.core.security import encrypt_secret
from app.core.config import settings
from app.db import get_db
from app.db import SessionLocal
from app.deps import (
    apply_server_scope,
    ensure_action_access,
    ensure_section_access,
    ensure_server_access,
    get_allowed_server_ids,
    get_current_user,
    has_section_access,
    require_admin,
    user_has_all_servers_scope,
)
from app.models import CommandPattern, Server, ServerGroup
from app.models import User
from app.schemas import (
    AlertRead,
    BulkServerCreateItemResult,
    BulkServerCreateRequest,
    BulkServerCreateResponse,
    BulkCommandRequest,
    BulkCommandResponse,
    BulkAgentReinstallItemResult,
    BulkAgentReinstallResponse,
    CommandExecutionResult,
    ConnectionTestResult,
    DashboardStats,
    AgentEnrollRead,
    ServerAccountingSummary,
    ServerConnectionCheck,
    ServerCreate,
    ServerMetricSnapshot,
    ServerRead,
    ServerAccessRead,
    ServerConvertToKeyRead,
    ServerQuickUpdate,
    ServerUpdate,
)
from app.services.accounting import build_accounting_summary, normalize_monthly_cost
from app.services.alerts import collect_server_alerts
from app.services.audit import write_audit_log
from app.services.auth_state import validate_user_session
from app.services.filezilla_export import build_filezilla_site_manager_xml
from app.services.filezilla_import import parse_filezilla_site_manager_xml
from app.services.metrics_cache import persist_metrics_snapshot, read_cached_metric_snapshot
from app.services.ssh import execute_commands, fetch_server_metrics, run_command_on_server, stream_command_on_server, test_ssh_connection
from app.services.ssh_keys import (
    build_server_access_read,
    convert_server_to_key_auth,
    persist_server_keypair,
    resolve_auth_method,
    key_fingerprint_for_server,
    server_has_key_auth,
    server_has_password_auth,
)

router = APIRouter(prefix="/servers", tags=["servers"])
logger = logging.getLogger(__name__)


def _failed_metrics_snapshot(message: str = "ошибка опроса") -> dict[str, object]:
    return {
        "online": False,
        "cpu_percent": 0,
        "ram_percent": 0,
        "disk_percent": 0,
        "uptime": message,
        "metrics_available": False,
        "metrics_source": "error",
    }


def _refresh_server_metrics(db: Session, server: Server) -> ServerMetricSnapshot:
    try:
        snapshot = fetch_server_metrics(server)
        return persist_metrics_snapshot(db, server, snapshot)
    except Exception:
        db.rollback()
        try:
            return persist_metrics_snapshot(db, server, _failed_metrics_snapshot())
        except Exception:
            return read_cached_metric_snapshot(server)


def _refresh_server_metrics_by_id(server_id: int) -> ServerMetricSnapshot:
    with SessionLocal() as db:
        server = db.get(Server, server_id)
        if server is None:
            return ServerMetricSnapshot(
                server_id=server_id,
                cpu_percent=0,
                ram_percent=0,
                disk_percent=0,
                uptime="не найден",
                online=False,
                metrics_available=False,
                collected_at=None,
            )
        return _refresh_server_metrics(db, server)


def _refresh_metric_snapshots(servers: list[Server]) -> list[ServerMetricSnapshot]:
    if not servers:
        return []
    workers = min(8, len(servers))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_refresh_server_metrics_by_id, [server.id for server in servers]))


def _read_cached_metric_snapshots(servers: list[Server]) -> list[ServerMetricSnapshot]:
    return [read_cached_metric_snapshot(server) for server in servers]


def serialize_server(server: Server) -> ServerRead:
    model = ServerRead.model_validate(server, from_attributes=True)
    agent_online = bool(server.agent_last_seen_at and server.agent_last_seen_at >= datetime.utcnow() - timedelta(seconds=90))
    return model.model_copy(
        update={
            "group_name": server.group.name if server.group else None,
            "monthly_equivalent": normalize_monthly_cost(server.monthly_cost, server.billing_period),
            "agent_online": agent_online,
            "password_enc": None,
            "key_path": None,
            "auth_method": resolve_auth_method(server),
            "has_password": server_has_password_auth(server),
            "key_fingerprint": key_fingerprint_for_server(server),
        }
    )


def _servers_query_for_user(db: Session, current_user: User):
    return apply_server_scope(db.query(Server), current_user)


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
    if not (has_section_access(current_user, "servers") or has_section_access(current_user, "dashboard")):
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


@router.get("/export/filezilla")
def export_filezilla_site_manager(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    query = _servers_query_for_user(db, current_user).options(joinedload(Server.group)).order_by(Server.name.asc())
    servers = query.all()
    xml_payload = build_filezilla_site_manager_xml(servers)
    try:
        write_audit_log(
            db,
            user=current_user,
            action="server.export_filezilla",
            target_type="server",
            target_id="fleet",
            details=f"{len(servers)} сервер(ов)",
        )
    except Exception:
        db.rollback()
        logger.warning("Failed to write audit log for FileZilla export", exc_info=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return Response(
        content=xml_payload,
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="filezilla_servers_{timestamp}.xml"'},
    )


def _resolve_or_create_group(db: Session, name: str | None, *, actor: User) -> int | None:
    cleaned = (name or "").strip()
    if not cleaned:
        return None

    group = db.query(ServerGroup).filter(ServerGroup.name == cleaned).first()
    if group:
        return group.id

    ensure_action_access(actor, "group_create")
    group = ServerGroup(name=cleaned)
    db.add(group)
    db.flush()
    write_audit_log(
        db,
        user=actor,
        action="group.create",
        target_type="group",
        target_id=str(group.id),
        details=f"{group.name} (FileZilla import)",
    )
    return group.id


@router.post("/import/filezilla", response_model=BulkServerCreateResponse)
async def import_filezilla_site_manager(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_create")

    filename = (file.filename or "").lower()
    if not filename.endswith(".xml"):
        raise HTTPException(status_code=400, detail="Загрузите XML-файл FileZilla Site Manager.")

    raw = await file.read()
    try:
        xml_content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Файл FileZilla должен быть в кодировке UTF-8.") from exc

    try:
        imported = parse_filezilla_site_manager_xml(xml_content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[BulkServerCreateItemResult] = []
    created = 0
    skipped = 0

    for item in imported:
        existing = _find_existing_server(db, item.ip, item.port)
        if existing:
            skipped += 1
            results.append(
                BulkServerCreateItemResult(
                    name=item.name,
                    ip=item.ip,
                    ok=True,
                    server_id=existing.id,
                    message=f"Сервер уже существует ({existing.name}), пропущен.",
                )
            )
            continue

        try:
            group_id = _resolve_or_create_group(db, item.group_name, actor=current_user)
            payload = ServerCreate(
                name=item.name,
                ip=item.ip,
                port=item.port,
                login=item.login,
                password_enc=item.password,
                group_id=group_id,
                test_connection=bool(item.password),
                auto_install_agent=bool(item.password),
            )
            server = _create_server_internal(db, payload, request, actor=current_user)
            created += 1
            results.append(
                BulkServerCreateItemResult(
                    name=server.name,
                    ip=server.ip,
                    ok=True,
                    server_id=server.id,
                    message="Сервер импортирован из FileZilla.",
                )
            )
            write_audit_log(
                db,
                user=current_user,
                action="server.create.filezilla_import",
                target_type="server",
                target_id=str(server.id),
                details=server.name,
            )
        except Exception as exc:
            db.rollback()
            if isinstance(exc, HTTPException):
                detail = str(exc.detail)
            else:
                detail = str(exc)
            results.append(
                BulkServerCreateItemResult(
                    name=item.name,
                    ip=item.ip,
                    ok=False,
                    message=detail or "Ошибка импорта сервера.",
                )
            )

    failed = len(results) - created - skipped
    write_audit_log(
        db,
        user=current_user,
        action="server.import.filezilla",
        target_type="servers",
        target_id=str(created),
        details=f"created={created};skipped={skipped};failed={failed};file={file.filename}",
    )
    return BulkServerCreateResponse(total=len(results), created=created, skipped=skipped, failed=failed, results=results)


def _find_existing_server(db: Session, ip: str, port: int) -> Server | None:
    return db.query(Server).filter(Server.ip == ip, Server.port == port).first()


def _create_server_internal(
    db: Session,
    payload: ServerCreate,
    request: Request,
    *,
    actor: User | None = None,
) -> Server:
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

    should_install_agent = bool(payload.password_enc or payload.key_path)
    agent_token: str | None = None
    if should_install_agent:
        agent_token = secrets.token_urlsafe(32)
        server.agent_enabled = True
        server.agent_token_hash = hashlib.sha256(agent_token.encode("utf-8")).hexdigest()

    db.commit()
    db.refresh(server)

    if should_install_agent and agent_token:
        try:
            _install_agent_over_ssh(server, _build_agent_api_base_url(request), agent_token)
        except Exception as exc:
            write_audit_log(
                db,
                user=actor,
                action="server.agent.install_failed",
                target_type="server",
                target_id=str(server.id),
                details=f"{server.name}: {exc}",
            )

    return server


@router.post("", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
def create_server(
    payload: ServerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_create")
    server = _create_server_internal(db, payload, request, actor=current_user)
    write_audit_log(db, user=current_user, action="server.create", target_type="server", target_id=str(server.id), details=server.name)
    return serialize_server(server)


@router.post("/bulk", response_model=BulkServerCreateResponse)
def create_servers_bulk(
    payload: BulkServerCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_create")
    results: list[BulkServerCreateItemResult] = []
    created = 0
    skipped = 0

    for item in payload.items:
        existing = _find_existing_server(db, item.ip, item.port)
        if existing:
            skipped += 1
            results.append(
                BulkServerCreateItemResult(
                    name=item.name,
                    ip=item.ip,
                    ok=True,
                    server_id=existing.id,
                    message=f"Сервер уже существует ({existing.name}), пропущен.",
                )
            )
            continue

        try:
            server = _create_server_internal(db, item, request, actor=current_user)
            created += 1
            results.append(
                BulkServerCreateItemResult(
                    name=server.name,
                    ip=server.ip,
                    ok=True,
                    server_id=server.id,
                    message="Сервер создан.",
                )
            )
            write_audit_log(
                db,
                user=current_user,
                action="server.create.bulk_item",
                target_type="server",
                target_id=str(server.id),
                details=server.name,
            )
        except Exception as exc:
            db.rollback()
            if isinstance(exc, HTTPException):
                detail = str(exc.detail)
            else:
                detail = str(exc)
            results.append(
                BulkServerCreateItemResult(
                    name=item.name,
                    ip=item.ip,
                    ok=False,
                    message=detail or "Ошибка создания сервера.",
                )
            )

    failed = len(results) - created - skipped
    write_audit_log(
        db,
        user=current_user,
        action="server.create.bulk",
        target_type="servers",
        target_id=str(created),
        details=f"created={created};skipped={skipped};failed={failed}",
    )
    return BulkServerCreateResponse(total=len(results), created=created, skipped=skipped, failed=failed, results=results)


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
import os
import subprocess
import sys
import time
from urllib import error as urlerror
from urllib import request

TOKEN = "{token}"
HEARTBEAT_URL = "{heartbeat_url}"
VERSION = "1.1.0"
last_result = None


def read_cpu_percent():
    try:
        def sample():
            with open("/proc/stat", "r", encoding="utf-8") as f:
                parts = f.readline().split()
            values = list(map(int, parts[1:8]))
            idle = values[3] + values[4]
            total = sum(values)
            return idle, total

        idle1, total1 = sample()
        time.sleep(0.5)
        idle2, total2 = sample()
        diff_total = total2 - total1
        diff_idle = idle2 - idle1
        if diff_total <= 0:
            return 0
        return int(100 * (diff_total - diff_idle) / diff_total)
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
        headers={{
            "Content-Type": "application/json",
            "User-Agent": f"SSHPanel-Agent/{{VERSION}}",
        }},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            if not body:
                return {{}}
            return json.loads(body)
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        print(f"panel-agent heartbeat HTTP {{exc.code}}: {{detail[:500]}}", file=sys.stderr, flush=True)
        raise
    except Exception as exc:
        print(f"panel-agent heartbeat failed: {{exc}}", file=sys.stderr, flush=True)
        raise


def execute_task(command):
    if os.path.exists("/bin/bash"):
        return subprocess.run(
            ["/bin/bash", "-lc", command],
            text=True,
            capture_output=True,
            timeout=300,
        )
    return subprocess.run(
        command,
        shell=True,
        text=True,
        capture_output=True,
        timeout=300,
    )


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
                proc = execute_task(command)
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
    except Exception as exc:
        print(f"panel-agent loop error: {{exc}}", file=sys.stderr, flush=True)
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
systemctl enable panel-agent
systemctl restart panel-agent
systemctl status panel-agent --no-pager -l
"""
    return script


def _build_external_base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    return f"{proto}://{host}{settings.api_v1_prefix}"


def _build_agent_api_base_url(request: Request) -> str:
    if settings.public_api_base_url.strip() or settings.frontend_origin.strip():
        return settings.agent_api_base_url
    return _build_external_base_url(request)


def _install_agent_over_ssh(server: Server, base_url: str, token: str) -> None:
    script = _build_agent_install_script(base_url, token)
    command = "bash -lc " + shlex.quote(script)
    exit_code, output, error = run_command_on_server(server, command, timeout=180)
    if exit_code != 0:
        raise RuntimeError(error or output or "Не удалось установить агент на сервер.")


def _reinstall_server_agent(
    db: Session,
    server: Server,
    base_url: str,
    *,
    actor: User | None = None,
) -> AgentEnrollRead:
    token = secrets.token_urlsafe(32)
    server.agent_enabled = True
    server.agent_token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db.commit()
    db.refresh(server)
    if actor is not None:
        write_audit_log(
            db,
            user=actor,
            action="server.agent.enroll",
            target_type="server",
            target_id=str(server.id),
            details=server.name,
        )

    install_script = _build_agent_install_script(base_url, token)
    message = "Токен агента сгенерирован."
    installed = False
    install_error: str | None = None
    if server.password_enc or server.key_path or server.private_key_enc:
        try:
            _install_agent_over_ssh(server, base_url, token)
            installed = True
            message = "Агент установлен и запущен на сервере."
        except Exception as exc:
            install_error = str(exc)
            message = "Токен создан, но автоустановка не удалась. Выполни install_script вручную на сервере."
    else:
        message = "Токен создан. Для автоустановки добавьте SSH-пароль или ключ сервера."

    return AgentEnrollRead(
        ok=True,
        message=message,
        token=token,
        install_script=install_script,
        installed=installed,
        install_error=install_error,
    )


def _reinstall_agent_by_server_id(server_id: int, base_url: str, actor_id: int) -> BulkAgentReinstallItemResult:
    with SessionLocal() as db:
        server = db.get(Server, server_id)
        actor = db.get(User, actor_id)
        if server is None:
            return BulkAgentReinstallItemResult(
                server_id=server_id,
                server_name="—",
                ok=False,
                installed=False,
                message="Сервер не найден.",
            )
        if not (server.password_enc or server.key_path or server.private_key_enc):
            return BulkAgentReinstallItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                installed=False,
                message="Нет SSH-пароля или ключа для автоустановки.",
            )

        try:
            result = _reinstall_server_agent(db, server, base_url, actor=actor)
            if result.installed:
                return BulkAgentReinstallItemResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=True,
                    installed=True,
                    message=result.message,
                )
            return BulkAgentReinstallItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                installed=False,
                message=result.install_error or result.message,
            )
        except Exception as exc:
            return BulkAgentReinstallItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                installed=False,
                message=str(exc),
            )


@router.post("/agent/reinstall-all", response_model=BulkAgentReinstallResponse)
def reinstall_all_agents(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    base_url = _build_agent_api_base_url(request)
    servers = _servers_query_for_user(db, current_user).order_by(Server.name.asc()).all()
    eligible = [server for server in servers if server.password_enc or server.key_path or server.private_key_enc]
    skipped = len(servers) - len(eligible)

    results: list[BulkAgentReinstallItemResult] = []
    if eligible:
        workers = min(4, len(eligible))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(
                pool.map(
                    lambda server_id: _reinstall_agent_by_server_id(server_id, base_url, current_user.id),
                    [server.id for server in eligible],
                )
            )

    installed = sum(1 for item in results if item.installed)
    failed = sum(1 for item in results if not item.installed)
    write_audit_log(
        db,
        user=current_user,
        action="server.agent.reinstall_all",
        target_type="system",
        target_id="agents",
        details=f"installed={installed}, failed={failed}, skipped={skipped}",
    )
    return BulkAgentReinstallResponse(
        total=len(servers),
        installed=installed,
        failed=failed,
        skipped=skipped,
        results=results,
    )


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

    return _reinstall_server_agent(db, server, _build_agent_api_base_url(request), actor=current_user)


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "dashboard")
    query = apply_server_scope(db.query(Server), current_user)
    servers = query.all()
    snapshots = _read_cached_metric_snapshots(servers)
    snapshot_by_id = {item.server_id: item for item in snapshots}
    online_servers = sum(1 for snapshot in snapshots if snapshot.online)
    expiring_soon = 0
    payment_expired = 0
    agent_online = 0
    password_auth_count = 0
    key_auth_count = 0
    monthly_spend = 0.0
    monthly_currency = "RUB"
    cpu_values: list[int] = []
    ram_values: list[int] = []
    disk_values: list[int] = []
    now = datetime.utcnow()

    for server in servers:
        if server.pay_until:
            if server.pay_until <= now:
                payment_expired += 1
            elif server.pay_until <= now + timedelta(days=3):
                expiring_soon += 1
        if server.agent_last_seen_at and server.agent_last_seen_at >= now - timedelta(seconds=90):
            agent_online += 1
        if server_has_password_auth(server):
            password_auth_count += 1
        if server_has_key_auth(server):
            key_auth_count += 1
        equivalent = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        if equivalent is not None:
            monthly_spend += equivalent
            if server.currency:
                monthly_currency = server.currency
        snapshot = snapshot_by_id.get(server.id)
        if snapshot and snapshot.metrics_available:
            cpu_values.append(snapshot.cpu_percent)
            ram_values.append(snapshot.ram_percent)
            disk_values.append(snapshot.disk_percent)

    def _avg(values: list[int]) -> float:
        return round(sum(values) / len(values), 1) if values else 0.0

    return DashboardStats(
        total_servers=len(servers),
        online_servers=online_servers,
        offline_servers=max(0, len(servers) - online_servers),
        agent_online=agent_online,
        expiring_soon=expiring_soon,
        payment_expired=payment_expired,
        groups_total=db.query(ServerGroup).count(),
        patterns_total=db.query(CommandPattern).count(),
        avg_cpu=_avg(cpu_values),
        avg_ram=_avg(ram_values),
        avg_disk=_avg(disk_values),
        password_auth_count=password_auth_count,
        key_auth_count=key_auth_count,
        monthly_spend=round(monthly_spend, 2),
        monthly_currency=monthly_currency,
    )


@router.get("/metrics", response_model=list[ServerMetricSnapshot])
def list_metrics(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    if not (has_section_access(current_user, "dashboard") or has_section_access(current_user, "servers")):
        ensure_section_access(current_user, "dashboard")
    servers = apply_server_scope(db.query(Server), current_user).all()
    return _read_cached_metric_snapshots(servers)


@router.post("/metrics/refresh-all", response_model=list[ServerMetricSnapshot])
def refresh_all_metrics(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    if not (has_section_access(current_user, "dashboard") or has_section_access(current_user, "servers")):
        ensure_section_access(current_user, "dashboard")
    servers = _servers_query_for_user(db, current_user).all()
    return _refresh_metric_snapshots(servers)


@router.post("/{server_id}/metrics/refresh", response_model=ServerMetricSnapshot)
def refresh_server_metrics(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    if not (has_section_access(current_user, "dashboard") or has_section_access(current_user, "servers")):
        ensure_section_access(current_user, "dashboard")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)
    return _refresh_server_metrics(db, server)


@router.get("/alerts", response_model=list[AlertRead])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "alerts")
    alerts = collect_server_alerts(db)
    if user_has_all_servers_scope(current_user):
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


@router.patch("/{server_id}/quick", response_model=ServerRead)
def quick_update_server(
    server_id: int,
    payload: ServerQuickUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_update")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)

    changes = payload.model_dump(exclude_unset=True)
    if "group_id" in changes:
        group_id = changes["group_id"]
        if group_id is not None and not db.get(ServerGroup, group_id):
            raise HTTPException(status_code=404, detail="Группа не найдена.")
        server.group_id = group_id
    if "monthly_cost" in changes:
        server.monthly_cost = changes["monthly_cost"]
    if "billing_period" in changes:
        server.billing_period = changes["billing_period"]
    elif server.billing_period is None:
        server.billing_period = "monthly"
    if "currency" in changes:
        server.currency = changes["currency"]
    elif server.currency is None:
        server.currency = "RUB"

    db.commit()
    db.refresh(server)
    try:
        write_audit_log(
            db,
            user=current_user,
            action="server.update",
            target_type="server",
            target_id=str(server.id),
            details=f"{server.name}: quick",
        )
    except Exception:
        db.rollback()
        logger.warning("Failed to write audit log for server %s quick update", server.id, exc_info=True)
    return serialize_server(server)


@router.get("/{server_id}/access", response_model=ServerAccessRead)
def get_server_access(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    if not (has_section_access(current_user, "servers") or has_section_access(current_user, "dashboard")):
        ensure_section_access(current_user, "servers")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)
    try:
        access = build_server_access_read(server, db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Не удалось подготовить данные SSH-доступа: {exc}") from exc
    try:
        write_audit_log(
            db,
            user=current_user,
            action="server.view_access",
            target_type="server",
            target_id=str(server.id),
            details=server.name,
        )
    except Exception:
        db.rollback()
        logger.warning("Failed to write audit log for server %s access view", server.id, exc_info=True)
    return access


@router.post("/{server_id}/convert-to-key", response_model=ServerConvertToKeyRead)
def convert_server_to_key(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    ensure_action_access(current_user, "server_update")
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)
    try:
        keypair = convert_server_to_key_auth(server)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    persist_server_keypair(server, keypair)
    db.commit()
    db.refresh(server)
    access = build_server_access_read(server, db)
    write_audit_log(
        db,
        user=current_user,
        action="server.convert_to_key",
        target_type="server",
        target_id=str(server.id),
        details=server.name,
    )
    return ServerConvertToKeyRead(
        ok=True,
        message="SSH-доступ переведён на ключ. Пароль удалён из панели.",
        auth_method=access.auth_method,
        key_fingerprint=keypair.fingerprint,
        private_key=keypair.private_pem,
        public_key=keypair.public_line,
        ssh_command=access.ssh_command_with_key or access.ssh_command,
    )


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

    old_pay_until = server.pay_until
    for field, value in payload.model_dump().items():
        if field == "password_enc":
            if not value:
                continue
            value = encrypt_secret(value)
        if field == "key_path" and not value:
            continue
        setattr(server, field, value)

    if server.pay_until and (old_pay_until is None or server.pay_until > old_pay_until):
        from app.services.payment_notifications import reset_payment_notification_state

        reset_payment_notification_state(db, server.id)

    db.commit()
    db.refresh(server)
    try:
        write_audit_log(db, user=current_user, action="server.update", target_type="server", target_id=str(server.id), details=server.name)
    except Exception:
        db.rollback()
        logger.warning("Failed to write audit log for server %s update", server.id, exc_info=True)
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
