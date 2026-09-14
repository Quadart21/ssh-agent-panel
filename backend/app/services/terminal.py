import asyncio
import json
import select
import time
from pathlib import Path

import paramiko
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.core.security import decrypt_secret
from app.models import Server
from app.services.ssh_keys import load_private_key, resolve_server_private_key


class SSHWebTerminalSession:
    """Interactive SSH shell bridged to a browser WebSocket."""

    def __init__(self, server: Server, run_as_user: str | None = None):
        self.server = server
        self.run_as_user = run_as_user.strip() if run_as_user else None
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.channel: paramiko.Channel | None = None

    def connect(self, cols: int = 120, rows: int = 32) -> None:
        if not self.server.password_enc and not self.server.key_path and not self.server.private_key_enc:
            raise RuntimeError("Для сервера не задан пароль или SSH-ключ.")

        kwargs: dict[str, object] = {
            "hostname": self.server.ip,
            "port": self.server.port,
            "username": self.server.login,
            "timeout": 10,
            "banner_timeout": 10,
            "auth_timeout": 10,
            "look_for_keys": False,
            "allow_agent": False,
        }

        private_pem = resolve_server_private_key(self.server)
        if private_pem:
            kwargs["pkey"] = load_private_key(private_pem)
        elif self.server.password_enc:
            kwargs["password"] = decrypt_secret(self.server.password_enc)
        elif self.server.key_path:
            key_path = Path(self.server.key_path)
            if not key_path.exists():
                raise RuntimeError(f"SSH-ключ не найден: {key_path}")
            kwargs["key_filename"] = str(key_path)

        self.client.connect(**kwargs)
        transport = self.client.get_transport()
        if transport is None:
            raise RuntimeError("SSH transport недоступен.")

        self.channel = transport.open_session()
        self.channel.get_pty(
            term="xterm-256color",
            width=max(cols, 40),
            height=max(rows, 12),
        )
        self.channel.invoke_shell()
        self.channel.settimeout(0.0)
        self._switch_user_if_needed()

    def resize(self, cols: int, rows: int) -> None:
        if self.channel is not None:
            self.channel.resize_pty(width=max(cols, 40), height=max(rows, 12))

    def send(self, data: str) -> None:
        if self.channel is not None and data:
            self.channel.send(data)

    def recv_bytes(self, size: int = 8192) -> bytes:
        if self.channel is None:
            return b""
        if self.channel.recv_ready():
            return self.channel.recv(size)
        if self.channel.recv_stderr_ready():
            return self.channel.recv_stderr(size)
        return b""

    def wait_readable(self, timeout: float = 0.2) -> bool:
        """Block briefly until channel has data or timeout. Returns True if readable."""
        if self.channel is None:
            return False
        if self.channel.recv_ready() or self.channel.recv_stderr_ready():
            return True
        if self.channel.closed or self.channel.exit_status_ready():
            return False
        try:
            readable, _, _ = select.select([self.channel], [], [], timeout)
            return bool(readable)
        except (OSError, ValueError, TypeError):
            # Some Paramiko channel objects are not select-able on all platforms.
            time.sleep(min(timeout, 0.05))
            return bool(self.channel and (self.channel.recv_ready() or self.channel.recv_stderr_ready()))

    def is_active(self) -> bool:
        if self.channel is None:
            return False
        if self.channel.closed:
            return False
        transport = self.client.get_transport()
        if transport is None or not transport.is_active():
            return False
        return True

    def close(self) -> None:
        try:
            if self.channel is not None:
                self.channel.close()
        finally:
            self.client.close()

    def _switch_user_if_needed(self) -> None:
        if self.channel is None or not self.run_as_user or self.run_as_user == self.server.login:
            return

        escaped_user = self.run_as_user.replace("'", "'\"'\"'")
        if self.server.login == "root":
            self.channel.send(f"su - '{escaped_user}'\n")
        else:
            self.channel.send(f"sudo -iu '{escaped_user}'\n")


async def _ws_open(websocket: WebSocket) -> bool:
    return websocket.client_state == WebSocketState.CONNECTED


async def bridge_terminal(websocket: WebSocket, session: SSHWebTerminalSession) -> None:
    """Bidirectional bridge: browser ↔ SSH PTY.

    Protocol (client → server): JSON text frames
      {"type":"input","data":"..."} | {"type":"resize","cols":N,"rows":N} | {"type":"ping"}

    Protocol (server → client):
      text frames = PTY output (utf-8)
      text JSON   = control only for {"type":"pong"} / {"type":"status",...}
    """

    async def stream_output() -> None:
        while session.is_active() and await _ws_open(websocket):
            ready = await asyncio.to_thread(session.wait_readable, 0.25)
            if not ready:
                if not session.is_active():
                    break
                continue
            chunk = await asyncio.to_thread(session.recv_bytes)
            if chunk:
                await websocket.send_text(chunk.decode("utf-8", errors="ignore"))

    async def stream_input() -> None:
        while await _ws_open(websocket):
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            text = message.get("text")
            raw = message.get("bytes")
            if raw is not None and not text:
                await asyncio.to_thread(session.send, raw.decode("utf-8", errors="ignore"))
                continue
            if text is None:
                continue

            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                await asyncio.to_thread(session.send, text)
                continue

            if not isinstance(payload, dict):
                await asyncio.to_thread(session.send, text)
                continue

            message_type = payload.get("type")
            if message_type == "input":
                await asyncio.to_thread(session.send, str(payload.get("data", "")))
            elif message_type == "resize":
                cols = int(payload.get("cols", 120))
                rows = int(payload.get("rows", 32))
                await asyncio.to_thread(session.resize, cols, rows)
            elif message_type == "ping":
                if await _ws_open(websocket):
                    await websocket.send_text(json.dumps({"type": "pong", "ts": time.time()}))
            else:
                # Unknown JSON — do not inject into the shell.
                continue

    output_task = asyncio.create_task(stream_output())
    input_task = asyncio.create_task(stream_input())

    try:
        done, pending = await asyncio.wait(
            {output_task, input_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
    finally:
        for task in (output_task, input_task):
            if not task.done():
                task.cancel()
