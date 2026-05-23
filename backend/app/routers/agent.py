import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AgentTask, Server
from app.schemas import AgentHeartbeatRequest
from app.services.metrics_cache import apply_metrics_snapshot

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/heartbeat")
def agent_heartbeat(payload: AgentHeartbeatRequest, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    server = db.query(Server).filter(Server.agent_token_hash == token_hash).first()
    if not server:
        raise HTTPException(status_code=401, detail="Недействительный токен агента.")

    server.agent_enabled = True
    server.agent_last_seen_at = datetime.utcnow()
    server.agent_version = payload.version or server.agent_version
    server.agent_cpu_percent = payload.cpu_percent
    server.agent_ram_percent = payload.ram_percent
    server.agent_disk_percent = payload.disk_percent
    server.agent_uptime = payload.uptime or ""
    apply_metrics_snapshot(
        server,
        {
            "cpu_percent": payload.cpu_percent,
            "ram_percent": payload.ram_percent,
            "disk_percent": payload.disk_percent,
            "uptime": payload.uptime or "agent online",
            "online": True,
            "metrics_available": True,
            "metrics_source": "agent",
        },
    )

    if payload.task_id:
        task = (
            db.query(AgentTask)
            .filter(AgentTask.id == payload.task_id, AgentTask.server_id == server.id)
            .first()
        )
        if task and task.status in {"queued", "running"}:
            normalized_status = (payload.task_status or "").strip().lower()
            if normalized_status in {"done", "ok", "success"}:
                task.status = "done"
            elif normalized_status in {"error", "failed", "fail"}:
                task.status = "error"
            else:
                task.status = "done" if (payload.task_exit_code or 0) == 0 else "error"
            task.stdout = payload.task_stdout or ""
            task.stderr = payload.task_stderr or ""
            task.exit_code = payload.task_exit_code
            task.finished_at = datetime.utcnow()

    next_task = (
        db.query(AgentTask)
        .filter(AgentTask.server_id == server.id, AgentTask.status == "queued")
        .order_by(AgentTask.created_at.asc())
        .first()
    )
    task_payload: dict | None = None
    if next_task:
        next_task.status = "running"
        next_task.started_at = datetime.utcnow()
        task_payload = {"id": next_task.id, "command": next_task.command}

    db.commit()
    return {"ok": True, "message": "Heartbeat принят.", "task": task_payload}
