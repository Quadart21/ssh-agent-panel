import shlex
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.models import Server
from app.schemas import Pm2AppStart, Pm2LogsResponse, Pm2ProcessRead, TmuxActionResponse
from app.services.audit import write_audit_log
from app.services.pm2_shell import wrap_pm2_command
from app.services.ssh import list_pm2_processes, run_command_on_server

router = APIRouter(prefix="/pm2", tags=["pm2"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


def _decode_app_name(app_name: str) -> str:
    return unquote(app_name)


def _is_python_script(script: str) -> bool:
    path = script.strip().split()[0]
    return path.lower().endswith(".py")


def _build_pm2_start_args(payload: Pm2AppStart) -> str:
    script = payload.script.strip()
    name = payload.name.strip()
    parts = ["start", shlex.quote(script)]
    if payload.interpreter and payload.interpreter.strip():
        parts.extend(["--interpreter", shlex.quote(payload.interpreter.strip())])
    elif _is_python_script(script):
        parts.extend(["--interpreter", "python3"])
    if payload.cwd and payload.cwd.strip():
        parts.extend(["--cwd", shlex.quote(payload.cwd.strip())])
    if payload.instances > 1:
        parts.extend(["-i", str(payload.instances)])
    parts.extend(["--name", shlex.quote(name)])
    args = " ".join(parts)
    if payload.script_args and payload.script_args.strip():
        return f"{args} -- {payload.script_args.strip()}"
    return args


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
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_pm2_command(server, _build_pm2_start_args(payload), payload.run_as_user),
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
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_pm2_command(server, f"stop {shlex.quote(name)}", run_as_user),
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
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_pm2_command(server, f"restart {shlex.quote(name)}", run_as_user),
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
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_pm2_command(server, f"delete {shlex.quote(name)}", run_as_user),
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
    pages: int = Query(default=50, ge=1, le=200, description="Сколько последних страниц логов вернуть."),
    lines_per_page: int = Query(default=50, ge=20, le=200, description="Строк на страницу."),
    lines: int | None = Query(
        default=None,
        ge=1,
        le=10000,
        description="Явный лимит строк (если задан — перекрывает pages * lines_per_page).",
    ),
    run_as_user: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "pm2")
    ensure_action_access(current_user, "pm2_use")
    ensure_server_access(current_user, server)
    name = _decode_app_name(app_name)
    total_lines = lines if lines is not None else min(pages * lines_per_page, 10000)
    try:
        exit_code, output, error = run_command_on_server(
            server,
            wrap_pm2_command(server, f"logs {shlex.quote(name)} --nostream --raw --lines {total_lines}", run_as_user),
            timeout=90,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if exit_code != 0:
        raise HTTPException(status_code=400, detail=error or output or "Не удалось получить логи PM2.")

    raw = (output or "").strip() or (error or "").strip()
    raw_lines = raw.splitlines()
    truncated = len(raw_lines) > total_lines
    if truncated:
        raw_lines = raw_lines[-total_lines:]
    content = "\n".join(raw_lines)
    return Pm2LogsResponse(
        app_name=name,
        content=content,
        lines=len(raw_lines),
        pages=pages if lines is None else max(1, (len(raw_lines) + lines_per_page - 1) // lines_per_page),
        lines_per_page=lines_per_page,
        truncated=truncated,
    )
