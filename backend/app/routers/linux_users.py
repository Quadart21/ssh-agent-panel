from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.models import Server, ServerGroup
from app.schemas import (
    LinuxUserCreateRequest,
    LinuxUserDeleteRequest,
    LinuxUserOperationResponse,
    LinuxUserOperationResult,
    LinuxUserRead,
)
from app.services.audit import write_audit_log
from app.services.ssh import (
    build_linux_user_create_command,
    build_linux_user_delete_command,
    list_linux_users,
    run_command_on_server,
)

router = APIRouter(prefix="/linux-users", tags=["linux-users"])


def collect_target_servers(db: Session, group_id: int | None, server_ids: list[int]) -> list[Server]:
    query = db.query(Server)
    collected_servers: list[Server] = []
    seen_ids: set[int] = set()

    if group_id:
        group = db.get(ServerGroup, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена.")
        for server in query.filter(Server.group_id == group_id).all():
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if server_ids:
        for server in query.filter(Server.id.in_(server_ids)).all():
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if not collected_servers:
        raise HTTPException(status_code=400, detail="Не выбраны серверы для операции.")

    return collected_servers


@router.get("/{server_id}", response_model=list[LinuxUserRead])
def get_linux_users(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_section_access(current_user, "users")
    ensure_server_access(current_user, server)

    try:
        users = list_linux_users(server)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return [LinuxUserRead(**user) for user in users]


@router.post("/create", response_model=LinuxUserOperationResponse)
def create_linux_user(
    payload: LinuxUserCreateRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "users")
    ensure_action_access(current_user, "linux_users_manage")
    servers = collect_target_servers(db, payload.group_id, payload.server_ids)
    for server in servers:
        ensure_server_access(current_user, server)
    command = build_linux_user_create_command(
        username=payload.username,
        password=payload.password,
        ssh_public_key=payload.ssh_public_key,
        sudo_access=payload.sudo_access,
    )

    results: list[LinuxUserOperationResult] = []
    for server in servers:
        try:
            exit_code, output, error = run_command_on_server(server, command, timeout=60)
            results.append(
                LinuxUserOperationResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=exit_code == 0,
                    username=payload.username,
                    action="create",
                    message=output or error or ("Пользователь создан." if exit_code == 0 else "Не удалось создать пользователя."),
                    stderr=error,
                )
            )
        except Exception as exc:
            results.append(
                LinuxUserOperationResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=False,
                    username=payload.username,
                    action="create",
                    message="Не удалось выполнить операцию.",
                    stderr=str(exc),
                )
            )

    write_audit_log(
        db,
        user=current_user,
        action="linux_user.create",
        target_type="servers",
        target_id=",".join(str(server.id) for server in servers),
        details=payload.username,
    )
    return LinuxUserOperationResponse(results=results)


@router.post("/delete", response_model=LinuxUserOperationResponse)
def delete_linux_user(
    payload: LinuxUserDeleteRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "users")
    ensure_action_access(current_user, "linux_users_manage")
    servers = collect_target_servers(db, payload.group_id, payload.server_ids)
    for server in servers:
        ensure_server_access(current_user, server)
    command = build_linux_user_delete_command(payload.username, purge_home=payload.purge_home)

    results: list[LinuxUserOperationResult] = []
    for server in servers:
        try:
            exit_code, output, error = run_command_on_server(server, command, timeout=60)
            results.append(
                LinuxUserOperationResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=exit_code == 0,
                    username=payload.username,
                    action="delete",
                    message=output or error or ("Пользователь удалён." if exit_code == 0 else "Не удалось удалить пользователя."),
                    stderr=error,
                )
            )
        except Exception as exc:
            results.append(
                LinuxUserOperationResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=False,
                    username=payload.username,
                    action="delete",
                    message="Не удалось выполнить операцию.",
                    stderr=str(exc),
                )
            )

    write_audit_log(
        db,
        user=current_user,
        action="linux_user.delete",
        target_type="servers",
        target_id=",".join(str(server.id) for server in servers),
        details=payload.username,
    )
    return LinuxUserOperationResponse(results=results)
