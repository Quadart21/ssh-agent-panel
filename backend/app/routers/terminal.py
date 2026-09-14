import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.db import SessionLocal
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access
from app.models import Server, User
from app.services.audit import write_audit_log
from app.services.auth_state import validate_user_session
from app.services.terminal import SSHWebTerminalSession, bridge_terminal

router = APIRouter(prefix="/terminal", tags=["terminal"])


def _query_int(websocket: WebSocket, name: str, default: int) -> int:
    raw = websocket.query_params.get(name)
    if raw is None or raw == "":
        return default
    try:
        return max(int(raw), 1)
    except ValueError:
        return default


@router.websocket("/ws/{server_id}")
async def terminal_websocket(websocket: WebSocket, server_id: int):
    token = websocket.query_params.get("token")
    run_as_user = websocket.query_params.get("as_user")
    cols = _query_int(websocket, "cols", 120)
    rows = _query_int(websocket, "rows", 32)

    if not token:
        await websocket.close(code=4401)
        return

    try:
        payload = decode_access_token(token)
    except ValueError:
        await websocket.close(code=4401)
        return

    await websocket.accept()

    db = SessionLocal()
    session: SSHWebTerminalSession | None = None

    try:
        email = payload.get("sub")
        session_token_id = payload.get("sid")
        if not email:
            await websocket.send_text("Токен не содержит пользователя.\r\n")
            await websocket.close(code=4401)
            return

        user = db.query(User).filter(User.email == email).first()
        validate_user_session(db, session_token_id)
        server = db.get(Server, server_id)
        if not server:
            await websocket.send_text("Сервер не найден.\r\n")
            await websocket.close(code=4404)
            return
        if not user:
            await websocket.send_text("Пользователь не найден.\r\n")
            await websocket.close(code=4401)
            return

        try:
            ensure_section_access(user, "terminal")
            ensure_action_access(user, "terminal_use")
            ensure_server_access(user, server)
        except Exception as exc:
            detail = getattr(exc, "detail", None) or str(exc)
            await websocket.send_text(f"{detail}\r\n")
            await websocket.close(code=4403)
            return

        session = SSHWebTerminalSession(server, run_as_user=run_as_user)
        await asyncio.to_thread(session.connect, cols, rows)

        target_login = run_as_user.strip() if run_as_user else server.login
        write_audit_log(
            db,
            user=user,
            action="terminal.connect",
            target_type="server",
            target_id=str(server.id),
            details=f"{server.name} as {target_login}",
        )
        await websocket.send_text(
            f"Подключено к {server.name} ({server.ip}:{server.port}) как {target_login}.\r\n"
        )
        await bridge_terminal(websocket, session)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_text(f"\r\n[ошибка терминала] {exc}\r\n")
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if session is not None:
            await asyncio.to_thread(session.close)
        db.close()
