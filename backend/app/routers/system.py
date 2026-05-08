from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.schemas import TmuxActionResponse
from app.services.audit import write_audit_log
from app.services.backup import dump_backup_json, restore_backup_payload

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/backup/export")
def export_backup(
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    payload = dump_backup_json(db)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    write_audit_log(db, user=current_user, action="system.backup.export", target_type="system", target_id="backup")
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="gui_ssh_backup_{timestamp}.json"'},
    )


@router.post("/backup/import", response_model=TmuxActionResponse)
async def import_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    if not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Загрузите JSON-файл резервной копии.")
    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Файл резервной копии повреждён или не является JSON.") from exc

    if not isinstance(payload, dict) or "version" not in payload:
        raise HTTPException(status_code=400, detail="Неверный формат резервной копии.")

    restore_backup_payload(db, payload)
    write_audit_log(db, user=current_user, action="system.backup.import", target_type="system", target_id="backup", details=file.filename)
    return TmuxActionResponse(ok=True, message="Резервная копия успешно восстановлена.")
