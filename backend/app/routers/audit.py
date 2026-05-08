import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import AuditLog
from app.schemas import AuditLogRead

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=list[AuditLogRead])
def list_audit_logs(
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()


@router.get("/logs/export")
def export_audit_logs(
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "user_email", "action", "target_type", "target_id", "details", "created_at"])
    for item in logs:
        writer.writerow([item.id, item.user_email, item.action, item.target_type, item.target_id, item.details, item.created_at.isoformat()])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )
