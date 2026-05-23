from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_section_access, ensure_server_access, get_current_user
from app.models import Server, User
from app.schemas import (
    ServerCheckGroupRead,
    ServerCheckReportRead,
    ServerCheckRunDetailRead,
    ServerCheckRunQueuedRead,
    ServerCheckRunSummaryRead,
    ServerCheckSectionRead,
    ServerCheckVisualRead,
)
from app.services.server_check_jobs import (
    execute_server_check_run,
    get_server_check_run,
    list_server_check_runs,
    panel_report_url,
    queue_server_check,
    serialize_run_summary,
)
from app.services.server_checks import get_check_catalog

router = APIRouter(prefix="/server-checks", tags=["server-checks"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


def _report_from_payload(payload: dict[str, object], server_name: str) -> ServerCheckReportRead:
    return ServerCheckReportRead(
        server_id=int(payload["server_id"]),
        server_name=str(payload.get("server_name") or server_name),
        check_id=str(payload["check_id"]),
        check_title=str(payload["check_title"]),
        group=str(payload["group"]),
        ok=bool(payload.get("ok")),
        exit_code=int(payload.get("exit_code") or 0),
        duration_ms=int(payload.get("duration_ms") or 0),
        summary=str(payload.get("summary") or ""),
        visual=ServerCheckVisualRead.model_validate(payload["visual"]),
        sections=[ServerCheckSectionRead.model_validate(section) for section in payload.get("sections") or []],
        raw_excerpt=str(payload.get("raw_excerpt") or ""),
    )


@router.get("/catalog", response_model=list[ServerCheckGroupRead])
def server_checks_catalog(_: object = Depends(get_current_user)):
    return get_check_catalog()


@router.get("/runs", response_model=list[ServerCheckRunSummaryRead])
def server_check_runs(
    server_id: int | None = None,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    if server_id is not None:
        server = get_server_or_404(db, server_id)
        ensure_server_access(current_user, server)
    return list_server_check_runs(db, server_id=server_id, limit=limit)


@router.get("/runs/{run_id}", response_model=ServerCheckRunDetailRead)
def server_check_run_detail(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    row = get_server_check_run(db, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Запуск проверки не найден.")
    run, server_name = row
    server = db.get(Server, run.server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    ensure_server_access(current_user, server)

    summary = serialize_run_summary(run, server_name)
    report = None
    if run.status == "completed" and run.report:
        report = _report_from_payload(run.report, server_name)
    return ServerCheckRunDetailRead(**summary, report=report)


@router.post("/{server_id}/queue/{check_id}", response_model=ServerCheckRunQueuedRead)
def queue_check_on_server(
    server_id: int,
    check_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "servers")
    ensure_server_access(current_user, server)
    try:
        run = queue_server_check(db, server=server, check_id=check_id, user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    background_tasks.add_task(execute_server_check_run, run.id)
    return ServerCheckRunQueuedRead(
        run_id=run.id,
        status=run.status,
        message="Проверка запущена в фоне. Когда отчёт будет готов, придёт уведомление в Telegram.",
        panel_url=panel_report_url(server.id, run.id),
    )
