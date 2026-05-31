from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AlertNotificationState, NotificationSettings, Server
from app.schemas import AlertRead
from app.services.notification_settings import get_or_create_notification_settings
from app.services.ssh import fetch_server_metrics
from app.services.telegram import format_telegram_message, resolve_telegram_topic_id, send_telegram_message, telegram_is_configured


def _server_is_offline(server: Server, *, use_live_metrics: bool) -> bool | None:
    if use_live_metrics:
        snapshot = fetch_server_metrics(server)
        return not bool(snapshot["online"])

    if not server.metrics_collected_at:
        return None

    return not bool(server.metrics_online)


def collect_server_alerts(db: Session, *, use_live_metrics: bool = False) -> list[AlertRead]:
    alerts: list[AlertRead] = []
    now = datetime.utcnow()
    soon_limit = now + timedelta(days=3)

    for server in db.query(Server).all():
        offline = _server_is_offline(server, use_live_metrics=use_live_metrics)
        if offline is True:
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
    title = prefix or "Фоновые алерты"
    lines = [f"Событий: {len(alerts)}"]
    level_icon = {"critical": "🔴", "warning": "🟠", "info": "🔵", "success": "🟢"}
    for alert in alerts[:20]:
        icon = level_icon.get(alert.level, "⚪")
        server_name = alert.server_name or "без сервера"
        lines.append(f"{icon} {alert.title} — {server_name}")
        lines.append(alert.message)
    if len(alerts) > 20:
        lines.append(f"… и еще {len(alerts) - 20}")
    return format_telegram_message(title, icon="🚨", lines=lines)


def _topic_event_for_alert_category(category: str) -> str:
    if category == "server_offline":
        return "server_offline"
    if category == "server_online":
        return "server_online"
    if category in {"payment_expired", "payment_expiring"}:
        return "payment_expiring"
    return "alerts_digest"


def _build_server_online_alert(server: Server) -> AlertRead:
    return AlertRead(
        level="success",
        category="server_online",
        title="Сервер восстановлен",
        message=f"{server.name} снова отвечает по SSH.",
        server_id=server.id,
        server_name=server.name,
    )


def sync_alert_notifications(db: Session) -> tuple[int, int]:
    now = datetime.utcnow()
    profile = get_or_create_notification_settings(db)
    alerts = filter_alerts_by_preferences(collect_server_alerts(db, use_live_metrics=True), profile)
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

    recovery_alerts: list[AlertRead] = []
    for fingerprint, state in existing_states.items():
        if fingerprint not in active_fingerprints:
            if (
                state.is_active
                and state.category == "server_offline"
                and state.last_sent_at is not None
                and profile.notify_server_offline
            ):
                server = db.get(Server, state.server_id) if state.server_id else None
                if server is not None:
                    recovery_alerts.append(_build_server_online_alert(server))
            state.is_active = False

    sent_count = 0
    telegram_alerts = [
        alert
        for alert in [*sendable_alerts, *recovery_alerts]
        if alert.category not in {"payment_expired", "payment_expiring"}
    ]
    if telegram_alerts and telegram_is_configured(db):
        grouped: dict[str, list[AlertRead]] = {}
        for alert in telegram_alerts:
            key = _topic_event_for_alert_category(alert.category)
            grouped.setdefault(key, []).append(alert)
        for event_type, grouped_alerts in grouped.items():
            prefix = "Восстановление серверов" if event_type == "server_online" else None
            send_telegram_message(
                format_alerts_for_telegram(grouped_alerts, prefix=prefix),
                db,
                parse_mode="HTML",
                topic_id=resolve_telegram_topic_id(profile, event_type),
            )
        for alert in sendable_alerts:
            if alert.category in {"payment_expired", "payment_expiring"}:
                continue
            existing_states[alert_fingerprint(alert)].last_sent_at = now
        sent_count = len(telegram_alerts)

    db.commit()
    return sent_count, len(alerts)


def filter_alerts_by_preferences(alerts: list[AlertRead], profile: NotificationSettings) -> list[AlertRead]:
    filtered: list[AlertRead] = []
    for alert in alerts:
        if alert.category in {"server_offline", "server_online"} and not profile.notify_server_offline:
            continue
        if alert.category == "payment_expired" and not profile.notify_payment_expired:
            continue
        if alert.category == "payment_expiring" and not profile.notify_payment_expiring:
            continue
        filtered.append(alert)
    return filtered
