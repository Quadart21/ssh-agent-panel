import asyncio
import json
from pathlib import Path

import paramiko
from fastapi import WebSocket

from app.core.security import decrypt_secret
from app.models import Server


class SSHWebTerminalSession:
    def __init__(self, server: Server, run_as_user: str | None = None):
        self.server = server
        self.run_as_user = run_as_user.strip() if run_as_user else None
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.channel: paramiko.Channel | None = None

    def connect(self, cols: int = 120, rows: int = 32) -> None:
        if not self.server.password_enc and not self.server.key_path:
            raise RuntimeError("This server has no password or SSH key configured.")

        kwargs: dict[str, object] = {
            "hostname": self.server.ip,
            "port": self.server.port,
            "username": self.server.login,
            "timeout": 8,
            "banner_timeout": 8,
            "auth_timeout": 8,
            "look_for_keys": False,
            "allow_agent": False,
        }

        if self.server.password_enc:
            kwargs["password"] = decrypt_secret(self.server.password_enc)

        if self.server.key_path:
            key_path = Path(self.server.key_path)
            if not key_path.exists():
                raise RuntimeError(f"SSH key not found: {key_path}")
            kwargs["key_filename"] = str(key_path)

        self.client.connect(**kwargs)
        transport = self.client.get_transport()
        if transport is None:
            raise RuntimeError("SSH transport is unavailable.")

        self.channel = transport.open_session()
        self.channel.get_pty(term="xterm-256color", width=cols, height=rows)
        self.channel.invoke_shell()
        self.channel.settimeout(0.0)
        self._switch_user_if_needed()

    def resize(self, cols: int, rows: int) -> None:
        if self.channel is not None:
            self.channel.resize_pty(width=max(cols, 40), height=max(rows, 12))

    def send(self, data: str) -> None:
        if self.channel is not None:
            self.channel.send(data)

    def recv(self, size: int = 4096) -> str:
        if self.channel is None:
            return ""
        if self.channel.recv_ready():
            return self.channel.recv(size).decode("utf-8", errors="ignore")
        return ""

    def is_active(self) -> bool:
        return self.channel is not None and not self.channel.closed

    def close(self) -> None:
        if self.channel is not None:
            self.channel.close()
        self.client.close()

    def _switch_user_if_needed(self) -> None:
        if self.channel is None or not self.run_as_user or self.run_as_user == self.server.login:
            return

        escaped_user = self.run_as_user.replace("'", "'\"'\"'")
        if self.server.login == "root":
            self.channel.send(f"su - {escaped_user}\n")
        else:
            self.channel.send(f"sudo -iu {escaped_user}\n")


async def bridge_terminal(websocket: WebSocket, session: SSHWebTerminalSession) -> None:
    async def stream_output() -> None:
        while session.is_active():
            chunk = await asyncio.to_thread(session.recv)
            if chunk:
                await websocket.send_text(chunk)
            else:
                await asyncio.sleep(0.03)

    async def stream_input() -> None:
        while True:
            raw_message = await websocket.receive_text()
            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                await asyncio.to_thread(session.send, raw_message)
                continue

            message_type = payload.get("type")
            if message_type == "input":
                await asyncio.to_thread(session.send, str(payload.get("data", "")))
            elif message_type == "resize":
                cols = int(payload.get("cols", 120))
                rows = int(payload.get("rows", 32))
                await asyncio.to_thread(session.resize, cols, rows)
            elif message_type == "ping":
                await websocket.send_text("")

    output_task = asyncio.create_task(stream_output())
    input_task = asyncio.create_task(stream_input())

    done, pending = await asyncio.wait({output_task, input_task}, return_when=asyncio.FIRST_COMPLETED)

    for task in pending:
        task.cancel()

    for task in done:
        exc = task.exception()
        if exc:
            raise exc
