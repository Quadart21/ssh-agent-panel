from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user, require_admin
from app.schemas import NotificationSettingsRead, NotificationSettingsUpdate, TelegramStatusRead, TmuxActionResponse
from app.services.alerts import collect_server_alerts, filter_alerts_by_preferences
from app.services.audit import write_audit_log
from app.services.notification_settings import get_or_create_notification_settings, visible_notification_token
from app.services.telegram import send_telegram_message, telegram_is_configured
from app.core.security import encrypt_secret

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/settings", response_model=NotificationSettingsRead)
def get_notification_settings(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    profile = get_or_create_notification_settings(db)
    return NotificationSettingsRead(
        telegram_bot_token=visible_notification_token(profile),
        telegram_chat_id=profile.telegram_chat_id or None,
        configured=telegram_is_configured(db),
        scheduler_enabled=profile.scheduler_enabled,
        scheduler_interval_seconds=profile.scheduler_interval_seconds,
        alert_repeat_minutes=profile.alert_repeat_minutes,
        notify_login=profile.notify_login,
        notify_server_offline=profile.notify_server_offline,
        notify_payment_expired=profile.notify_payment_expired,
        notify_payment_expiring=profile.notify_payment_expiring,
        notify_automation_failed=profile.notify_automation_failed,
    )


@router.put("/settings", response_model=NotificationSettingsRead)
def update_notification_settings(
    payload: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    profile = get_or_create_notification_settings(db)
    for field, value in payload.model_dump().items():
        if field == "telegram_bot_token":
            value = encrypt_secret(value)
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    write_audit_log(db, user=current_user, action="notifications.settings.update", target_type="system", target_id="notifications")
    return NotificationSettingsRead(
        telegram_bot_token=visible_notification_token(profile),
        telegram_chat_id=profile.telegram_chat_id or None,
        configured=telegram_is_configured(db),
        scheduler_enabled=profile.scheduler_enabled,
        scheduler_interval_seconds=profile.scheduler_interval_seconds,
        alert_repeat_minutes=profile.alert_repeat_minutes,
        notify_login=profile.notify_login,
        notify_server_offline=profile.notify_server_offline,
        notify_payment_expired=profile.notify_payment_expired,
        notify_payment_expiring=profile.notify_payment_expiring,
        notify_automation_failed=profile.notify_automation_failed,
    )


@router.get("/telegram/status", response_model=TelegramStatusRead)
def telegram_status_compat(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    profile = get_or_create_notification_settings(db)
    return TelegramStatusRead(
        configured=telegram_is_configured(db),
        chat_id=profile.telegram_chat_id or None,
    )


@router.post("/telegram/test", response_model=TmuxActionResponse)
def send_test_telegram(
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    if not telegram_is_configured(db):
        raise HTTPException(status_code=400, detail="Telegram не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.")

    message = f"{settings.app_display_name}\nТестовое уведомление Telegram успешно отправлено."
    try:
        send_telegram_message(message, db)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(db, user=current_user, action="telegram.test", target_type="system", target_id="telegram")
    return TmuxActionResponse(ok=True, message="Тестовое уведомление отправлено в Telegram.")


@router.post("/telegram/alerts", response_model=TmuxActionResponse)
def send_alerts_to_telegram(
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    profile = get_or_create_notification_settings(db)
    if not telegram_is_configured(db):
        raise HTTPException(status_code=400, detail="Telegram не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.")

    alerts = filter_alerts_by_preferences(collect_server_alerts(db), profile)
    if not alerts:
        message = f"{settings.app_display_name}\nАктивных алертов сейчас нет."
    else:
        lines = [settings.app_display_name, f"Активных алертов: {len(alerts)}"]
        for alert in alerts[:20]:
            lines.append(f"- {alert.title}: {alert.message}")
        message = "\n".join(lines)

    try:
        send_telegram_message(message, db)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(db, user=current_user, action="telegram.alerts", target_type="system", target_id="telegram")
    return TmuxActionResponse(ok=True, message="Текущие алерты отправлены в Telegram.")
