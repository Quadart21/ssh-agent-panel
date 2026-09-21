"""Спред по завершённым заявкам крипта↔крипта (iEX / CryptoCash).

Прибыль считается по кассе CryptoCash:
  система = (вход на баланс) − (себестоимость выплаты по свапу CC)

Вход/fee — из Paid fetch_payment; выплата в USDT — из Paid fetch_payout.usdtTotal.
Если колбека нет — fallback на поля tasks + курс заявки.
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import paramiko
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models import Server
from app.services.ssh import build_ssh_client
from app.services.ssh_keys import resolve_server_private_key

STABLE_PREFIXES = ("USDT", "USDC", "TUSD", "USDS", "USD1", "USDR", "DAI")
FIAT_MARKERS = (
    "RUB",
    "BYN",
    "UAH",
    "KZT",
    "EUR",
    "CARD",
    "CASH",
    "SBP",
    "ERIP",
    "BANK",
    "BLRB",
    "FIAT",
    "QIWI",
    "ADVCASH",
    "PAYEER",
    "YOMONEY",
    "WMZ",
    "WMR",
)


@dataclass
class SpreadRow:
    task_id: int
    give_xml: str
    get_xml: str
    pair: str
    completed_at: str | None
    client_gave: float
    client_gave_usdt: float
    ps_fee: float
    ps_fee_usdt: float
    paid_out: float
    paid_out_usdt: float
    system_earned_usdt: float
    course_display: str | None
    merchant_provider: str | None


def _d(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _f(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.00000001")))


def is_stable(xml: str) -> bool:
    u = (xml or "").upper()
    return any(u.startswith(prefix) for prefix in STABLE_PREFIXES)


def is_fiat_xml(xml: str) -> bool:
    u = (xml or "").upper()
    if not u:
        return True
    if is_stable(u):
        return False
    if u in {"USD", "EUR", "RUB", "BYN", "UAH", "KZT"}:
        return True
    return any(marker in u for marker in FIAT_MARKERS)


def is_crypto_xml(xml: str) -> bool:
    return not is_fiat_xml(xml)


def parse_usdt_per_coin(course_display: str | None, course_float: Decimal) -> Decimal | None:
    text = (course_display or "").replace("\u00a0", " ").strip()
    if not text:
        if course_float > 0:
            return (Decimal("1") / course_float) if course_float != 0 else None
        return None

    m = re.search(
        r"([0-9]+(?:\.[0-9]+)?)\s*USDT\s*=\s*1\s+\S+",
        text,
        flags=re.IGNORECASE,
    )
    if m:
        return _d(m.group(1))

    m = re.search(
        r"1\s+\S+\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*USDT",
        text,
        flags=re.IGNORECASE,
    )
    if m:
        return _d(m.group(1))

    if course_float > 0:
        return Decimal("1") / course_float
    return None


def amount_to_usdt(
    amount: Decimal,
    xml: str,
    *,
    usdt_per_coin: Decimal | None,
) -> Decimal:
    if amount == 0:
        return Decimal("0")
    if is_stable(xml):
        return amount
    if usdt_per_coin and usdt_per_coin > 0:
        return amount * usdt_per_coin
    return Decimal("0")


def extract_ps_fee_give(payload: Any, give_price_fee_pay: Decimal) -> Decimal:
    """Комиссия платёжки на стороне отдаю (в валюте отдаю) — fallback из tasks."""
    from_payload = Decimal("0")
    if isinstance(payload, dict):
        for item in payload.get("components") or []:
            if not isinstance(item, dict):
                continue
            if item.get("side") != "give":
                continue
            code = str(item.get("code") or "")
            source = str(item.get("source") or "")
            if code == "payment_commission" or source == "payment_system":
                from_payload += _d(item.get("amount"))
    if from_payload > 0:
        return from_payload
    return give_price_fee_pay


def _parse_callback_json(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw or not isinstance(raw, str):
        return {}
    text = raw.strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _callback_item(raw: Any) -> dict[str, Any]:
    data = _parse_callback_json(raw)
    item = ((data.get("data") or {}) if isinstance(data.get("data"), dict) else {}).get("item")
    return item if isinstance(item, dict) else {}


def _net_out_usdt_from_item(item: dict[str, Any]) -> Decimal:
    """Себестоимость выплаты CryptoCash в USDT (по свапу)."""
    usdt_total = _d(item.get("usdtTotal"))
    if usdt_total > 0:
        return usdt_total

    # fallback: OUT − Return hold из balanceEntries
    out_sum = Decimal("0")
    in_sum = Decimal("0")
    for entry in item.get("balanceEntries") or []:
        if not isinstance(entry, dict):
            continue
        amount = _d(entry.get("amount"))
        direction = str(entry.get("direction") or "").upper()
        reason = str(entry.get("reason") or "").lower()
        if direction == "OUT":
            out_sum += amount
        elif direction == "IN" and "return" in reason:
            in_sum += amount
    net = out_sum - in_sum
    if net > 0:
        return net

    rate = _d(item.get("exchangeRate"))
    amount = _d(item.get("amount"))
    if rate > 0 and amount > 0:
        return amount * rate
    return Decimal("0")


def _in_fee_usdt_from_item(item: dict[str, Any], *, give_xml: str, usdt_per_coin: Decimal | None) -> Decimal:
    fee = _d(item.get("commission"))
    if fee <= 0:
        fee = _d(item.get("feeAmount"))
    if fee <= 0:
        for entry in item.get("balanceEntries") or []:
            if isinstance(entry, dict) and str(entry.get("direction") or "").upper() == "IN":
                fee = _d(entry.get("feeAmount"))
                if fee > 0:
                    break
    if fee <= 0:
        return Decimal("0")
    # commission уже в USDT у CC (и для USDT, и для LTC→USDT)
    if is_stable(give_xml):
        return fee
    # если fee в монете отдаю — переведём; у CC обычно уже USDT
    # эвристика: если fee << give и give не стейбл, скорее уже USDT
    return fee if fee > 0 else amount_to_usdt(fee, give_xml, usdt_per_coin=usdt_per_coin)


def _in_credited_usdt(item: dict[str, Any]) -> Decimal:
    credited = _d(item.get("usdtTotal"))
    if credited > 0:
        return credited
    for entry in item.get("balanceEntries") or []:
        if isinstance(entry, dict) and str(entry.get("direction") or "").upper() == "IN":
            amount = _d(entry.get("amount"))
            if amount > 0:
                return amount
    return Decimal("0")


def row_from_task(raw: dict[str, Any]) -> SpreadRow | None:
    give_xml = str(raw.get("give_xml") or "").upper()
    get_xml = str(raw.get("get_xml") or "").upper()
    if not (is_crypto_xml(give_xml) and is_crypto_xml(get_xml)):
        return None

    give_price = _d(raw.get("give_price"))
    receiving_price = _d(raw.get("receiving_price"))
    course_float = _d(raw.get("course_float"))
    course_display = raw.get("course_display")
    usdt_per_coin = parse_usdt_per_coin(
        str(course_display) if course_display else None,
        course_float,
    )

    payload = raw.get("amounts_payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}

    in_item = _callback_item(raw.get("in_callback") or raw.get("in_cb_json"))
    out_item = _callback_item(raw.get("out_callback") or raw.get("out_cb_json"))

    # Плоские поля из SQL (надёжнее, чем гонять весь JSON через CSV)
    in_usdt_total = _d(raw.get("in_usdt_total"))
    in_commission = _d(raw.get("in_commission"))
    in_fee_amount = _d(raw.get("in_fee_amount"))
    out_usdt_total = _d(raw.get("out_usdt_total"))
    out_exchange_rate = _d(raw.get("out_exchange_rate"))
    out_amount = _d(raw.get("out_amount"))

    if in_usdt_total > 0 and not in_item.get("usdtTotal"):
        in_item = {
            **in_item,
            "usdtTotal": str(in_usdt_total),
            "commission": str(in_commission) if in_commission > 0 else in_item.get("commission"),
            "feeAmount": str(in_fee_amount) if in_fee_amount > 0 else in_item.get("feeAmount"),
        }
    if out_usdt_total > 0 and not out_item.get("usdtTotal"):
        out_item = {
            **out_item,
            "usdtTotal": str(out_usdt_total),
            "exchangeRate": str(out_exchange_rate) if out_exchange_rate > 0 else out_item.get("exchangeRate"),
            "amount": str(out_amount) if out_amount > 0 else out_item.get("amount"),
        }

    # --- fee / вход ---
    ps_fee_task = extract_ps_fee_give(payload, _d(raw.get("give_price_fee_pay")))
    ps_fee_usdt_cb = _in_fee_usdt_from_item(in_item, give_xml=give_xml, usdt_per_coin=usdt_per_coin)
    if ps_fee_usdt_cb <= 0:
        ps_fee_usdt_cb = in_commission if in_commission > 0 else in_fee_amount
    credited_usdt = _in_credited_usdt(in_item)
    if credited_usdt <= 0:
        credited_usdt = in_usdt_total

    if is_stable(give_xml):
        client_gave_usdt = give_price
        ps_fee = ps_fee_usdt_cb if ps_fee_usdt_cb > 0 else ps_fee_task
        ps_fee_usdt = ps_fee
        if credited_usdt > 0 and ps_fee_usdt <= 0 and client_gave_usdt > credited_usdt:
            ps_fee_usdt = client_gave_usdt - credited_usdt
            ps_fee = ps_fee_usdt
    else:
        ps_fee_usdt = ps_fee_usdt_cb
        if credited_usdt > 0:
            client_gave_usdt = credited_usdt + ps_fee_usdt
        else:
            client_gave_usdt = amount_to_usdt(give_price, give_xml, usdt_per_coin=usdt_per_coin)
            if ps_fee_usdt <= 0:
                ps_fee_usdt = amount_to_usdt(ps_fee_task, give_xml, usdt_per_coin=usdt_per_coin)
        ps_fee = ps_fee_task if ps_fee_task > 0 else ps_fee_usdt

    # --- выплата: себестоимость по свапу CC ---
    paid_out = receiving_price
    paid_out_usdt_cb = _net_out_usdt_from_item(out_item)
    if paid_out_usdt_cb <= 0:
        paid_out_usdt_cb = out_usdt_total
    swap_rate = _d(out_item.get("exchangeRate"))
    if swap_rate <= 0:
        swap_rate = out_exchange_rate

    if paid_out_usdt_cb > 0:
        paid_out_usdt = paid_out_usdt_cb
        if swap_rate > 0:
            asset = (get_xml or "COIN").replace("USDT", "").strip() or get_xml
            course_display = f"CC swap {swap_rate} USDT = 1 {asset}"
    else:
        paid_out_usdt = amount_to_usdt(receiving_price, get_xml, usdt_per_coin=usdt_per_coin)

    system_earned = client_gave_usdt - ps_fee_usdt - paid_out_usdt

    completed = raw.get("completed_at")
    completed_at = completed.isoformat(sep=" ", timespec="seconds") if isinstance(completed, datetime) else (
        str(completed) if completed else None
    )

    return SpreadRow(
        task_id=int(raw["id"]),
        give_xml=give_xml,
        get_xml=get_xml,
        pair=f"{give_xml} -> {get_xml}",
        completed_at=completed_at,
        client_gave=_f(give_price),
        client_gave_usdt=_f(client_gave_usdt),
        ps_fee=_f(ps_fee),
        ps_fee_usdt=_f(ps_fee_usdt),
        paid_out=_f(paid_out if paid_out > 0 else out_amount),
        paid_out_usdt=_f(paid_out_usdt),
        system_earned_usdt=_f(system_earned),
        course_display=str(course_display) if course_display else None,
        merchant_provider=str(raw.get("merchant_provider") or "") or None,
    )


SQL_TEMPLATE = r"""
SELECT
  t.id,
  c1.designation_xml AS give_xml,
  c2.designation_xml AS get_xml,
  t.give_price,
  t.receiving_price,
  t.give_price_fee_pay,
  t.give_price_fee_comm,
  t.course_float,
  t.course_display,
  t.amounts_payload::text AS amounts_payload,
  t.merchant_provider,
  t.completed_at,
  in_cb.usdt_total AS in_usdt_total,
  in_cb.commission AS in_commission,
  in_cb.fee_amount AS in_fee_amount,
  out_cb.usdt_total AS out_usdt_total,
  out_cb.exchange_rate AS out_exchange_rate,
  out_cb.amount AS out_amount
FROM tasks t
JOIN direction_exchange d ON d.id = t.id_direction_exchange
JOIN currencies c1 ON c1.id = d.id_currency1
JOIN currencies c2 ON c2.id = d.id_currency2
LEFT JOIN LATERAL (
  SELECT
    (regexp_match(g.response_body, '"usdtTotal"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1] AS usdt_total,
    COALESCE(
      (regexp_match(g.response_body, '"commission"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS commission,
    COALESCE(
      (regexp_match(g.response_body, '"feeAmount"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS fee_amount
  FROM payment_gateway_logs g
  WHERE g.direction = 'incoming'
    AND g.operation IN ('fetch_payment', 'purchase')
    AND (
      g.task_id = t.id
      OR g.external_id = t.id::text
      OR g.transaction_id = t.id::text
    )
    AND g.response_body LIKE '%%"status":"Paid"%%'
  ORDER BY g.id DESC
  LIMIT 1
) in_cb ON TRUE
LEFT JOIN LATERAL (
  SELECT
    (regexp_match(g.response_body, '"usdtTotal"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1] AS usdt_total,
    (regexp_match(g.response_body, '"exchangeRate"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1] AS exchange_rate,
    (regexp_match(g.response_body, '"amount"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1] AS amount
  FROM payment_gateway_logs g
  WHERE g.direction = 'outgoing'
    AND g.operation IN ('fetch_payout', 'payout')
    AND (
      g.task_id = t.id
      OR g.transaction_id = t.id::text
      OR g.external_id = t.id::text
      OR g.external_id = 'OUT_' || t.id::text
      OR g.transaction_id = 'OUT_' || t.id::text
      OR g.response_body LIKE ('%%"externalId":"OUT_' || t.id::text || '"%%')
    )
    AND g.response_body LIKE '%%"status":"Paid"%%'
  ORDER BY g.id DESC
  LIMIT 1
) out_cb ON TRUE
WHERE t.status = 4
  AND t.deleted_at IS NULL
  AND t.completed_at IS NOT NULL
  {date_filter}
ORDER BY t.completed_at DESC, t.id DESC
LIMIT {limit};
"""


def _build_sql(date_from: datetime | None, date_to: datetime | None, limit: int) -> str:
    clauses: list[str] = []
    if date_from is not None:
        clauses.append(f"AND t.completed_at >= '{date_from.strftime('%Y-%m-%d %H:%M:%S')}'")
    if date_to is not None:
        clauses.append(f"AND t.completed_at <= '{date_to.strftime('%Y-%m-%d %H:%M:%S')}'")
    date_filter = "\n  ".join(clauses)
    return SQL_TEMPLATE.format(date_filter=date_filter, limit=max(1, min(limit, 5000)))


def _csv_to_rows(csv_text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    rows: list[dict[str, Any]] = []
    for item in reader:
        payload = item.get("amounts_payload") or "{}"
        rows.append(
            {
                "id": item.get("id"),
                "give_xml": item.get("give_xml"),
                "get_xml": item.get("get_xml"),
                "give_price": item.get("give_price"),
                "receiving_price": item.get("receiving_price"),
                "give_price_fee_pay": item.get("give_price_fee_pay"),
                "give_price_fee_comm_pay": item.get("give_price_fee_comm") or item.get("give_price_fee_comm_pay"),
                "course_float": item.get("course_float"),
                "course_display": item.get("course_display"),
                "amounts_payload": payload,
                "merchant_provider": item.get("merchant_provider"),
                "completed_at": item.get("completed_at"),
                "in_usdt_total": item.get("in_usdt_total") or "",
                "in_commission": item.get("in_commission") or "",
                "in_fee_amount": item.get("in_fee_amount") or "",
                "out_usdt_total": item.get("out_usdt_total") or "",
                "out_exchange_rate": item.get("out_exchange_rate") or "",
                "out_amount": item.get("out_amount") or "",
            }
        )
    return rows


def fetch_via_direct_db(sql: str) -> list[dict[str, Any]]:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(settings.iex_database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return list(cur.fetchall())


def _ssh_run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(err.strip() or out.strip() or f"SSH exit {code}")
    return out


def fetch_via_ssh_env(sql: str) -> list[dict[str, Any]]:
    host = settings.iex_ssh_host.strip()
    user = settings.iex_ssh_user.strip() or "root"
    password = settings.iex_ssh_password
    if not host or not password:
        raise HTTPException(
            status_code=400,
            detail="Не настроен доступ к обменнику: задайте IEX_DATABASE_URL или IEX_SSH_HOST + IEX_SSH_PASSWORD.",
        )

    sql_one_line = " ".join(line.strip() for line in sql.splitlines() if line.strip())
    remote = (
        "sudo -u postgres psql -d iex -v ON_ERROR_STOP=1 -P pager=off "
        "--csv -c "
        + json.dumps(sql_one_line)
    )
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=int(settings.iex_ssh_port or 22),
        username=user,
        password=password,
        timeout=30,
        banner_timeout=60,
        auth_timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )
    try:
        csv_text = _ssh_run(client, remote)
    finally:
        client.close()
    return _csv_to_rows(csv_text)


def fetch_via_panel_server(db: Session, server_id: int, sql: str) -> list[dict[str, Any]]:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден.")
    password = decrypt_secret(server.password_enc) if server.password_enc else None
    private_key = resolve_server_private_key(server)
    if not password and not private_key and not server.key_path:
        raise HTTPException(status_code=400, detail="У сервера нет SSH-пароля/ключа.")

    sql_one_line = " ".join(line.strip() for line in sql.splitlines() if line.strip())
    remote = (
        "sudo -u postgres psql -d iex -v ON_ERROR_STOP=1 -P pager=off "
        "--csv -c "
        + json.dumps(sql_one_line)
    )
    client = build_ssh_client(
        host=server.ip,
        port=int(server.port or 22),
        username=server.login,
        password=password,
        key_path=server.key_path,
        private_key_pem=private_key,
    )
    try:
        csv_text = _ssh_run(client, remote)
    finally:
        client.close()
    return _csv_to_rows(csv_text)


def load_raw_tasks(
    db: Session,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    limit: int,
    server_id: int | None,
) -> tuple[list[dict[str, Any]], str]:
    sql = _build_sql(date_from, date_to, limit)
    if server_id is not None:
        return fetch_via_panel_server(db, server_id, sql), f"ssh:server:{server_id}"
    if settings.iex_database_url.strip():
        return fetch_via_direct_db(sql), "database_url"
    if settings.iex_ssh_host.strip():
        return fetch_via_ssh_env(sql), f"ssh:{settings.iex_ssh_host}"
    raise HTTPException(
        status_code=400,
        detail="Нет источника данных обменника. Укажите server_id, IEX_DATABASE_URL или IEX_SSH_*.",
    )


def build_spread_report(
    db: Session,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 1000,
    server_id: int | None = None,
) -> dict[str, Any]:
    raw_rows, source = load_raw_tasks(
        db,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        server_id=server_id,
    )
    orders: list[SpreadRow] = []
    for raw in raw_rows:
        row = row_from_task(raw)
        if row is not None:
            orders.append(row)

    total_client = sum((Decimal(str(o.client_gave_usdt)) for o in orders), Decimal("0"))
    total_ps = sum((Decimal(str(o.ps_fee_usdt)) for o in orders), Decimal("0"))
    total_paid = sum((Decimal(str(o.paid_out_usdt)) for o in orders), Decimal("0"))
    total_earned = sum((Decimal(str(o.system_earned_usdt)) for o in orders), Decimal("0"))

    by_pair: dict[str, dict[str, Any]] = {}
    for order in orders:
        bucket = by_pair.setdefault(
            order.pair,
            {
                "pair": order.pair,
                "orders_count": 0,
                "client_gave_usdt": 0.0,
                "ps_fee_usdt": 0.0,
                "paid_out_usdt": 0.0,
                "system_earned_usdt": 0.0,
            },
        )
        bucket["orders_count"] += 1
        bucket["client_gave_usdt"] = _f(_d(bucket["client_gave_usdt"]) + _d(order.client_gave_usdt))
        bucket["ps_fee_usdt"] = _f(_d(bucket["ps_fee_usdt"]) + _d(order.ps_fee_usdt))
        bucket["paid_out_usdt"] = _f(_d(bucket["paid_out_usdt"]) + _d(order.paid_out_usdt))
        bucket["system_earned_usdt"] = _f(_d(bucket["system_earned_usdt"]) + _d(order.system_earned_usdt))

    pairs = sorted(by_pair.values(), key=lambda item: item["system_earned_usdt"], reverse=True)

    return {
        "source": source,
        "currency": "USDT",
        "orders_count": len(orders),
        "scanned_count": len(raw_rows),
        "client_gave_usdt": _f(total_client),
        "ps_fee_usdt": _f(total_ps),
        "paid_out_usdt": _f(total_paid),
        "system_earned_usdt": _f(total_earned),
        "pairs": pairs,
        "orders": [
            {
                "task_id": o.task_id,
                "pair": o.pair,
                "give_xml": o.give_xml,
                "get_xml": o.get_xml,
                "completed_at": o.completed_at,
                "client_gave": o.client_gave,
                "client_gave_usdt": o.client_gave_usdt,
                "ps_fee": o.ps_fee,
                "ps_fee_usdt": o.ps_fee_usdt,
                "paid_out": o.paid_out,
                "paid_out_usdt": o.paid_out_usdt,
                "system_earned_usdt": o.system_earned_usdt,
                "course_display": o.course_display,
                "merchant_provider": o.merchant_provider,
            }
            for o in orders
        ],
    }
