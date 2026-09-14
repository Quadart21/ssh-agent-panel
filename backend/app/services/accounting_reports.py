from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Iterable

from sqlalchemy.orm import Session, joinedload

from app.models import AccountingBudget, AccountingPayment, AccountingPlan, InfraAsset, Server
from app.services.accounting import normalize_monthly_cost

CATEGORY_LABELS = {
    "domain": "Домены",
    "cdn": "CDN",
    "license": "Лицензии",
    "server": "Серверы",
    "other": "Прочее",
}


def period_delta(billing_period: str | None) -> timedelta:
    period = (billing_period or "monthly").lower()
    if period == "yearly":
        return timedelta(days=365)
    if period == "quarterly":
        return timedelta(days=90)
    return timedelta(days=30)


def extend_pay_until(current: datetime | None, billing_period: str | None, *, now: datetime | None = None) -> datetime:
    base_now = now or datetime.utcnow()
    base = current if current and current > base_now else base_now
    return base + period_delta(billing_period)


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    last_day = monthrange(year, month)[1]
    start = datetime(year, month, 1)
    end = datetime(year, month, last_day, 23, 59, 59)
    return start, end


def payments_sum(
    payments: Iterable[AccountingPayment],
    *,
    currency: str,
    category: str | None = None,
) -> float:
    total = 0.0
    for payment in payments:
        if (payment.currency or "RUB").upper() != currency.upper():
            continue
        if category is not None and (payment.category or "other") != category:
            continue
        total += float(payment.amount or 0)
    return round(total, 2)


def build_calendar_events(
    servers: list[Server],
    assets: list[InfraAsset],
    plans: list[AccountingPlan],
    *,
    now: datetime | None = None,
) -> list[dict]:
    current = now or datetime.utcnow()
    events: list[dict] = []

    for server in servers:
        if not server.pay_until:
            continue
        monthly = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        status = "overdue" if server.pay_until.date() < current.date() else "upcoming"
        if server.pay_until.date() == current.date():
            status = "today"
        events.append(
            {
                "source": "server",
                "source_id": server.id,
                "title": server.name,
                "category": "server",
                "provider": server.provider,
                "amount": server.monthly_cost,
                "currency": (server.currency or "RUB").upper(),
                "due_date": server.pay_until,
                "status": status,
                "billing_period": server.billing_period or "monthly",
                "monthly_equivalent": monthly,
            }
        )

    for asset in assets:
        if not asset.pay_until:
            continue
        monthly = normalize_monthly_cost(asset.cost, asset.billing_period)
        status = "overdue" if asset.pay_until.date() < current.date() else "upcoming"
        if asset.pay_until.date() == current.date():
            status = "today"
        events.append(
            {
                "source": "asset",
                "source_id": asset.id,
                "title": asset.name,
                "category": asset.category or "other",
                "provider": asset.provider,
                "amount": asset.cost,
                "currency": (asset.currency or "RUB").upper(),
                "due_date": asset.pay_until,
                "status": status,
                "billing_period": asset.billing_period or "monthly",
                "monthly_equivalent": monthly,
            }
        )

    for plan in plans:
        if plan.status != "planned":
            continue
        status = "overdue" if plan.due_date.date() < current.date() else "upcoming"
        if plan.due_date.date() == current.date():
            status = "today"
        events.append(
            {
                "source": "plan",
                "source_id": plan.id,
                "title": plan.title,
                "category": plan.category or "other",
                "provider": None,
                "amount": plan.amount,
                "currency": (plan.currency or "RUB").upper(),
                "due_date": plan.due_date,
                "status": status,
                "billing_period": None,
                "monthly_equivalent": None,
            }
        )

    events.sort(key=lambda row: (row["due_date"], row["title"]))
    return events


def primary_currency_from_totals(totals: dict[str, float], fallback: str = "RUB") -> str:
    if not totals:
        return fallback
    return max(totals.items(), key=lambda pair: pair[1])[0]


def recurring_totals(servers: list[Server], assets: list[InfraAsset]) -> tuple[str, float, float, float]:
    totals: dict[str, float] = defaultdict(float)
    servers_by_currency: dict[str, float] = defaultdict(float)
    assets_by_currency: dict[str, float] = defaultdict(float)

    for server in servers:
        monthly = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        if monthly is None:
            continue
        currency = (server.currency or "RUB").upper()
        totals[currency] += monthly
        servers_by_currency[currency] += monthly

    for asset in assets:
        monthly = normalize_monthly_cost(asset.cost, asset.billing_period)
        if monthly is None:
            continue
        currency = (asset.currency or "RUB").upper()
        totals[currency] += monthly
        assets_by_currency[currency] += monthly

    currency = primary_currency_from_totals(totals)
    monthly = round(totals.get(currency, 0.0), 2)
    return (
        currency,
        monthly,
        round(servers_by_currency.get(currency, 0.0), 2),
        round(assets_by_currency.get(currency, 0.0), 2),
    )


def build_overview(db: Session, *, user_server_ids: list[int] | None = None) -> dict:
    now = datetime.utcnow()
    server_query = db.query(Server).options(joinedload(Server.group))
    if user_server_ids is not None:
        if not user_server_ids:
            servers: list[Server] = []
        else:
            servers = server_query.filter(Server.id.in_(user_server_ids)).all()
    else:
        servers = server_query.all()

    assets = db.query(InfraAsset).order_by(InfraAsset.name.asc()).all()
    plans = (
        db.query(AccountingPlan)
        .filter(AccountingPlan.status == "planned")
        .order_by(AccountingPlan.due_date.asc())
        .all()
    )

    currency, monthly, servers_monthly, assets_monthly = recurring_totals(servers, assets)
    events = build_calendar_events(servers, assets, plans, now=now)
    upcoming = [
        event
        for event in events
        if 0 <= (event["due_date"].date() - now.date()).days <= 7 and event["status"] != "overdue"
    ]
    upcoming_month = [
        event
        for event in events
        if 0 <= (event["due_date"].date() - now.date()).days <= 30 and event["status"] != "overdue"
    ]
    overdue = [event for event in events if event["status"] == "overdue"]
    upcoming_month_total = round(
        sum(
            float(event["amount"] or 0)
            for event in upcoming_month
            if (event.get("currency") or "RUB").upper() == currency and event.get("amount") is not None
        ),
        2,
    )

    start, end = month_bounds(now.year, now.month)
    month_payments = (
        db.query(AccountingPayment)
        .filter(AccountingPayment.paid_at >= start, AccountingPayment.paid_at <= end)
        .all()
    )
    budget = (
        db.query(AccountingBudget)
        .filter(
            AccountingBudget.year == now.year,
            AccountingBudget.month == now.month,
            AccountingBudget.currency == currency,
            AccountingBudget.category.is_(None),
        )
        .first()
    )
    actual = payments_sum(month_payments, currency=currency)
    planned = float(budget.planned_amount) if budget else None

    top_map: dict[str, float] = defaultdict(float)
    for server in servers:
        monthly_eq = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        if monthly_eq is None:
            continue
        if (server.currency or "RUB").upper() != currency:
            continue
        top_map[f"server:{server.name}"] += monthly_eq
    for asset in assets:
        monthly_eq = normalize_monthly_cost(asset.cost, asset.billing_period)
        if monthly_eq is None:
            continue
        if (asset.currency or "RUB").upper() != currency:
            continue
        top_map[f"asset:{asset.name}"] += monthly_eq

    top_expenses = [
        {"label": key.split(":", 1)[1], "amount": round(amount, 2), "currency": currency}
        for key, amount in sorted(top_map.items(), key=lambda pair: -pair[1])[:8]
    ]

    return {
        "primary_currency": currency,
        "monthly_recurring": monthly,
        "yearly_forecast": round(monthly * 12, 2),
        "assets_monthly": assets_monthly,
        "servers_monthly": servers_monthly,
        "budget_planned": planned,
        "budget_actual": actual,
        "budget_remaining": round(planned - actual, 2) if planned is not None else None,
        "upcoming_7d": upcoming[:20],
        "upcoming_month": upcoming_month[:40],
        "upcoming_month_total": upcoming_month_total,
        "overdue": overdue[:20],
        "top_expenses": top_expenses,
    }


def build_report(
    db: Session,
    *,
    period_from: datetime,
    period_to: datetime,
    user_server_ids: list[int] | None = None,
) -> dict:
    payments = (
        db.query(AccountingPayment)
        .filter(AccountingPayment.paid_at >= period_from, AccountingPayment.paid_at <= period_to)
        .order_by(AccountingPayment.paid_at.desc())
        .all()
    )

    server_query = db.query(Server).options(joinedload(Server.group))
    if user_server_ids is not None:
        servers = server_query.filter(Server.id.in_(user_server_ids)).all() if user_server_ids else []
    else:
        servers = server_query.all()
    assets = db.query(InfraAsset).all()
    currency, monthly, _, _ = recurring_totals(servers, assets)

    by_category: dict[str, float] = defaultdict(float)
    by_category_count: dict[str, int] = defaultdict(int)
    by_month: dict[str, float] = defaultdict(float)
    by_month_count: dict[str, int] = defaultdict(int)
    total_paid = 0.0
    payments_count = 0

    for payment in payments:
        if (payment.currency or "RUB").upper() != currency:
            continue
        amount = float(payment.amount or 0)
        total_paid += amount
        payments_count += 1
        cat = payment.category or "other"
        by_category[cat] += amount
        by_category_count[cat] += 1
        month_key = payment.paid_at.strftime("%Y-%m")
        by_month[month_key] += amount
        by_month_count[month_key] += 1

    provider_totals: dict[str, float] = defaultdict(float)
    provider_count: dict[str, int] = defaultdict(int)
    for server in servers:
        monthly_eq = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        if monthly_eq is None or (server.currency or "RUB").upper() != currency:
            continue
        key = server.provider or "Без провайдера"
        provider_totals[key] += monthly_eq
        provider_count[key] += 1
    for asset in assets:
        monthly_eq = normalize_monthly_cost(asset.cost, asset.billing_period)
        if monthly_eq is None or (asset.currency or "RUB").upper() != currency:
            continue
        key = asset.provider or "Без провайдера"
        provider_totals[key] += monthly_eq
        provider_count[key] += 1

    group_totals: dict[str, float] = defaultdict(float)
    group_count: dict[str, int] = defaultdict(int)
    for server in servers:
        monthly_eq = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        if monthly_eq is None or (server.currency or "RUB").upper() != currency:
            continue
        key = server.group.name if server.group else "Без группы"
        group_totals[key] += monthly_eq
        group_count[key] += 1

    def breakdown(mapping: dict[str, float], counts: dict[str, int], *, label_map: dict[str, str] | None = None):
        rows = []
        for key, amount in sorted(mapping.items(), key=lambda pair: -pair[1]):
            rows.append(
                {
                    "key": key,
                    "label": (label_map or {}).get(key, key),
                    "amount": round(amount, 2),
                    "currency": currency,
                    "count": counts.get(key, 0),
                }
            )
        return rows

    return {
        "primary_currency": currency,
        "period_from": period_from,
        "period_to": period_to,
        "total_paid": round(total_paid, 2),
        "payments_count": payments_count,
        "by_category": breakdown(by_category, by_category_count, label_map=CATEGORY_LABELS),
        "by_provider": breakdown(provider_totals, provider_count),
        "by_month": breakdown(by_month, by_month_count),
        "by_group": breakdown(group_totals, group_count),
        "recurring_monthly": monthly,
    }


def budget_actual_amount(db: Session, budget: AccountingBudget) -> float:
    start, end = month_bounds(budget.year, budget.month)
    payments = (
        db.query(AccountingPayment)
        .filter(AccountingPayment.paid_at >= start, AccountingPayment.paid_at <= end)
        .all()
    )
    return payments_sum(payments, currency=budget.currency, category=budget.category)
