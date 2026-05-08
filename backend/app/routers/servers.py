from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.security import encrypt_secret
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
    ServerConnectionCheck,
    ServerCreate,
    ServerMetricSnapshot,
    ServerRead,
    ServerUpdate,
)
from app.services.alerts import collect_server_alerts
from app.services.auth_state import validate_user_session
from app.services.ssh import execute_commands, fetch_server_metrics, stream_command_on_server, test_ssh_connection
from app.services.audit import write_audit_log

router = APIRouter(prefix="/servers", tags=["servers"])


def serialize_server(server: Server) -> ServerRead:
    model = ServerRead.model_validate(server, from_attributes=True)
    return model.model_copy(update={"group_name": server.group.name if server.group else None})


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
    query = db.query(Server)
    allowed_ids = get_allowed_server_ids(current_user)
    if current_user.role != "admin":
        if not allowed_ids:
            return []
        query = query.filter(Server.id.in_(allowed_ids))
    servers = query.order_by(Server.created_at.desc()).all()
    return [serialize_server(server) for server in servers]


@router.post("", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
def create_server(
    payload: ServerCreate,
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
    server = Server(**payload.model_dump(exclude={"test_connection"}))
    server.password_enc = encrypted_password
    db.add(server)
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
