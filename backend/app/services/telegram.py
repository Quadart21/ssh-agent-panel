import json
from datetime import datetime, timezone
from html import escape
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
        "automation_failed": profile.telegram_topic_automation,
        "alerts_digest": profile.telegram_topic_general,
        "test": profile.telegram_topic_general,
    }
    scoped = mapping.get((event_type or "").strip().lower())
    return scoped if scoped else profile.telegram_topic_general


def send_telegram_message(
    text: str,
    db: Session | None = None,
    parse_mode: str | None = None,
    topic_id: int | None = None,
) -> None:
    if db is not None:
        profile = get_or_create_notification_settings(db)
        token, chat_id = telegram_credentials(profile)
    else:
        from app.core.config import settings

        token = settings.telegram_bot_token
        chat_id = settings.telegram_chat_id

    if not token or not chat_id:
        return

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload_data = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if parse_mode:
        payload_data["parse_mode"] = parse_mode
    if topic_id:
        payload_data["message_thread_id"] = int(topic_id)
    payload = json.dumps(payload_data).encode("utf-8")

    req = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8", errors="ignore")
            if response.status >= 400:
                raise RuntimeError(body or "Telegram API вернул ошибку.")
    except error.URLError as exc:
        raise RuntimeError(f"Не удалось отправить сообщение в Telegram: {exc}") from exc
