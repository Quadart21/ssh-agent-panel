import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import ensure_section_access, ensure_server_access, get_current_user
from app.models import MetricsEmbed, Server, User
from app.schemas import MetricsEmbedCreate, MetricsEmbedRead, MetricsEmbedUpdate, PublicEmbedMetricsRead, PublicEmbedServerMetricsRead
from app.services.audit import write_audit_log
from app.services.ssh import fetch_server_metrics

router = APIRouter(tags=["metric-embeds"])


def _generate_token() -> str:
    return secrets.token_urlsafe(24)


def _embed_url(token: str) -> str:
    base = settings.frontend_origin.rstrip("/")
    return f"{base}/#/embed/{token}"


def _iframe_code(token: str) -> str:
    url = _embed_url(token)
    return f'<iframe src="{url}" width="100%" height="420" style="border:0;border-radius:16px;" loading="lazy" title="Server metrics"></iframe>'


def serialize_embed(embed: MetricsEmbed) -> MetricsEmbedRead:
    return MetricsEmbedRead(
        id=embed.id,
        title=embed.title,
        token=embed.token,
        server_ids=list(embed.server_ids or []),
        theme=embed.theme,
        enabled=embed.enabled,
        created_by_email=embed.created_by_email,
        created_at=embed.created_at,
        updated_at=embed.updated_at,
        embed_url=_embed_url(embed.token),
        iframe_code=_iframe_code(embed.token),
    )


def _validate_server_ids(db: Session, current_user: User, server_ids: list[int]) -> None:
    unique_ids = list(dict.fromkeys(server_ids))
    if not unique_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один сервер.")
    servers = db.query(Server).filter(Server.id.in_(unique_ids)).all()
    if len(servers) != len(unique_ids):
        raise HTTPException(status_code=404, detail="Один или несколько серверов не найдены.")
    for server in servers:
        ensure_server_access(current_user, server)


@router.get("/metric-embeds", response_model=list[MetricsEmbedRead])
def list_metric_embeds(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    rows = db.query(MetricsEmbed).order_by(MetricsEmbed.created_at.desc()).all()
    return [serialize_embed(row) for row in rows]


@router.post("/metric-embeds", response_model=MetricsEmbedRead)
def create_metric_embed(
    payload: MetricsEmbedCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    _validate_server_ids(db, current_user, payload.server_ids)
    embed = MetricsEmbed(
        title=payload.title.strip(),
        token=_generate_token(),
        server_ids=list(dict.fromkeys(payload.server_ids)),
        theme=payload.theme,
        enabled=True,
        created_by_email=current_user.email,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(embed)
    db.commit()
    db.refresh(embed)
    write_audit_log(
        db,
        user=current_user,
        action="metric_embed.create",
        target_type="metric_embed",
        target_id=str(embed.id),
        details=embed.title,
    )
    return serialize_embed(embed)


@router.put("/metric-embeds/{embed_id}", response_model=MetricsEmbedRead)
def update_metric_embed(
    embed_id: int,
    payload: MetricsEmbedUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    embed = db.get(MetricsEmbed, embed_id)
    if embed is None:
        raise HTTPException(status_code=404, detail="Виджет не найден.")
    if payload.title is not None:
        embed.title = payload.title.strip()
    if payload.server_ids is not None:
        _validate_server_ids(db, current_user, payload.server_ids)
        embed.server_ids = list(dict.fromkeys(payload.server_ids))
    if payload.theme is not None:
        embed.theme = payload.theme
    if payload.enabled is not None:
        embed.enabled = payload.enabled
    embed.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(embed)
    write_audit_log(
        db,
        user=current_user,
        action="metric_embed.update",
        target_type="metric_embed",
        target_id=str(embed.id),
        details=embed.title,
    )
    return serialize_embed(embed)


@router.delete("/metric-embeds/{embed_id}")
def delete_metric_embed(
    embed_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    embed = db.get(MetricsEmbed, embed_id)
    if embed is None:
        raise HTTPException(status_code=404, detail="Виджет не найден.")
    title = embed.title
    db.delete(embed)
    db.commit()
    write_audit_log(
        db,
        user=current_user,
        action="metric_embed.delete",
        target_type="metric_embed",
        target_id=str(embed_id),
        details=title,
    )
    return {"ok": True}


@router.post("/metric-embeds/{embed_id}/rotate-token", response_model=MetricsEmbedRead)
def rotate_metric_embed_token(
    embed_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "servers")
    embed = db.get(MetricsEmbed, embed_id)
    if embed is None:
        raise HTTPException(status_code=404, detail="Виджет не найден.")
    embed.token = _generate_token()
    embed.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(embed)
    write_audit_log(
        db,
        user=current_user,
        action="metric_embed.rotate_token",
        target_type="metric_embed",
        target_id=str(embed.id),
        details=embed.title,
    )
    return serialize_embed(embed)


@router.get("/embed/{token}/metrics", response_model=PublicEmbedMetricsRead)
def public_embed_metrics(token: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    embed = db.query(MetricsEmbed).filter(MetricsEmbed.token == token).first()
    if embed is None or not embed.enabled:
        raise HTTPException(status_code=404, detail="Виджет не найден или отключён.")
    server_ids = list(embed.server_ids or [])
    servers = db.query(Server).filter(Server.id.in_(server_ids)).all() if server_ids else []
    servers_by_id = {server.id: server for server in servers}
    payload: list[PublicEmbedServerMetricsRead] = []
    for server_id in server_ids:
        server = servers_by_id.get(server_id)
        if server is None:
            continue
        snapshot = fetch_server_metrics(server)
        payload.append(
            PublicEmbedServerMetricsRead(
                name=server.name,
                cpu_percent=int(snapshot["cpu_percent"]),
                ram_percent=int(snapshot["ram_percent"]),
                disk_percent=int(snapshot["disk_percent"]),
                uptime=str(snapshot["uptime"]),
                online=bool(snapshot["online"]),
            )
        )
    return PublicEmbedMetricsRead(
        title=embed.title,
        theme=embed.theme,
        updated_at=datetime.utcnow(),
        servers=payload,
    )
