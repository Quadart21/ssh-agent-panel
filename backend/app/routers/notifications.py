from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.schemas import NotificationSettingsRead, NotificationSettingsUpdate, TelegramStatusRead, TmuxActionResponse
from app.services.alerts import collect_server_alerts, filter_alerts_by_preferences, format_alerts_for_telegram
from app.services.audit import write_audit_log
from app.services.notification_settings import get_or_create_notification_settings, visible_notification_token
from app.services.telegram import format_telegram_message, resolve_telegram_topic_id, send_telegram_message, telegram_is_configured
from app.core.security import encrypt_secret

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _build_test_notification(event_type: str) -> str:
    if event_type == "login":
        return format_telegram_message(
            "Вход в панель",
            icon="🔐",
            facts=[("Пользователь", "admin@panel.vrdx.pro"), ("IP", "203.0.113.10")],
            lines=["User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0"],
        )
    if event_type == "server_offline":
        return format_telegram_message(
            "Сервер недоступен",
            icon="🔴",
            facts=[("Сервер", "api-prod-01"), ("Категория", "server_offline")],
            lines=["Сервер не отвечает по SSH.", "Проверьте сеть, firewall и SSH daemon."],
        )
    if event_type == "payment_expired":
        return format_telegram_message(
            "Оплата просрочена",
            icon="💸",
            facts=[("Сервер", "db-main-01"), ("Категория", "payment_expired")],
            lines=["Срок оплаты истек.", "Продлите тариф, чтобы избежать отключения."],
        )
    if event_type == "payment_expiring":
        return format_telegram_message(
            "Оплата скоро истечет",
            icon="⏳",
            facts=[("Сервер", "worker-03"), ("Категория", "payment_expiring")],
            lines=["Срок оплаты истекает в ближайшие 3 дня."],
        )
    if event_type == "automation_failed":
        return format_telegram_message(
            "Ошибка автоматизации: Deploy Node App",
            icon="🤖",
            lines=[
                "Неуспешных шагов: 2",
                "api-prod-01: npm ci",
                "worker-03: pm2 restart app",
            ],
        )
    if event_type == "digest":
        return format_telegram_message(
            "Тестовая сводка алертов",
            icon="🚨",
            lines=[
                "Событий: 3",
                "🔴 Сервер недоступен — api-prod-01",
                "🟠 Оплата скоро истечет — worker-03",
                "🔴 Оплата просрочена — db-main-01",
            ],
        )
    raise HTTPException(status_code=404, detail="Неизвестный тип тестового уведомления.")


def _topic_event_for_alert_category(category: str) -> str:
    if category == "server_offline":
        return "server_offline"
    if category in {"payment_expired", "payment_expiring"}:
        return "payment_expiring"
    return "alerts_digest"


@router.get("/settings", response_model=NotificationSettingsRead)
def get_notification_settings(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    profile = get_or_create_notification_settings(db)
    return NotificationSettingsRead(
        telegram_bot_token=visible_notification_token(profile),
        telegram_chat_id=profile.telegram_chat_id or None,
        telegram_topic_general=profile.telegram_topic_general,
        telegram_topic_login=profile.telegram_topic_login,
        telegram_topic_servers=profile.telegram_topic_servers,
        telegram_topic_payments=profile.telegram_topic_payments,
        telegram_topic_automation=profile.telegram_topic_automation,
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
        telegram_topic_general=profile.telegram_topic_general,
        telegram_topic_login=profile.telegram_topic_login,
        telegram_topic_servers=profile.telegram_topic_servers,
        telegram_topic_payments=profile.telegram_topic_payments,
        telegram_topic_automation=profile.telegram_topic_automation,
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
    profile = get_or_create_notification_settings(db)
    if not telegram_is_configured(db):
        raise HTTPException(status_code=400, detail="Telegram не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.")

    try:
        send_telegram_message(
            format_telegram_message(
                "Тестовое уведомление",
                icon="✅",
                lines=["Telegram успешно подключен и готов к отправке сообщений."],
            ),
            db,
            parse_mode="HTML",
            topic_id=resolve_telegram_topic_id(profile, "test"),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(db, user=current_user, action="telegram.test", target_type="system", target_id="telegram")
    return TmuxActionResponse(ok=True, message="Тестовое уведомление отправлено в Telegram.")


@router.post("/telegram/test/{event_type}", response_model=TmuxActionResponse)
def send_typed_test_telegram(
    event_type: str,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_admin),
):
    if not telegram_is_configured(db):
        raise HTTPException(status_code=400, detail="Telegram не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.")
    try:
        profile = get_or_create_notification_settings(db)
        send_telegram_message(
            _build_test_notification(event_type),
            db,
            parse_mode="HTML",
            topic_id=resolve_telegram_topic_id(profile, event_type),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        user=current_user,
        action=f"telegram.test.{event_type}",
        target_type="system",
        target_id="telegram",
    )
    return TmuxActionResponse(ok=True, message=f"Тестовое уведомление '{event_type}' отправлено в Telegram.")


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
        message = format_telegram_message(
            "Сводка алертов",
            icon="🟢",
            lines=["Активных алертов сейчас нет."],
        )
        try:
            send_telegram_message(
                message,
                db,
                parse_mode="HTML",
                topic_id=resolve_telegram_topic_id(profile, "alerts_digest"),
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        grouped: dict[str, list] = {}
        for alert in alerts:
            event_type = _topic_event_for_alert_category(alert.category)
            grouped.setdefault(event_type, []).append(alert)
        try:
            for event_type, grouped_alerts in grouped.items():
                send_telegram_message(
                    format_alerts_for_telegram(grouped_alerts, prefix="Сводка алертов"),
                    db,
                    parse_mode="HTML",
                    topic_id=resolve_telegram_topic_id(profile, event_type),
                )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(db, user=current_user, action="telegram.alerts", target_type="system", target_id="telegram")
    return TmuxActionResponse(ok=True, message="Текущие алерты отправлены в Telegram.")
