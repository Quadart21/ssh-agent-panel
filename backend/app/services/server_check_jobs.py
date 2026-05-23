import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import SessionLocal
from app.models import Server, ServerCheckRun, User
from app.services.audit import write_audit_log
from app.services.notification_settings import get_or_create_notification_settings
from app.services.server_checks import CHECKS_BY_ID, run_server_check
from app.services.telegram import format_telegram_message, resolve_telegram_topic_id, send_telegram_message, telegram_is_configured


def panel_report_url(server_id: int, run_id: str) -> str:
    base = settings.frontend_origin.rstrip("/")
    return f"{base}/server-checks?server={server_id}&run={run_id}"


def serialize_run_summary(run: ServerCheckRun, server_name: str | None = None) -> dict[str, object]:
    return {
        "id": run.id,
        "server_id": run.server_id,
        "server_name": server_name,
        "check_id": run.check_id,
        "check_title": run.check_title,
        "check_group": run.check_group,
        "status": run.status,
        "requested_by_email": run.requested_by_email,
        "ok": run.ok,
        "summary": run.summary,
        "duration_ms": run.duration_ms,
        "error_message": run.error_message,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


def queue_server_check(db: Session, *, server: Server, check_id: str, user: User) -> ServerCheckRun:
    check = CHECKS_BY_ID.get(check_id)
    if check is None:
        raise ValueError("Неизвестная проверка.")

    active = (
        db.query(ServerCheckRun)
        .filter(
            ServerCheckRun.server_id == server.id,
            ServerCheckRun.check_id == check_id,
            ServerCheckRun.status.in_(("queued", "running")),
        )
        .first()
    )
    if active:
        raise RuntimeError("Эта проверка уже выполняется для сервера. Дождитесь завершения или откройте готовый отчёт.")

    run = ServerCheckRun(
        id=str(uuid.uuid4()),
        server_id=server.id,
        check_id=check.id,
        check_title=check.title,
        check_group=check.group,
        status="queued",
        requested_by_email=user.email,
        created_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    write_audit_log(
        db,
        user=user,
        action="server.check.queue",
        target_type="server",
        target_id=str(server.id),
        details=f"{check.id} ({run.id})",
    )
    return run


def execute_server_check_run(run_id: str) -> None:
    with SessionLocal() as db:
        run = db.get(ServerCheckRun, run_id)
        if run is None or run.status != "queued":
            return

        run.status = "running"
        run.started_at = datetime.utcnow()
        db.commit()

        server = db.get(Server, run.server_id)
        if server is None:
            run.status = "failed"
            run.error_message = "Сервер не найден."
            run.finished_at = datetime.utcnow()
            db.commit()
            _notify_server_check_complete(db, run, None)
            return

        try:
            report = run_server_check(server, run.check_id)
            run.status = "completed"
            run.report = report
            run.ok = bool(report.get("ok"))
            run.summary = str(report.get("summary") or "")
            run.duration_ms = int(report.get("duration_ms") or 0)
            run.exit_code = int(report.get("exit_code") or 0)
            run.error_message = None
        except Exception as exc:
            run.status = "failed"
            run.ok = False
            run.summary = "Проверка завершилась с ошибкой."
            run.error_message = str(exc)
        run.finished_at = datetime.utcnow()
        db.commit()
        db.refresh(run)

        write_audit_log(
            db,
            user=None,
            action="server.check.complete",
            target_type="server",
            target_id=str(run.server_id),
            details=f"{run.check_id} ({run.id}): {run.summary}",
        )
        _notify_server_check_complete(db, run, server)


def _notify_server_check_complete(db: Session, run: ServerCheckRun, server: Server | None) -> None:
    if not telegram_is_configured(db):
        return

    profile = get_or_create_notification_settings(db)
    panel_url = panel_report_url(run.server_id, run.id)
    server_name = server.name if server else f"#{run.server_id}"
    icon = "✅" if run.status == "completed" and run.ok else "⚠️" if run.status == "completed" else "❌"
    title = "Диагностика сервера готова" if run.status == "completed" else "Ошибка диагностики сервера"

    facts = [
        ("Сервер", server_name),
        ("Проверка", run.check_title),
    ]
    if run.summary:
        facts.append(("Итог", run.summary))
    if run.error_message and run.status == "failed":
        facts.append(("Ошибка", run.error_message[:180]))

    lines = ["Откройте панель и посмотрите GUI-отчёт."]
    message = format_telegram_message(title, icon=icon, facts=facts, lines=lines)
    reply_markup = {
        "inline_keyboard": [[{"text": "📊 Открыть отчёт", "url": panel_url}]],
    }

    try:
        send_telegram_message(
            message,
            db,
            parse_mode="HTML",
            topic_id=resolve_telegram_topic_id(profile, "server_check"),
            reply_markup=reply_markup,
        )
    except Exception:
        pass


def list_server_check_runs(db: Session, *, server_id: int | None = None, limit: int = 30) -> list[dict[str, object]]:
    query = db.query(ServerCheckRun, Server.name).join(Server, Server.id == ServerCheckRun.server_id)
    if server_id is not None:
        query = query.filter(ServerCheckRun.server_id == server_id)
    rows = query.order_by(ServerCheckRun.created_at.desc()).limit(max(1, min(limit, 100))).all()
    return [serialize_run_summary(run, server_name) for run, server_name in rows]


def get_server_check_run(db: Session, run_id: str) -> tuple[ServerCheckRun, str] | None:
    row = (
        db.query(ServerCheckRun, Server.name)
        .join(Server, Server.id == ServerCheckRun.server_id)
        .filter(ServerCheckRun.id == run_id)
        .first()
    )
    if row is None:
        return None
    return row
