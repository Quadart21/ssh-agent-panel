from datetime import datetime

from sqlalchemy.orm import Session

from app.core.security import decrypt_secret, encrypt_secret
from app.models import PanelSshKey, Server
from app.services.ssh_keys import (
    GeneratedSshKeypair,
    generate_ssh_keypair,
    install_public_key_on_server,
    resolve_server_private_key,
    server_has_password_auth,
    verify_key_auth,
)


PANEL_KEY_ID = 1


def get_panel_ssh_key(db: Session) -> PanelSshKey | None:
    return db.get(PanelSshKey, PANEL_KEY_ID)


def panel_key_private_pem(db: Session) -> str | None:
    record = get_panel_ssh_key(db)
    if not record:
        return None
    return decrypt_secret(record.private_key_enc)


def generate_panel_ssh_key(db: Session) -> PanelSshKey:
    keypair = generate_ssh_keypair("panel-master")
    now = datetime.utcnow()
    record = get_panel_ssh_key(db)
    if record is None:
        record = PanelSshKey(
            id=PANEL_KEY_ID,
            private_key_enc="",
            public_key="",
            fingerprint="",
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    record.private_key_enc = encrypt_secret(keypair.private_pem)
    record.public_key = keypair.public_line
    record.fingerprint = keypair.fingerprint
    record.updated_at = now
    db.commit()
    db.refresh(record)
    return record


def resolve_binding_status(server: Server, panel_key: PanelSshKey | None) -> str:
    if panel_key and server.panel_key_fingerprint == panel_key.fingerprint:
        return "panel_bound"
    if server.panel_key_fingerprint:
        return "outdated"
    if server.private_key_enc or server.key_path:
        return "individual"
    if server.password_enc:
        return "unbound"
    return "no_access"


def can_deploy_panel_key(server: Server) -> bool:
    return bool(server.password_enc or server.private_key_enc or server.key_path)


def persist_panel_key_on_server(
    server: Server,
    keypair: GeneratedSshKeypair,
    panel_fingerprint: str,
    *,
    remove_password: bool,
) -> None:
    server.private_key_enc = encrypt_secret(keypair.private_pem)
    server.ssh_public_key = keypair.public_line
    server.panel_key_fingerprint = panel_fingerprint
    server.panel_key_deployed_at = datetime.utcnow()
    server.key_path = None
    if remove_password:
        server.password_enc = None


def deploy_panel_key_to_server(server: Server, panel_key: PanelSshKey, *, remove_password: bool) -> None:
    if not can_deploy_panel_key(server):
        raise ValueError("Нет SSH-доступа для установки ключа (нужен пароль или действующий ключ).")

    private_pem = decrypt_secret(panel_key.private_key_enc)
    keypair = GeneratedSshKeypair(
        private_pem=private_pem,
        public_line=panel_key.public_key,
        fingerprint=panel_key.fingerprint,
    )
    install_public_key_on_server(server, panel_key.public_key)
    verify_key_auth(server, private_pem)
    persist_panel_key_on_server(server, keypair, panel_key.fingerprint, remove_password=remove_password)


def binding_stats(servers: list[Server], panel_key: PanelSshKey | None) -> dict[str, int]:
    counts = {
        "panel_bound": 0,
        "unbound": 0,
        "outdated": 0,
        "individual": 0,
        "no_access": 0,
    }
    for server in servers:
        status = resolve_binding_status(server, panel_key)
        counts[status] = counts.get(status, 0) + 1
    return counts
