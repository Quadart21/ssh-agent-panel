import shlex
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.models import Server
from app.schemas import Pm2AppStart, Pm2LogsResponse, Pm2ProcessRead, TmuxActionResponse
from app.services.audit import write_audit_log
from app.services.ssh import list_pm2_processes, run_command_on_server, wrap_command_for_server_user

router = APIRouter(prefix="/pm2", tags=["pm2"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


def _decode_app_name(app_name: str) -> str:
    return unquote(app_name)


def _build_pm2_start_command(payload: Pm2AppStart) -> str:
    script = payload.script.strip()
    name = payload.name.strip()
    parts = ["pm2", "start", shlex.quote(script)]
    if payload.cwd and payload.cwd.strip():
        parts.extend(["--cwd", shlex.quote(payload.cwd.strip())])
    if payload.instances > 1:
        parts.extend(["-i", str(payload.instances)])
    parts.extend(["--name", shlex.quote(name)])
    cmd = " ".join(parts)
    if payload.script_args and payload.script_args.strip():
        return f"{cmd} -- {payload.script_args.strip()}"
    return cmd


@router.get("/{server_id}/apps", response_model=list[Pm2ProcessRead])
def get_pm2_apps(
    server_id: int,
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    try:
        return list_pm2_processes(server, run_as_user=run_as_user)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{server_id}/apps", response_model=TmuxActionResponse)
def start_pm2_app(
    server_id: int,
    payload: Pm2AppStart,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    command = _build_pm2_start_command(payload)
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_command_for_server_user(server, command, payload.run_as_user),
            timeout=120,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось запустить процесс через PM2.")

    msg = (output or "Приложение добавлено в PM2.").splitlines()[0][:500]
    inst_note = f", инстансов: {payload.instances}" if payload.instances > 1 else ""
    details = f"{payload.name}: {payload.script}{inst_note}"
    if payload.run_as_user:
        details += f" as {payload.run_as_user}"
    write_audit_log(db, user=current_user, action="pm2.start", target_type="server", target_id=str(server_id), details=details)
    return TmuxActionResponse(ok=True, message=msg or "Приложение добавлено в PM2.")


@router.post("/{server_id}/apps/{app_name}/stop", response_model=TmuxActionResponse)
def stop_pm2_app(
    server_id: int,
    app_name: str,
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    name = _decode_app_name(app_name)
    command = f"pm2 stop {shlex.quote(name)}"
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_command_for_server_user(server, command, run_as_user),
            timeout=60,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось остановить приложение PM2.")
    write_audit_log(db, user=current_user, action="pm2.stop", target_type="pm2", target_id=name, details=str(run_as_user or ""))
    return TmuxActionResponse(ok=True, message=(output or "Приложение остановлено.").splitlines()[0][:500])


@router.post("/{server_id}/apps/{app_name}/restart", response_model=TmuxActionResponse)
def restart_pm2_app(
    server_id: int,
    app_name: str,
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    name = _decode_app_name(app_name)
    command = f"pm2 restart {shlex.quote(name)}"
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_command_for_server_user(server, command, run_as_user),
            timeout=120,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось перезапустить приложение PM2.")
    write_audit_log(db, user=current_user, action="pm2.restart", target_type="pm2", target_id=name, details=str(run_as_user or ""))
    return TmuxActionResponse(ok=True, message=(output or "Приложение перезапущено.").splitlines()[0][:500])


@router.delete("/{server_id}/apps/{app_name}", response_model=TmuxActionResponse)
def delete_pm2_app(
    server_id: int,
    app_name: str,
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    name = _decode_app_name(app_name)
    command = f"pm2 delete {shlex.quote(name)}"
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_command_for_server_user(server, command, run_as_user),
            timeout=60,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось удалить приложение из PM2.")
    write_audit_log(db, user=current_user, action="pm2.delete", target_type="pm2", target_id=name, details=str(run_as_user or ""))
    return TmuxActionResponse(ok=True, message=(output or "Приложение удалено из PM2.").splitlines()[0][:500])


@router.get("/{server_id}/apps/{app_name}/logs", response_model=Pm2LogsResponse)
def get_pm2_logs(
    server_id: int,
    app_name: str,
    lines: int = Query(default=80, ge=1, le=500),
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    name = _decode_app_name(app_name)
    command = f"pm2 logs {shlex.quote(name)} --nostream --lines {lines}"
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_command_for_server_user(server, command, run_as_user),
            timeout=90,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось получить логи PM2.")
    content = (output or "").strip() or (error or "").strip()
    return Pm2LogsResponse(app_name=name, content=content)
