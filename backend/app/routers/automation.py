from fastapi import APIRouter, Depends, HTTPException, WebSocket
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, ensure_server_access, get_current_user
from app.db import SessionLocal
from app.models import Server, ServerGroup, User
from app.schemas import (
    AutomationPresetRead,
    AutomationRunRequest,
    BulkCommandResponse,
    CommandExecutionResult,
)
from app.services.audit import write_audit_log
from app.services.auth_state import validate_user_session
from app.services.automation import get_automation_preset, list_automation_presets, render_automation_commands
from app.services.notification_settings import get_or_create_notification_settings
from app.services.ssh import execute_commands, stream_command_on_server
from app.services.telegram import send_telegram_message, telegram_is_configured

router = APIRouter(prefix="/automation", tags=["automation"])


def collect_target_servers(db: Session, group_id: int | None, server_ids: list[int]) -> list[Server]:
    query = db.query(Server)
    collected_servers: list[Server] = []
    seen_ids: set[int] = set()

    if group_id:
        group = db.get(ServerGroup, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена.")
        for server in query.filter(Server.group_id == group_id).all():
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if server_ids:
        for server in query.filter(Server.id.in_(server_ids)).all():
            if server.id not in seen_ids:
                collected_servers.append(server)
                seen_ids.add(server.id)

    if not collected_servers:
        raise HTTPException(status_code=400, detail="Не выбраны серверы для автоматизации.")

    return collected_servers


@router.get("/presets", response_model=list[AutomationPresetRead])
def get_presets(_: object = Depends(get_current_user)):
    return list_automation_presets()


@router.post("/run", response_model=BulkCommandResponse)
def run_preset(
    payload: AutomationRunRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "automation")
    ensure_action_access(current_user, "automation_run")
    try:
        preset = get_automation_preset(payload.preset_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Сценарий автоматизации не найден.") from exc

    servers = collect_target_servers(db, payload.group_id, payload.server_ids)
    for server in servers:
        ensure_server_access(current_user, server)
    commands = render_automation_commands(preset.commands, payload.custom_env)

    results: list[CommandExecutionResult] = []
    for server in servers:
        try:
            results.extend(execute_commands(server, commands))
        except Exception as exc:
            results.append(
                CommandExecutionResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=False,
                    command="; ".join(commands),
                    stdout="",
                    stderr=str(exc),
                )
            )

    write_audit_log(
        db,
        user=current_user,
        action="automation.run",
        target_type="servers",
        target_id=",".join(str(server.id) for server in servers),
        details=preset.key,
    )
    profile = get_or_create_notification_settings(db)
    if profile.notify_automation_failed and telegram_is_configured(db) and any(not result.ok for result in results):
        try:
            failed = [result for result in results if not result.ok]
            lines = [
                settings.app_display_name,
                f"Ошибка автоматизации: {preset.name}",
                f"Неуспешных шагов: {len(failed)}",
            ]
            for item in failed[:10]:
                lines.append(f"- {item.server_name}: {item.command}")
            send_telegram_message("\n".join(lines), db)
        except Exception:
            pass
    return BulkCommandResponse(results=results)


@router.websocket("/ws/run")
async def run_preset_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
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

    try:
        email = payload.get("sub")
        session_token_id = payload.get("sid")
        if not email:
            await websocket.send_json({"type": "error", "message": "Токен не содержит пользователя."})
            await websocket.close(code=4401)
            return

        user = db.query(User).filter(User.email == email).first()
        validate_user_session(db, session_token_id)
        if not user:
            await websocket.send_json({"type": "error", "message": "Пользователь не найден."})
            await websocket.close(code=4403)
            return

        raw_payload = await websocket.receive_json()
        request_payload = AutomationRunRequest.model_validate(raw_payload)
        ensure_section_access(user, "automation")
        ensure_action_access(user, "automation_run")

        try:
            preset = get_automation_preset(request_payload.preset_key)
        except KeyError:
            await websocket.send_json({"type": "error", "message": "Сценарий автоматизации не найден."})
            await websocket.close(code=4404)
            return

        servers = collect_target_servers(db, request_payload.group_id, request_payload.server_ids)
        for server in servers:
            ensure_server_access(user, server)
        commands = render_automation_commands(preset.commands, request_payload.custom_env)

        await websocket.send_json(
            {
                "type": "run_started",
                "preset_key": preset.key,
                "preset_name": preset.name,
                "server_count": len(servers),
                "command_count": len(commands),
            }
        )

        results: list[CommandExecutionResult] = []
        for server in servers:
            await websocket.send_json(
                {
                    "type": "server_started",
                    "server_id": server.id,
                    "server_name": server.name,
                }
            )
            server_failed = False

            for index, command in enumerate(commands, start=1):
                await websocket.send_json(
                    {
                        "type": "command_started",
                        "server_id": server.id,
                        "server_name": server.name,
                        "step": index,
                        "command": command,
                    }
                )
                stdout_chunks: list[str] = []
                stderr_chunks: list[str] = []
                exit_code = 1

                try:
                    for event_type, payload_item in stream_command_on_server(server, command, timeout=3600):
                        if event_type == "stdout":
                            stdout_chunks.append(str(payload_item))
                            await websocket.send_json(
                                {
                                    "type": "command_output",
                                    "stream": "stdout",
                                    "server_id": server.id,
                                    "server_name": server.name,
                                    "command": command,
                                    "chunk": str(payload_item),
                                }
                            )
                        elif event_type == "stderr":
                            stderr_chunks.append(str(payload_item))
                            await websocket.send_json(
                                {
                                    "type": "command_output",
                                    "stream": "stderr",
                                    "server_id": server.id,
                                    "server_name": server.name,
                                    "command": command,
                                    "chunk": str(payload_item),
                                }
                            )
                        elif event_type == "exit":
                            exit_code = int(payload_item)
                except Exception as exc:
                    stderr_chunks.append(str(exc))
                    exit_code = 1

                result = CommandExecutionResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=exit_code == 0,
                    command=command,
                    stdout="".join(stdout_chunks).strip(),
                    stderr="".join(stderr_chunks).strip(),
                )
                results.append(result)
                await websocket.send_json(
                    {
                        "type": "command_finished",
                        "server_id": server.id,
                        "server_name": server.name,
                        "command": command,
                        "ok": result.ok,
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                    }
                )

                if exit_code != 0:
                    server_failed = True
                    break

            await websocket.send_json(
                {
                    "type": "server_finished",
                    "server_id": server.id,
                    "server_name": server.name,
                    "ok": not server_failed,
                }
            )

        write_audit_log(
            db,
            user=user,
            action="automation.run_stream",
            target_type="servers",
            target_id=",".join(str(server.id) for server in servers),
            details=preset.key,
        )
        profile = get_or_create_notification_settings(db)
        if profile.notify_automation_failed and telegram_is_configured(db) and any(not result.ok for result in results):
            try:
                failed = [result for result in results if not result.ok]
                lines = [
                    settings.app_display_name,
                    f"Ошибка автоматизации: {preset.name}",
                    f"Неуспешных шагов: {len(failed)}",
                ]
                for item in failed[:10]:
                    lines.append(f"- {item.server_name}: {item.command}")
                send_telegram_message("\n".join(lines), db)
            except Exception:
                pass
        await websocket.send_json(
            {
                "type": "run_finished",
                "results": [result.model_dump() for result in results],
            }
        )
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
    finally:
        db.close()
