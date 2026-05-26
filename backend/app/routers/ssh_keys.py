from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import (
    ensure_section_access,
    ensure_server_access,
    ensure_ssh_keys_manage,
    get_allowed_server_ids,
    get_current_user,
)
from app.models import Server, User
from app.schemas import (
    PanelSshKeyRead,
    ServerKeyBindingRead,
    SshKeyDeployItemResult,
    SshKeyDeployRequest,
    SshKeyDeployResponse,
    SshKeysOverviewRead,
)
from app.services.audit import write_audit_log
from app.services.panel_ssh_keys import (
    binding_stats,
    can_deploy_panel_key,
    deploy_panel_key_to_server,
    generate_panel_ssh_key,
    get_panel_ssh_key,
    panel_key_private_pem,
    resolve_binding_status,
)

router = APIRouter(prefix="/ssh-keys", tags=["ssh-keys"])


def _servers_query(db: Session, current_user: User):
    query = db.query(Server)
    allowed_ids = get_allowed_server_ids(current_user)
    if current_user.role != "admin":
        if not allowed_ids:
            return query.filter(Server.id == -1)
        query = query.filter(Server.id.in_(allowed_ids))
    return query.order_by(Server.name.asc())


def _serialize_binding(server: Server, panel_key) -> ServerKeyBindingRead:
    return ServerKeyBindingRead(
        server_id=server.id,
        server_name=server.name,
        ip=server.ip,
        port=server.port,
        login=server.login,
        group_name=server.group.name if server.group else None,
        binding_status=resolve_binding_status(server, panel_key),
        can_deploy=can_deploy_panel_key(server),
        panel_key_deployed_at=server.panel_key_deployed_at,
        auth_method="key" if server.private_key_enc or server.key_path else ("password" if server.password_enc else "none"),
    )


@router.get("", response_model=SshKeysOverviewRead)
def ssh_keys_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "ssh-keys")
    panel_key = get_panel_ssh_key(db)
    servers = _servers_query(db, current_user).all()
    panel_read = None
    if panel_key:
        panel_read = PanelSshKeyRead(
            configured=True,
            fingerprint=panel_key.fingerprint,
            public_key=panel_key.public_key,
            created_at=panel_key.created_at,
            updated_at=panel_key.updated_at,
        )
    stats = binding_stats(servers, panel_key)
    return SshKeysOverviewRead(
        panel_key=panel_read,
        stats=stats,
        servers=[_serialize_binding(server, panel_key) for server in servers],
    )


@router.post("/generate", response_model=PanelSshKeyRead)
def generate_ssh_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "ssh-keys")
    ensure_ssh_keys_manage(current_user)
    try:
        panel_key = generate_panel_ssh_key(db)
    except Exception as exc:
        message = str(exc).lower()
        if "panel_ssh_keys" in message or "no such table" in message or "does not exist" in message:
            raise HTTPException(
                status_code=503,
                detail="База не обновлена: выполните alembic upgrade head (миграции 0013 и 0014).",
            ) from exc
        raise HTTPException(status_code=500, detail=f"Не удалось сгенерировать ключ: {exc}") from exc
    write_audit_log(db, user=current_user, action="ssh_keys.generate", target_type="panel", target_id="1")
    return PanelSshKeyRead(
        configured=True,
        fingerprint=panel_key.fingerprint,
        public_key=panel_key.public_key,
        created_at=panel_key.created_at,
        updated_at=panel_key.updated_at,
    )


@router.get("/private")
def export_panel_private_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "ssh-keys")
    ensure_ssh_keys_manage(current_user)
    private_pem = panel_key_private_pem(db)
    if not private_pem:
        raise HTTPException(status_code=404, detail="Ключ панели ещё не сгенерирован.")
    write_audit_log(db, user=current_user, action="ssh_keys.export_private", target_type="panel", target_id="1")
    panel_key = get_panel_ssh_key(db)
    return {
        "private_key": private_pem,
        "public_key": panel_key.public_key if panel_key else None,
        "fingerprint": panel_key.fingerprint if panel_key else None,
    }


def _deploy_one(server_id: int, remove_password: bool, actor_id: int) -> SshKeyDeployItemResult:
    with SessionLocal() as db:
        server = db.get(Server, server_id)
        panel_key = get_panel_ssh_key(db)
        if not server:
            return SshKeyDeployItemResult(server_id=server_id, server_name="—", ok=False, message="Сервер не найден.")
        if not panel_key:
            return SshKeyDeployItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                message="Сначала сгенерируйте ключ панели.",
            )
        try:
            deploy_panel_key_to_server(server, panel_key, remove_password=remove_password)
            db.commit()
            actor = db.get(User, actor_id)
            if actor:
                write_audit_log(
                    db,
                    user=actor,
                    action="ssh_keys.deploy",
                    target_type="server",
                    target_id=str(server.id),
                    details=server.name,
                )
            return SshKeyDeployItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=True,
                message="Ключ панели установлен.",
                binding_status=resolve_binding_status(server, panel_key),
            )
        except Exception as exc:
            db.rollback()
            return SshKeyDeployItemResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                message=str(exc),
            )


@router.post("/deploy", response_model=SshKeyDeployResponse)
def deploy_panel_key(
    payload: SshKeyDeployRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "ssh-keys")
    ensure_ssh_keys_manage(current_user)
    panel_key = get_panel_ssh_key(db)
    if not panel_key:
        raise HTTPException(status_code=400, detail="Сначала сгенерируйте ключ панели.")

    if not payload.server_ids:
        raise HTTPException(status_code=400, detail="Выберите серверы для установки ключа.")

    servers = _servers_query(db, current_user).filter(Server.id.in_(payload.server_ids)).all()
    if len(servers) != len(set(payload.server_ids)):
        raise HTTPException(status_code=404, detail="Один или несколько серверов не найдены.")

    for server in servers:
        ensure_server_access(current_user, server)

    workers = min(6, len(servers))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(
            pool.map(
                lambda server: _deploy_one(server.id, payload.remove_password, current_user.id),
                servers,
            )
        )

    ok_count = sum(1 for item in results if item.ok)
    return SshKeyDeployResponse(
        total=len(results),
        ok=ok_count,
        failed=len(results) - ok_count,
        results=results,
    )
