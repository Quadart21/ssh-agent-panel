from collections import defaultdict

from app.models import Server

BILLING_PERIODS = {"monthly", "yearly", "quarterly"}


def normalize_monthly_cost(cost: float | None, billing_period: str | None) -> float | None:
    if cost is None or cost <= 0:
        return None
    period = (billing_period or "monthly").lower()
    if period == "yearly":
        return round(cost / 12, 2)
    if period == "quarterly":
        return round(cost / 3, 2)
    return round(cost, 2)


def build_accounting_summary(servers: list[Server]) -> dict:
    totals_by_currency: dict[str, float] = defaultdict(float)
    group_totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    items: list[dict] = []
    with_cost = 0
    without_cost = 0
    total_setup = 0.0

    for server in servers:
        monthly_equiv = normalize_monthly_cost(server.monthly_cost, server.billing_period)
        currency = (server.currency or "RUB").upper()
        group_label = server.group.name if server.group else "Без группы"

        if monthly_equiv is not None:
            with_cost += 1
            totals_by_currency[currency] += monthly_equiv
            group_totals[group_label][currency] += monthly_equiv
        else:
            without_cost += 1

        if server.setup_cost and server.setup_cost > 0:
            total_setup += server.setup_cost

        items.append(
            {
                "server_id": server.id,
                "server_name": server.name,
                "group_name": group_label,
                "provider": server.provider,
                "monthly_cost": server.monthly_cost,
                "billing_period": server.billing_period or "monthly",
                "currency": currency,
                "monthly_equivalent": monthly_equiv,
                "pay_until": server.pay_until,
                "setup_cost": server.setup_cost,
            }
        )

    items.sort(key=lambda row: (-(row["monthly_equivalent"] or 0), row["server_name"]))

    primary_currency = "RUB"
    if totals_by_currency:
        primary_currency = max(totals_by_currency.items(), key=lambda pair: pair[1])[0]

    total_monthly = round(totals_by_currency.get(primary_currency, 0.0), 2)
    total_yearly = round(total_monthly * 12, 2)

    by_group = [
        {
            "group_name": name,
            "currency": primary_currency,
            "monthly_total": round(sum(amounts.values()), 2),
            "server_count": sum(1 for item in items if item["group_name"] == name and item["monthly_equivalent"]),
        }
        for name, amounts in sorted(group_totals.items(), key=lambda pair: -sum(pair[1].values()))
    ]

    return {
        "primary_currency": primary_currency,
        "total_monthly": total_monthly,
        "total_yearly": total_yearly,
        "total_setup_cost": round(total_setup, 2),
        "servers_with_cost": with_cost,
        "servers_without_cost": without_cost,
        "totals_by_currency": dict(totals_by_currency),
        "by_group": by_group,
        "items": items,
    }
