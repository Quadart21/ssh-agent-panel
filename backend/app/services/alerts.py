from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AlertNotificationState, NotificationSettings, Server
from app.schemas import AlertRead
from app.services.notification_settings import get_or_create_notification_settings
from app.services.ssh import fetch_server_metrics
from app.services.telegram import send_telegram_message, telegram_is_configured


def collect_server_alerts(db: Session) -> list[AlertRead]:
    alerts: list[AlertRead] = []
    now = datetime.utcnow()
    soon_limit = now + timedelta(days=3)

    for server in db.query(Server).all():
        snapshot = fetch_server_metrics(server)
        if not bool(snapshot["online"]):
            alerts.append(
                AlertRead(
                    level="critical",
                    category="server_offline",
                    title="Сервер недоступен",
                    message=f"{server.name} не отвечает по SSH.",
                    server_id=server.id,
                    server_name=server.name,
                )
            )

        if server.pay_until:
            if server.pay_until <= now:
                alerts.append(
                    AlertRead(
                        level="critical",
                        category="payment_expired",
                        title="Оплата просрочена",
                        message=f"Срок оплаты сервера {server.name} уже истёк.",
                        server_id=server.id,
                        server_name=server.name,
                        pay_until=server.pay_until,
                    )
                )
            elif server.pay_until <= soon_limit:
                alerts.append(
                    AlertRead(
                        level="warning",
                        category="payment_expiring",
                        title="Скоро истечёт оплата",
                        message=f"Срок оплаты сервера {server.name} истекает в ближайшие 3 дня.",
                        server_id=server.id,
                        server_name=server.name,
                        pay_until=server.pay_until,
                    )
                )

    return alerts


def alert_fingerprint(alert: AlertRead) -> str:
    pay_until = alert.pay_until.isoformat() if alert.pay_until else ""
    return f"{alert.category}|{alert.server_id or 0}|{pay_until}|{alert.message}"


def format_alerts_for_telegram(alerts: list[AlertRead], prefix: str | None = None) -> str:
    resolved_prefix = prefix or f"{settings.app_display_name}\nФоновые алерты"
    lines = [resolved_prefix, f"Событий: {len(alerts)}"]
    for alert in alerts[:20]:
        lines.append(f"- {alert.title}: {alert.message}")
    if len(alerts) > 20:
        lines.append(f"... и ещё {len(alerts) - 20}")
    return "\n".join(lines)


def sync_alert_notifications(db: Session) -> tuple[int, int]:
    now = datetime.utcnow()
    profile = get_or_create_notification_settings(db)
    alerts = filter_alerts_by_preferences(collect_server_alerts(db), profile)
    active_fingerprints = {alert_fingerprint(alert) for alert in alerts}
    existing_states = {
        state.fingerprint: state
        for state in db.query(AlertNotificationState).all()
    }
    sendable_alerts: list[AlertRead] = []

    for alert in alerts:
        fingerprint = alert_fingerprint(alert)
        state = existing_states.get(fingerprint)
        if state is None:
            state = AlertNotificationState(
                fingerprint=fingerprint,
                category=alert.category,
                server_id=alert.server_id,
                title=alert.title,
                message=alert.message,
                is_active=True,
                first_seen_at=now,
                last_seen_at=now,
            )
            db.add(state)
            existing_states[fingerprint] = state
            sendable_alerts.append(alert)
            continue

        state.category = alert.category
        state.server_id = alert.server_id
        state.title = alert.title
        state.message = alert.message
        state.is_active = True
        state.last_seen_at = now

        should_repeat = (
            state.last_sent_at is not None
            and now - state.last_sent_at >= timedelta(minutes=profile.alert_repeat_minutes or settings.alert_repeat_minutes)
        )
        if state.last_sent_at is None or should_repeat:
            sendable_alerts.append(alert)

    for fingerprint, state in existing_states.items():
        if fingerprint not in active_fingerprints:
            state.is_active = False

    sent_count = 0
    if sendable_alerts and telegram_is_configured(db):
        send_telegram_message(format_alerts_for_telegram(sendable_alerts), db)
        for alert in sendable_alerts:
            existing_states[alert_fingerprint(alert)].last_sent_at = now
        sent_count = len(sendable_alerts)

    db.commit()
    return sent_count, len(alerts)


def filter_alerts_by_preferences(alerts: list[AlertRead], profile: NotificationSettings) -> list[AlertRead]:
    filtered: list[AlertRead] = []
    for alert in alerts:
        if alert.category == "server_offline" and not profile.notify_server_offline:
            continue
        if alert.category == "payment_expired" and not profile.notify_payment_expired:
            continue
        if alert.category == "payment_expiring" and not profile.notify_payment_expiring:
            continue
        filtered.append(alert)
    return filtered
