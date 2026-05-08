import json
from urllib import error, request

from sqlalchemy.orm import Session

from app.services.notification_settings import get_or_create_notification_settings, telegram_credentials


def telegram_is_configured(db: Session | None = None) -> bool:
    if db is not None:
        profile = get_or_create_notification_settings(db)
        token, chat_id = telegram_credentials(profile)
        return bool(token and chat_id)
    from app.core.config import settings

    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def send_telegram_message(text: str, db: Session | None = None) -> None:
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
    payload = json.dumps(
        {
            "chat_id": chat_id,
            "text": text,
        }
    ).encode("utf-8")

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
