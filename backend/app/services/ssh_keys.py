import io
from dataclasses import dataclass

import paramiko
from paramiko import Ed25519Key, PKey, RSAKey

from app.core.security import decrypt_secret, encrypt_secret
from app.models import Server


@dataclass
class GeneratedSshKeypair:
    private_pem: str
    public_line: str
    fingerprint: str


def load_private_key(private_pem: str) -> PKey:
    buffer = io.StringIO(private_pem)
    try:
        return Ed25519Key.from_private_key(buffer)
    except paramiko.SSHException:
        buffer.seek(0)
        return RSAKey.from_private_key(buffer)


def generate_ssh_keypair(comment: str) -> GeneratedSshKeypair:
    key = Ed25519Key.generate()
    private_io = io.StringIO()
    key.write_private_key(private_io)
    public_line = f"{key.get_name()} {key.get_base64()} {comment}"
    digest = key.get_fingerprint()
    if isinstance(digest, bytes):
        fingerprint = ":".join(f"{byte:02x}" for byte in digest)
    else:
        fingerprint = str(digest)
    return GeneratedSshKeypair(
        private_pem=private_io.getvalue(),
        public_line=public_line.strip(),
        fingerprint=fingerprint,
    )


def resolve_server_private_key(server: Server) -> str | None:
    if server.private_key_enc:
        return decrypt_secret(server.private_key_enc)
    return None


def server_has_key_auth(server: Server) -> bool:
    return bool(server.private_key_enc or server.key_path)


def server_has_password_auth(server: Server) -> bool:
    return bool(server.password_enc)


def resolve_auth_method(server: Server) -> str:
    if server_has_key_auth(server):
        return "key"
    if server_has_password_auth(server):
        return "password"
    return "none"


def build_public_key_install_command(public_line: str) -> str:
    quoted = public_line.replace("'", "'\"'\"'")
    return (
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && "
        f"grep -qxF '{quoted}' ~/.ssh/authorized_keys 2>/dev/null || "
        f"echo '{quoted}' >> ~/.ssh/authorized_keys && "
        "chmod 600 ~/.ssh/authorized_keys"
    )


def install_public_key_on_server(server: Server, public_line: str) -> None:
    from app.services.ssh import build_ssh_client

    password = decrypt_secret(server.password_enc) if server.password_enc else None
    private_pem = resolve_server_private_key(server)
    if not password and not private_pem and not server.key_path:
        raise ValueError("Для установки ключа нужен пароль или SSH-ключ.")

    client = build_ssh_client(
        host=server.ip,
        port=server.port,
        username=server.login,
        password=password,
        key_path=server.key_path,
        private_key_pem=private_pem,
    )
    try:
        command = build_public_key_install_command(public_line)
        stdin, stdout, stderr = client.exec_command(command, timeout=20)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            detail = stderr.read().decode("utf-8", errors="ignore").strip() or stdout.read().decode("utf-8", errors="ignore").strip()
            raise RuntimeError(detail or "Не удалось записать authorized_keys.")
        stdin.close()
    finally:
        client.close()


def verify_key_auth(server: Server, private_pem: str) -> None:
    from app.services.ssh import build_ssh_client

    client = build_ssh_client(
        host=server.ip,
        port=server.port,
        username=server.login,
        private_key_pem=private_pem,
    )
    client.close()


def convert_server_to_key_auth(server: Server) -> GeneratedSshKeypair:
    if server_has_key_auth(server):
        raise ValueError("На сервере уже настроен вход по ключу.")
    if not server.password_enc:
        raise ValueError("Для перевода на ключ нужен пароль SSH.")

    keypair = generate_ssh_keypair(f"panel-{server.name}")
    install_public_key_on_server(server, keypair.public_line)
    verify_key_auth(server, keypair.private_pem)
    return keypair


def key_fingerprint_for_server(server: Server) -> str | None:
    private_pem = resolve_server_private_key(server)
    if not private_pem:
        return None
    digest = load_private_key(private_pem).get_fingerprint()
    if isinstance(digest, bytes):
        return ":".join(f"{byte:02x}" for byte in digest)
    return str(digest)


def persist_server_keypair(server: Server, keypair: GeneratedSshKeypair) -> None:
    server.private_key_enc = encrypt_secret(keypair.private_pem)
    server.ssh_public_key = keypair.public_line
    server.panel_key_fingerprint = None
    server.panel_key_deployed_at = None
    server.password_enc = None
    server.key_path = None


def build_ssh_command(server: Server, *, with_key_file = False) -> str:
    port_part = f" -p {server.port}" if server.port != 22 else ""
    base = f"ssh{port_part} {server.login}@{server.ip}"
    if with_key_file:
        return f"ssh -i panel-{server.id}.pem{port_part} {server.login}@{server.ip}"
    return base


def build_server_access_read(server: Server) -> "ServerAccessRead":
    from app.schemas import ServerAccessRead

    auth_method = resolve_auth_method(server)
    private_pem = resolve_server_private_key(server)
    password = decrypt_secret(server.password_enc) if server.password_enc else None
    fingerprint = key_fingerprint_for_server(server)
    ssh_command = build_ssh_command(server)
    ssh_with_key = build_ssh_command(server, with_key_file=True) if private_pem else None
    return ServerAccessRead(
        server_id=server.id,
        server_name=server.name,
        ip=server.ip,
        port=server.port,
        login=server.login,
        auth_method=auth_method,
        password=password,
        private_key=private_pem,
        public_key=server.ssh_public_key,
        key_fingerprint=fingerprint,
        ssh_command=ssh_command,
        ssh_command_with_key=ssh_with_key,
    )
