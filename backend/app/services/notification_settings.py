from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models import NotificationSettings


def get_or_create_notification_settings(db: Session) -> NotificationSettings:
    profile = db.query(NotificationSettings).first()
    if profile:
        return profile

    profile = NotificationSettings(
        telegram_bot_token=encrypt_secret(settings.telegram_bot_token or None),
        telegram_chat_id=settings.telegram_chat_id or None,
        scheduler_enabled=settings.scheduler_enabled,
        scheduler_interval_seconds=settings.scheduler_interval_seconds,
        alert_repeat_minutes=settings.alert_repeat_minutes,
        notify_login=True,
        notify_server_offline=True,
        notify_payment_expired=True,
        notify_payment_expiring=True,
        notify_automation_failed=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def telegram_credentials(profile: NotificationSettings | None) -> tuple[str, str]:
    token_value = decrypt_secret(profile.telegram_bot_token) if profile and profile.telegram_bot_token is not None else settings.telegram_bot_token
    token = (token_value or "").strip()
    chat_id = (profile.telegram_chat_id if profile and profile.telegram_chat_id is not None else settings.telegram_chat_id).strip()
    return token, chat_id


def visible_notification_token(profile: NotificationSettings | None) -> str | None:
    if not profile or not profile.telegram_bot_token:
        return None
    return decrypt_secret(profile.telegram_bot_token)
