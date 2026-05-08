from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.models import Server
from app.schemas import FirewallRuleRead, FirewallRuleRequest, FirewallStatusRead, FirewallToggleRequest, TmuxActionResponse
from app.services.audit import write_audit_log
from app.services.ssh import (
    build_firewall_rule_command,
    build_firewall_toggle_command,
    get_firewall_status,
    run_command_on_server,
)

router = APIRouter(prefix="/firewall", tags=["firewall"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


@router.get("/{server_id}", response_model=FirewallStatusRead)
def firewall_status(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "firewall")
    ensure_server_access(current_user, server)
    try:
        status = get_firewall_status(server)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FirewallStatusRead(
        enabled=bool(status["enabled"]),
        status_text=str(status["status_text"]),
        rules=[FirewallRuleRead(**rule) for rule in status["rules"]],
        raw_output=str(status["raw_output"]),
    )


@router.post("/{server_id}/rule", response_model=TmuxActionResponse)
def apply_firewall_rule(
    server_id: int,
    payload: FirewallRuleRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "firewall")
    ensure_action_access(current_user, "firewall_manage")
    ensure_server_access(current_user, server)
    command = build_firewall_rule_command(
        action=payload.action,
        port=payload.port,
        protocol=payload.protocol,
        source=payload.source,
    )

    try:
        exit_code, output, error = run_command_on_server(server, command, timeout=45)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось применить правило firewall.")

    write_audit_log(
        db,
        user=current_user,
        action=f"firewall.{payload.action}",
        target_type="server",
        target_id=str(server_id),
        details=f"{payload.port}/{payload.protocol}" + (f" from {payload.source}" if payload.source else ""),
    )
    return TmuxActionResponse(ok=True, message=output or "Правило firewall применено.")


@router.post("/{server_id}/toggle", response_model=TmuxActionResponse)
def toggle_firewall(
    server_id: int,
    payload: FirewallToggleRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "firewall")
    ensure_action_access(current_user, "firewall_manage")
    ensure_server_access(current_user, server)
    command = build_firewall_toggle_command(payload.enabled)

    try:
        exit_code, output, error = run_command_on_server(server, command, timeout=60)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось изменить состояние firewall.")

    write_audit_log(
        db,
        user=current_user,
        action="firewall.enable" if payload.enabled else "firewall.disable",
        target_type="server",
        target_id=str(server_id),
        details=server.name,
    )
    return TmuxActionResponse(ok=True, message=output or ("UFW включён." if payload.enabled else "UFW выключен."))
