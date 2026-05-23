import json
from datetime import datetime, timezone
from html import escape
from typing import Any
from urllib import error, request

from sqlalchemy.orm import Session

from app.models import NotificationSettings
from app.services.notification_settings import get_or_create_notification_settings, telegram_credentials


def telegram_is_configured(db: Session | None = None) -> bool:
    if db is not None:
        profile = get_or_create_notification_settings(db)
        token, chat_id = telegram_credentials(profile)
        return bool(token and chat_id)
    from app.core.config import settings

    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def format_telegram_message(
    title: str,
    *,
    icon: str = "🔔",
    facts: list[tuple[str, str]] | None = None,
    lines: list[str] | None = None,
) -> str:
    from app.core.config import settings

    rendered_lines = [
        f"<b>{escape(icon)} {escape(settings.app_display_name)}</b>",
        f"<b>{escape(title)}</b>",
    ]
    for label, value in facts or []:
        rendered_lines.append(f"• <b>{escape(label)}:</b> {escape(value)}")
    for line in lines or []:
        rendered_lines.append(f"• {escape(line)}")
    rendered_lines.append(
        f"<i>Время: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</i>"
    )
    return "\n".join(rendered_lines)


def resolve_telegram_topic_id(profile: NotificationSettings | None, event_type: str | None = None) -> int | None:
    if not profile:
        return None
    mapping = {
        "login": profile.telegram_topic_login,
        "server_offline": profile.telegram_topic_servers,
        "payment_expired": profile.telegram_topic_payments,
        "payment_expiring": profile.telegram_topic_payments,
        "payment_notice_7d": profile.telegram_topic_payments,
        "payment_notice_3d": profile.telegram_topic_payments,
        "payment_overdue": profile.telegram_topic_payments,
        "automation_failed": profile.telegram_topic_automation,
        "alerts_digest": profile.telegram_topic_general,
        "test": profile.telegram_topic_general,
    }
    scoped = mapping.get((event_type or "").strip().lower())
    return scoped if scoped else profile.telegram_topic_general


def _resolve_credentials(db: Session | None) -> tuple[str, str]:
    if db is not None:
        profile = get_or_create_notification_settings(db)
        return telegram_credentials(profile)
    from app.core.config import settings

    return settings.telegram_bot_token, settings.telegram_chat_id


def telegram_api_request(token: str, method: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8", errors="ignore")
            if response.status >= 400:
                raise RuntimeError(raw or "Telegram API вернул ошибку.")
    except error.URLError as exc:
        raise RuntimeError(f"Не удалось выполнить запрос к Telegram: {exc}") from exc

    result = json.loads(raw)
    if not result.get("ok"):
        raise RuntimeError(result.get("description") or "Telegram API вернул ошибку.")
    return result


def send_telegram_message(
    text: str,
    db: Session | None = None,
    parse_mode: str | None = None,
    topic_id: int | None = None,
    reply_markup: dict[str, Any] | None = None,
) -> int | None:
    token, chat_id = _resolve_credentials(db)
    if not token or not chat_id:
        return None

    payload_data: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if parse_mode:
        payload_data["parse_mode"] = parse_mode
    if topic_id:
        payload_data["message_thread_id"] = int(topic_id)
    if reply_markup:
        payload_data["reply_markup"] = reply_markup

    result = telegram_api_request(token, "sendMessage", payload_data)
    message = result.get("result") or {}
    return message.get("message_id")


def answer_callback_query(
    callback_query_id: str,
    *,
    db: Session | None = None,
    text: str | None = None,
    show_alert: bool = False,
) -> None:
    token, _ = _resolve_credentials(db)
    if not token:
        return
    payload: dict[str, Any] = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
        payload["show_alert"] = show_alert
    telegram_api_request(token, "answerCallbackQuery", payload)


def edit_telegram_message(
    chat_id: str,
    message_id: int,
    text: str,
    *,
    db: Session | None = None,
    parse_mode: str | None = None,
    reply_markup: dict[str, Any] | None = None,
) -> None:
    token, _ = _resolve_credentials(db)
    if not token:
        return
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    telegram_api_request(token, "editMessageText", payload)


def get_telegram_webhook_info(db: Session | None = None) -> dict[str, Any]:
    token, _ = _resolve_credentials(db)
    if not token:
        return {}
    result = telegram_api_request(token, "getWebhookInfo", {})
    return result.get("result") or {}


def set_telegram_webhook(webhook_url: str, db: Session | None = None) -> None:
    token, _ = _resolve_credentials(db)
    if not token:
        raise RuntimeError("Telegram не настроен.")
    telegram_api_request(
        token,
        "setWebhook",
        {
            "url": webhook_url,
            "allowed_updates": ["callback_query"],
        },
    )


def delete_telegram_webhook(db: Session | None = None) -> None:
    token, _ = _resolve_credentials(db)
    if not token:
        raise RuntimeError("Telegram не настроен.")
    telegram_api_request(token, "deleteWebhook", {"drop_pending_updates": False})
