from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_section_access, ensure_server_access, get_current_user
from app.models import Server
from app.schemas import ServerCheckGroupRead, ServerCheckReportRead, ServerCheckSectionRead
from app.services.audit import write_audit_log
from app.services.server_checks import get_check_catalog, run_server_check

router = APIRouter(prefix="/server-checks", tags=["server-checks"])


def get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    return server


@router.get("/catalog", response_model=list[ServerCheckGroupRead])
def server_checks_catalog(_: object = Depends(get_current_user)):
    return get_check_catalog()


@router.post("/{server_id}/run/{check_id}", response_model=ServerCheckReportRead)
def run_check_on_server(
    server_id: int,
    check_id: str,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    server = get_server_or_404(db, server_id)
    ensure_section_access(current_user, "servers")
    ensure_server_access(current_user, server)
    try:
        report = run_server_check(server, check_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        user=current_user,
        action="server.check.run",
        target_type="server",
        target_id=str(server_id),
        details=f"{check_id}: {report['summary']}",
    )
    return ServerCheckReportRead(
        server_id=report["server_id"],
        server_name=report["server_name"],
        check_id=report["check_id"],
        check_title=report["check_title"],
        group=report["group"],
        ok=report["ok"],
        exit_code=report["exit_code"],
        duration_ms=report["duration_ms"],
        summary=report["summary"],
        sections=[ServerCheckSectionRead.model_validate(section) for section in report["sections"]],
        raw_excerpt=report.get("raw_excerpt") or "",
    )
