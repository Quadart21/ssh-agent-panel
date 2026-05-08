from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    AlertNotificationState,
    CommandPattern,
    LoginThrottleState,
    NotificationSettings,
    Server,
    ServerGroup,
    User,
    UserSession,
    UserTwoFactor,
)


def _row_to_dict(row: Any, fields: list[str]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for field in fields:
        value = getattr(row, field)
        if isinstance(value, datetime):
            data[field] = value.isoformat()
        else:
            data[field] = value
    return data


def build_backup_payload(db: Session) -> dict[str, Any]:
    return {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "groups": [_row_to_dict(item, ["id", "name", "description", "created_at", "updated_at"]) for item in db.query(ServerGroup).all()],
        "servers": [
            _row_to_dict(
                item,
                ["id", "name", "ip", "port", "login", "password_enc", "key_path", "pay_until", "group_id", "notes", "created_at", "updated_at"],
            )
            for item in db.query(Server).all()
        ],
        "patterns": [_row_to_dict(item, ["id", "name", "commands", "description", "created_at", "updated_at"]) for item in db.query(CommandPattern).all()],
        "users": [
            _row_to_dict(
                item,
                [
                    "id",
                    "email",
                    "full_name",
                    "password_hash",
                    "role",
                    "is_active",
                    "section_permissions",
                    "action_permissions",
                    "allowed_server_ids",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in db.query(User).all()
        ],
        "user_two_factor": [
            _row_to_dict(item, ["id", "user_id", "secret_enc", "is_enabled", "recovery_codes", "created_at", "updated_at"])
            for item in db.query(UserTwoFactor).all()
        ],
        "notification_settings": [
            _row_to_dict(
                item,
                [
                    "id",
                    "telegram_bot_token",
                    "telegram_chat_id",
                    "scheduler_enabled",
                    "scheduler_interval_seconds",
                    "alert_repeat_minutes",
                    "notify_login",
                    "notify_server_offline",
                    "notify_payment_expired",
                    "notify_payment_expiring",
                    "notify_automation_failed",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in db.query(NotificationSettings).all()
        ],
        "alert_states": [
            _row_to_dict(
                item,
                [
                    "id",
                    "fingerprint",
                    "category",
                    "server_id",
                    "title",
                    "message",
                    "is_active",
                    "first_seen_at",
                    "last_seen_at",
                    "last_sent_at",
                ],
            )
            for item in db.query(AlertNotificationState).all()
        ],
    }


def dump_backup_json(db: Session) -> str:
    return json.dumps(build_backup_payload(db), ensure_ascii=False, indent=2)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def restore_backup_payload(db: Session, payload: dict[str, Any]) -> None:
    db.query(UserSession).delete()
    db.query(LoginThrottleState).delete()
    db.query(AlertNotificationState).delete()
    db.query(UserTwoFactor).delete()
    db.query(NotificationSettings).delete()
    db.query(User).delete()
    db.query(CommandPattern).delete()
    db.query(Server).delete()
    db.query(ServerGroup).delete()
    db.commit()

    for item in payload.get("groups", []):
        db.add(
            ServerGroup(
                id=item["id"],
                name=item["name"],
                description=item.get("description"),
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    db.commit()

    for item in payload.get("servers", []):
        db.add(
            Server(
                id=item["id"],
                name=item["name"],
                ip=item["ip"],
                port=item["port"],
                login=item["login"],
                password_enc=item.get("password_enc"),
                key_path=item.get("key_path"),
                pay_until=_parse_datetime(item.get("pay_until")),
                group_id=item.get("group_id"),
                notes=item.get("notes"),
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    db.commit()

    for item in payload.get("patterns", []):
        db.add(
            CommandPattern(
                id=item["id"],
                name=item["name"],
                commands=item.get("commands") or [],
                description=item.get("description"),
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    db.commit()

    for item in payload.get("users", []):
        db.add(
            User(
                id=item["id"],
                email=item["email"],
                full_name=item["full_name"],
                password_hash=item["password_hash"],
                role=item["role"],
                is_active=bool(item["is_active"]),
                section_permissions=item.get("section_permissions") or [],
                action_permissions=item.get("action_permissions") or [],
                allowed_server_ids=item.get("allowed_server_ids") or [],
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    db.commit()

    for item in payload.get("user_two_factor", []):
        db.add(
            UserTwoFactor(
                id=item["id"],
                user_id=item["user_id"],
                secret_enc=item["secret_enc"],
                is_enabled=bool(item["is_enabled"]),
                recovery_codes=item.get("recovery_codes") or [],
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    for item in payload.get("notification_settings", []):
        db.add(
            NotificationSettings(
                id=item["id"],
                telegram_bot_token=item.get("telegram_bot_token"),
                telegram_chat_id=item.get("telegram_chat_id"),
                scheduler_enabled=bool(item["scheduler_enabled"]),
                scheduler_interval_seconds=int(item["scheduler_interval_seconds"]),
                alert_repeat_minutes=int(item["alert_repeat_minutes"]),
                notify_login=bool(item["notify_login"]),
                notify_server_offline=bool(item["notify_server_offline"]),
                notify_payment_expired=bool(item["notify_payment_expired"]),
                notify_payment_expiring=bool(item["notify_payment_expiring"]),
                notify_automation_failed=bool(item["notify_automation_failed"]),
                created_at=_parse_datetime(item.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime.utcnow(),
            )
        )
    for item in payload.get("alert_states", []):
        db.add(
            AlertNotificationState(
                id=item["id"],
                fingerprint=item["fingerprint"],
                category=item["category"],
                server_id=item.get("server_id"),
                title=item["title"],
                message=item["message"],
                is_active=bool(item["is_active"]),
                first_seen_at=_parse_datetime(item.get("first_seen_at")) or datetime.utcnow(),
                last_seen_at=_parse_datetime(item.get("last_seen_at")) or datetime.utcnow(),
                last_sent_at=_parse_datetime(item.get("last_sent_at")),
            )
        )
    db.commit()
