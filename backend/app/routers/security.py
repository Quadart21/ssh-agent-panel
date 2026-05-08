from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.models import Server
from app.schemas import Fail2BanJailRead, Fail2BanUnbanRequest, KickUserRequest, SecurityReportRead, TmuxActionResponse
from app.services.audit import write_audit_log
from app.services.ssh import (
    build_fail2ban_unban_command,
    build_kick_user_command,
    get_security_report,
    run_command_on_server,
)

router = APIRouter(prefix="/security", tags=["security"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


@router.get("/{server_id}/report", response_model=SecurityReportRead)
def security_report(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "security")
    ensure_server_access(current_user, server)
    try:
        report = get_security_report(server)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SecurityReportRead(
        auth_log_path=report["auth_log_path"],
        auth_log_excerpt=str(report["auth_log_excerpt"]),
        lastb_excerpt=str(report["lastb_excerpt"]),
        fail2ban_summary=str(report["fail2ban_summary"]),
        fail2ban_jails=[Fail2BanJailRead(**jail) for jail in report["fail2ban_jails"]],
    )


@router.post("/{server_id}/kick-user", response_model=TmuxActionResponse)
def kick_user(
    server_id: int,
    payload: KickUserRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "security")
    ensure_action_access(current_user, "security_manage")
    ensure_server_access(current_user, server)
    command = build_kick_user_command(payload.username)
    try:
        exit_code, output, error = run_command_on_server(server, command, timeout=20)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось завершить сессии пользователя.")

    write_audit_log(
        db,
        user=current_user,
        action="security.kick_user",
        target_type="server",
        target_id=str(server_id),
        details=payload.username,
    )
    return TmuxActionResponse(ok=True, message=output or "Сессии пользователя завершены.")


@router.post("/{server_id}/fail2ban/unban", response_model=TmuxActionResponse)
def unban_ip(
    server_id: int,
    payload: Fail2BanUnbanRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "security")
    ensure_action_access(current_user, "security_manage")
    ensure_server_access(current_user, server)
    command = build_fail2ban_unban_command(payload.jail, payload.ip)
    try:
        exit_code, output, error = run_command_on_server(server, command, timeout=20)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось снять бан с IP.")

    write_audit_log(
        db,
        user=current_user,
        action="security.fail2ban_unban",
        target_type="server",
        target_id=str(server_id),
        details=f"{payload.jail}: {payload.ip}",
    )
    return TmuxActionResponse(ok=True, message=output or "IP успешно разблокирован.")
