import uuid
from datetime import datetime, timedelta, timezone
from html import escape

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PaymentNotificationBatch, Server, ServerPaymentNotificationState
from app.services.audit import write_audit_log
from app.services.notification_settings import get_or_create_notification_settings, telegram_credentials
from app.services.telegram import (
    edit_telegram_message,
    resolve_telegram_topic_id,
    send_telegram_message,
    telegram_is_configured,
)

PAYMENT_NOTICE_DAYS_FIRST = 7
PAYMENT_NOTICE_DAYS_SECOND = 3
OVERDUE_NOTICE_DAYS = 3
PAYMENT_EXTENSION_OPTIONS = (30, 90, 180, 365)


def _days_until(pay_until: datetime, now: datetime) -> int:
    return (pay_until.date() - now.date()).days


def _format_server_cost(server: Server) -> str:
    if server.monthly_cost is None:
        return "—"
    currency = server.currency or "RUB"
    period = _billing_period_label(server.billing_period)
    return f"{server.monthly_cost:.0f} {currency}/{period}"


def _billing_period_label(period: str | None) -> str:
    mapping = {
        "monthly": "мес",
        "yearly": "год",
        "quarterly": "кв",
    }
    return mapping.get((period or "monthly").strip().lower(), period or "мес")


def _format_total_cost(servers: list[Server]) -> str:
    totals: dict[str, float] = {}
    for server in servers:
        if server.monthly_cost is None:
            continue
        currency = server.currency or "RUB"
        totals[currency] = totals.get(currency, 0.0) + float(server.monthly_cost)
    if not totals:
        return "—"
    return " + ".join(f"{amount:.0f} {currency}" for currency, amount in sorted(totals.items()))


def _format_pay_until(pay_until: datetime | None) -> str:
    if not pay_until:
        return "—"
    return pay_until.strftime("%d.%m.%Y")


def _category_meta(category: str) -> tuple[str, str, str]:
    if category == "payment_notice_7d":
        return "⏳", "Оплата через 7 дней", "Напоминание: до истечения срока осталась неделя."
    if category == "payment_notice_3d":
        return "⚠️", "Оплата через 3 дня", "Срок оплаты истекает в ближайшие дни."
    if category == "payment_overdue":
        return "🔴", "Оплата просрочена", "Сервер будет удалён из панели после 3 дней просрочки."
    return "💸", "Уведомление об оплате", ""


def format_payment_batch_message(category: str, servers: list[Server], *, status_suffix: str | None = None) -> str:
    icon, title, subtitle = _category_meta(category)
    providers = sorted({server.provider or "не указан" for server in servers})
    provider_line = providers[0] if len(providers) == 1 else ", ".join(providers)

    lines = [
        f"<b>{icon} {escape(settings.app_display_name)}</b>",
        "━━━━━━━━━━━━━━━━━━━━",
        f"<b>{escape(title)}</b>",
    ]
    if subtitle:
        lines.append(f"<i>{escape(subtitle)}</i>")
    lines.extend(
        [
            "",
            "📊 <b>Сводка</b>",
            f"• Серверов: <b>{len(servers)}</b>",
            f"• Сумма: <b>{escape(_format_total_cost(servers))}</b>",
            f"• Провайдер: <b>{escape(provider_line)}</b>",
            "",
            "🖥 <b>Серверы</b>",
        ]
    )

    for index, server in enumerate(servers, start=1):
        lines.append(f"<b>{index}.</b> {escape(server.name)}")
        lines.append(f"    🌐 <code>{escape(server.ip)}</code>")
        lines.append(f"    💳 {escape(_format_server_cost(server))}")
        lines.append(f"    📅 до <b>{escape(_format_pay_until(server.pay_until))}</b>")
        if len(providers) > 1:
            lines.append(f"    🏢 {escape(server.provider or 'не указан')}")
        if index != len(servers):
            lines.append("")

    if status_suffix:
        lines.extend(["", status_suffix])

    lines.extend(
        [
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            f"<i>🕒 {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M UTC')}</i>",
        ]
    )
    return "\n".join(lines)


def _paid_keyboard(batch_id: str) -> dict:
    return {
        "inline_keyboard": [
            [{"text": "✅ Оплатил", "callback_data": f"pay:paid:{batch_id}"}],
        ]
    }


def extension_keyboard(batch_id: str) -> dict:
    rows = []
    row: list[dict[str, str]] = []
    for days in PAYMENT_EXTENSION_OPTIONS:
        row.append({"text": f"{days} дн.", "callback_data": f"pay:ext:{batch_id}:{days}"})
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return {"inline_keyboard": rows}


def get_or_create_payment_state(db: Session, server_id: int) -> ServerPaymentNotificationState:
    state = db.get(ServerPaymentNotificationState, server_id)
    if state is None:
        state = ServerPaymentNotificationState(server_id=server_id)
        db.add(state)
    return state


def reset_payment_notification_state(db: Session, server_id: int) -> None:
    state = db.get(ServerPaymentNotificationState, server_id)
    if state is None:
        return
    state.sent_7d_at = None
    state.sent_3d_at = None
    state.overdue_notices_sent = 0
    state.last_overdue_sent_at = None


def _should_send_overdue_notice(state: ServerPaymentNotificationState, now: datetime) -> bool:
    if state.overdue_notices_sent >= OVERDUE_NOTICE_DAYS:
        return False
    if state.last_overdue_sent_at is None:
        return True
    return (now.date() - state.last_overdue_sent_at.date()).days >= 1


def _send_payment_batch(
    db: Session,
    *,
    category: str,
    servers: list[Server],
    now: datetime,
) -> bool:
    if not servers:
        return False

    profile = get_or_create_notification_settings(db)
    if category in {"payment_notice_7d", "payment_notice_3d"} and not profile.notify_payment_expiring:
        return False
    if category == "payment_overdue" and not profile.notify_payment_expired:
        return False

    batch_id = str(uuid.uuid4())
    batch = PaymentNotificationBatch(
        id=batch_id,
        category=category,
        server_ids=[server.id for server in servers],
        created_at=now,
    )
    db.add(batch)
    db.flush()

    message_id = send_telegram_message(
        format_payment_batch_message(category, servers),
        db,
        parse_mode="HTML",
        topic_id=resolve_telegram_topic_id(profile, category),
        reply_markup=_paid_keyboard(batch_id),
    )
    if message_id is None:
        db.delete(batch)
        db.flush()
        return False

    _, resolved_chat_id = telegram_credentials(profile)
    batch.telegram_message_id = message_id
    batch.telegram_chat_id = resolved_chat_id
    return True


def _delete_overdue_servers(db: Session, servers: list[Server]) -> int:
    deleted = 0
    for server in servers:
        write_audit_log(
            db,
            user=None,
            action="server.auto_delete_overdue_payment",
            target_type="server",
            target_id=str(server.id),
            details=f"{server.name} ({server.ip}) — оплата просрочена более {OVERDUE_NOTICE_DAYS} дней",
        )
        db.delete(server)
        deleted += 1
    return deleted


def sync_payment_notifications(db: Session) -> dict[str, int]:
    now = datetime.utcnow()
    stats = {
        "notices_7d": 0,
        "notices_3d": 0,
        "notices_overdue": 0,
        "deleted": 0,
    }

    if not telegram_is_configured(db):
        return stats

    servers = db.query(Server).filter(Server.pay_until.isnot(None)).all()
    to_delete: list[Server] = []
    notice_7d: list[Server] = []
    notice_3d: list[Server] = []
    notice_overdue: list[Server] = []

    for server in servers:
        if not server.pay_until:
            continue

        days_until = _days_until(server.pay_until, now)
        state = get_or_create_payment_state(db, server.id)

        if days_until > PAYMENT_NOTICE_DAYS_FIRST:
            if state.sent_7d_at or state.sent_3d_at or state.overdue_notices_sent:
                reset_payment_notification_state(db, server)
            continue

        if days_until < 0:
            overdue_days = -days_until
            if overdue_days >= OVERDUE_NOTICE_DAYS:
                to_delete.append(server)
                continue
            if _should_send_overdue_notice(state, now):
                notice_overdue.append(server)
            continue

        if days_until <= PAYMENT_NOTICE_DAYS_SECOND and state.sent_3d_at is None:
            notice_3d.append(server)
        elif days_until <= PAYMENT_NOTICE_DAYS_FIRST and state.sent_3d_at is None and state.sent_7d_at is None:
            notice_7d.append(server)

    if to_delete:
        stats["deleted"] = _delete_overdue_servers(db, to_delete)

    if notice_7d and _send_payment_batch(db, category="payment_notice_7d", servers=notice_7d, now=now):
        for server in notice_7d:
            state = get_or_create_payment_state(db, server.id)
            state.sent_7d_at = now
        stats["notices_7d"] = len(notice_7d)

    if notice_3d and _send_payment_batch(db, category="payment_notice_3d", servers=notice_3d, now=now):
        for server in notice_3d:
            state = get_or_create_payment_state(db, server.id)
            state.sent_3d_at = now
        stats["notices_3d"] = len(notice_3d)

    if notice_overdue and _send_payment_batch(db, category="payment_overdue", servers=notice_overdue, now=now):
        for server in notice_overdue:
            state = get_or_create_payment_state(db, server.id)
            state.overdue_notices_sent += 1
            state.last_overdue_sent_at = now
        stats["notices_overdue"] = len(notice_overdue)

    db.commit()
    return stats


def extend_servers_from_batch(db: Session, batch: PaymentNotificationBatch, days: int) -> list[Server]:
    now = datetime.utcnow()
    servers = db.query(Server).filter(Server.id.in_(batch.server_ids)).all()
    for server in servers:
        base = server.pay_until if server.pay_until and server.pay_until > now else now
        server.pay_until = base + timedelta(days=days)
        reset_payment_notification_state(db, server.id)
    batch.resolved_at = now
    db.commit()
    return servers


def handle_payment_callback(db: Session, callback_data: str, callback_query_id: str) -> str | None:
    parts = callback_data.split(":")
    if len(parts) < 3 or parts[0] != "pay":
        return None

    action = parts[1]
    batch_id = parts[2]

    batch = db.get(PaymentNotificationBatch, batch_id)
    if batch is None:
        from app.services.telegram import answer_callback_query

        answer_callback_query(callback_query_id, db=db, text="Уведомление устарело.", show_alert=True)
        return None

    if batch.resolved_at is not None and action != "ext":
        from app.services.telegram import answer_callback_query

        answer_callback_query(callback_query_id, db=db, text="Оплата уже отмечена.", show_alert=True)
        return None

    from app.services.telegram import answer_callback_query, send_telegram_message

    if action == "paid":
        answer_callback_query(callback_query_id, db=db, text="Выберите срок продления.")
        send_telegram_message(
            "💳 <b>На сколько продлить оплату?</b>\n\nВыберите срок продления для серверов из уведомления.",
            db,
            parse_mode="HTML",
            reply_markup=extension_keyboard(batch_id),
        )
        return "paid_prompt"

    if action == "ext" and len(parts) == 4:
        try:
            days = int(parts[3])
        except ValueError:
            answer_callback_query(callback_query_id, db=db, text="Некорректный срок.", show_alert=True)
            return None
        if days not in PAYMENT_EXTENSION_OPTIONS:
            answer_callback_query(callback_query_id, db=db, text="Некорректный срок.", show_alert=True)
            return None

        servers = extend_servers_from_batch(db, batch, days)
        if not servers:
            answer_callback_query(callback_query_id, db=db, text="Серверы не найдены.", show_alert=True)
            return None

        names = ", ".join(server.name for server in servers[:5])
        if len(servers) > 5:
            names += f" и ещё {len(servers) - 5}"

        write_audit_log(
            db,
            user=None,
            action="server.payment_extended_telegram",
            target_type="payment_batch",
            target_id=batch_id,
            details=f"Продлено на {days} дн.: {names}",
        )

        answer_callback_query(
            callback_query_id,
            db=db,
            text=f"Продлено на {days} дн. для {len(servers)} сервер(ов).",
            show_alert=True,
        )

        if batch.telegram_chat_id and batch.telegram_message_id:
            refreshed = db.query(Server).filter(Server.id.in_(batch.server_ids)).all()
            dates = ", ".join(
                _format_pay_until(server.pay_until)
                for server in refreshed[:5]
                if server.pay_until
            )
            status = f"✅ <b>Оплачено</b> — продлено на <b>{days} дн.</b>"
            if dates:
                status += f"\n📅 Новая дата: <b>{escape(dates)}</b>"
            try:
                edit_telegram_message(
                    batch.telegram_chat_id,
                    batch.telegram_message_id,
                    format_payment_batch_message(batch.category, refreshed, status_suffix=status),
                    db=db,
                    parse_mode="HTML",
                )
            except Exception:
                pass
        return "extended"

    return None
