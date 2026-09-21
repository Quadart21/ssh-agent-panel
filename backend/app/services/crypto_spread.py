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
class CallbackBlock:
    side: str  # in | out
    title: str
    lines: list[str]
    tx_hash: str | None = None
    status: str | None = None


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
    callbacks: list[CallbackBlock]


def _short_hash(value: str | None, keep: int = 10) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) <= keep * 2 + 1:
        return text
    return f"{text[:keep]}…{text[-keep:]}"


def _fmt_num(value: Decimal, digits: int = 8) -> str:
    if value == 0:
        return "0"
    text = f"{value:.{digits}f}".rstrip("0").rstrip(".")
    return text or "0"


def _s(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def build_in_callback(
    *,
    give_xml: str,
    give_price: Decimal,
    fee_usdt: Decimal,
    credited_usdt: Decimal,
    amount: Decimal,
    network: str,
    tx_hash: str,
    status: str,
    pair: str,
    exchange_rate: Decimal,
) -> CallbackBlock | None:
    has_data = any([amount > 0, credited_usdt > 0, fee_usdt > 0, tx_hash, status, network])
    if not has_data:
        return None

    st = status or "Paid"
    lines: list[str] = []
    asset = _human_asset(give_xml)
    got = amount if amount > 0 else give_price
    if got > 0:
        net = f" · {network}" if network else ""
        lines.append(f"Клиент прислал {_fmt_num(got)} {asset}{net}")
    if fee_usdt > 0:
        lines.append(f"Комиссия CryptoCash {_fmt_num(fee_usdt)} USDT")
    if credited_usdt > 0:
        lines.append(f"На баланс зачислено {_fmt_num(credited_usdt)} USDT")
    if pair:
        lines.append(f"Пара колбека {pair}")
    if exchange_rate > 0 and not is_stable(give_xml):
        lines.append(f"Курс входа {_fmt_num(exchange_rate)}")
    short = _short_hash(tx_hash)
    if short:
        lines.append(f"TX {short}")

    return CallbackBlock(
        side="in",
        title=f"Вход · {st}",
        lines=lines,
        tx_hash=tx_hash or None,
        status=st,
    )


def _human_asset(xml: str) -> str:
    raw = (xml or "").upper()
    networks = ("TRC20", "ERC20", "BEP20", "BEP2", "POLYGON", "SOL", "TON", "ARBITRUM", "OPTIMISM", "BASE")
    for net in networks:
        if raw.endswith(net) and len(raw) > len(net):
            return f"{raw[: -len(net)]} {net}"
    return raw or "—"


def build_out_callback(
    *,
    get_xml: str,
    paid_out: Decimal,
    paid_out_usdt: Decimal,
    amount: Decimal,
    exchange_rate: Decimal,
    network: str,
    network_fee: str,
    tx_hash: str,
    status: str,
    pair: str,
) -> CallbackBlock | None:
    has_data = any([paid_out_usdt > 0, amount > 0, exchange_rate > 0, tx_hash, status, pair])
    if not has_data:
        return None

    st = status or "Paid"
    lines: list[str] = []
    asset = _human_asset(get_xml)
    if pair:
        lines.append(f"Свап {pair.replace('/', ' → ')}")
    if exchange_rate > 0:
        lines.append(f"Курс свапа {_fmt_num(exchange_rate)} USDT = 1 {asset.split()[0]}")
    sent = paid_out if paid_out > 0 else amount
    if sent > 0:
        net = f" · {network}" if network else ""
        # amount в Paid часто = requested + network fee
        if amount > sent:
            lines.append(f"Клиенту {_fmt_num(sent)} {asset}{net}")
            lines.append(f"Купили у CC {_fmt_num(amount)} {asset} (с network fee)")
        else:
            lines.append(f"Отправили {_fmt_num(sent)} {asset}{net}")
    elif amount > 0:
        net = f" · {network}" if network else ""
        lines.append(f"Объём покупки {_fmt_num(amount)} {asset}{net}")
    if network_fee:
        lines.append(f"Network fee {network_fee}")
    if paid_out_usdt > 0:
        lines.append(f"Себестоимость {_fmt_num(paid_out_usdt)} USDT")
    short = _short_hash(tx_hash)
    if short:
        lines.append(f"TX {short}")

    return CallbackBlock(
        side="out",
        title=f"Выплата · {st}",
        lines=lines,
        tx_hash=tx_hash or None,
        status=st,
    )


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
    in_amount = _d(raw.get("in_amount"))
    in_network = _s(raw.get("in_network"))
    in_hash = _s(raw.get("in_hash"))
    in_status = _s(raw.get("in_status")) or "Paid"
    in_pair = _s(raw.get("in_pair"))
    in_exchange_rate = _d(raw.get("in_exchange_rate"))
    out_usdt_total = _d(raw.get("out_usdt_total"))
    out_exchange_rate = _d(raw.get("out_exchange_rate"))
    out_amount = _d(raw.get("out_amount"))
    out_network = _s(raw.get("out_network"))
    out_hash = _s(raw.get("out_hash"))
    out_status = _s(raw.get("out_status")) or "Paid"
    out_pair = _s(raw.get("out_pair"))
    out_network_fee = _s(raw.get("out_network_fee"))

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

    paid_out_final = paid_out if paid_out > 0 else out_amount
    callbacks: list[CallbackBlock] = []
    has_in_raw = bool(in_usdt_total or in_commission or in_fee_amount or in_amount or in_hash or in_network)
    has_out_raw = bool(out_usdt_total or out_amount or out_exchange_rate or out_hash or out_pair or out_network_fee)
    if has_in_raw:
        in_cb = build_in_callback(
            give_xml=give_xml,
            give_price=give_price,
            fee_usdt=ps_fee_usdt,
            credited_usdt=credited_usdt,
            amount=in_amount if in_amount > 0 else _d(in_item.get("amount")),
            network=in_network or _s(in_item.get("network")),
            tx_hash=in_hash or _s(in_item.get("hash")),
            status=in_status or _s(in_item.get("status")),
            pair=in_pair or _s(in_item.get("pair")),
            exchange_rate=in_exchange_rate if in_exchange_rate > 0 else _d(in_item.get("exchangeRate")),
        )
        if in_cb:
            callbacks.append(in_cb)
    if has_out_raw:
        out_cb = build_out_callback(
            get_xml=get_xml,
            paid_out=paid_out_final,
            paid_out_usdt=paid_out_usdt,
            amount=out_amount if out_amount > 0 else _d(out_item.get("amount")),
            exchange_rate=swap_rate,
            network=out_network or _s(out_item.get("network")),
            network_fee=out_network_fee or _s(out_item.get("networkFee")),
            tx_hash=out_hash or _s(out_item.get("hash")),
            status=out_status or _s(out_item.get("status")),
            pair=out_pair or _s(out_item.get("pair")),
        )
        if out_cb:
            callbacks.append(out_cb)

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
        paid_out=_f(paid_out_final),
        paid_out_usdt=_f(paid_out_usdt),
        system_earned_usdt=_f(system_earned),
        course_display=str(course_display) if course_display else None,
        merchant_provider=str(raw.get("merchant_provider") or "") or None,
        callbacks=callbacks,
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
  in_cb.amount AS in_amount,
  in_cb.network AS in_network,
  in_cb.hash AS in_hash,
  in_cb.status AS in_status,
  in_cb.pair AS in_pair,
  in_cb.exchange_rate AS in_exchange_rate,
  out_cb.usdt_total AS out_usdt_total,
  out_cb.exchange_rate AS out_exchange_rate,
  out_cb.amount AS out_amount,
  out_cb.network AS out_network,
  out_cb.hash AS out_hash,
  out_cb.status AS out_status,
  out_cb.pair AS out_pair,
  out_cb.network_fee AS out_network_fee
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
    ) AS fee_amount,
    COALESCE(
      (regexp_match(g.response_body, '"amount"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS amount,
    COALESCE(
      (regexp_match(g.response_body, '"network"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS network,
    COALESCE(
      (regexp_match(g.response_body, '"hash"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS hash,
    COALESCE(
      (regexp_match(g.response_body, '"status"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS status,
    COALESCE(
      (regexp_match(g.response_body, '"pair"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS pair,
    COALESCE(
      (regexp_match(g.response_body, '"exchangeRate"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS exchange_rate
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
    (regexp_match(g.response_body, '"amount"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1] AS amount,
    COALESCE(
      (regexp_match(g.response_body, '"network"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS network,
    COALESCE(
      (regexp_match(g.response_body, '"hash"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS hash,
    COALESCE(
      (regexp_match(g.response_body, '"status"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS status,
    COALESCE(
      (regexp_match(g.response_body, '"pair"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS pair,
    COALESCE(
      (regexp_match(g.response_body, '"networkFee"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
      ''
    ) AS network_fee
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
                "in_amount": item.get("in_amount") or "",
                "in_network": item.get("in_network") or "",
                "in_hash": item.get("in_hash") or "",
                "in_status": item.get("in_status") or "",
                "in_pair": item.get("in_pair") or "",
                "in_exchange_rate": item.get("in_exchange_rate") or "",
                "out_usdt_total": item.get("out_usdt_total") or "",
                "out_exchange_rate": item.get("out_exchange_rate") or "",
                "out_amount": item.get("out_amount") or "",
                "out_network": item.get("out_network") or "",
                "out_hash": item.get("out_hash") or "",
                "out_status": item.get("out_status") or "",
                "out_pair": item.get("out_pair") or "",
                "out_network_fee": item.get("out_network_fee") or "",
            }
        )
    return rows


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
            detail="Не настроен SSH к обменнику: задайте IEX_SSH_HOST и IEX_SSH_PASSWORD.",
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
        raise HTTPException(
            status_code=404,
            detail=f"Сервер обменника #{server_id} не найден в панели.",
        )
    password = decrypt_secret(server.password_enc) if server.password_enc else None
    private_key = resolve_server_private_key(server)
    if not password and not private_key and not server.key_path:
        raise HTTPException(status_code=400, detail="У сервера обменника нет SSH-пароля/ключа.")

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
) -> tuple[list[dict[str, Any]], str]:
    """Единственный источник: SSH. По умолчанию — сервер панели IEX_SSH_SERVER_ID (27)."""
    sql = _build_sql(date_from, date_to, limit)
    # Опционально: прямые IEX_SSH_* из .env (локальная отладка)
    if settings.iex_ssh_host.strip() and settings.iex_ssh_password:
        return fetch_via_ssh_env(sql), f"ssh:{settings.iex_ssh_host.strip()}"
    server_id = int(settings.iex_ssh_server_id or 27)
    return fetch_via_panel_server(db, server_id, sql), f"ssh:server:{server_id}"


def build_spread_report(
    db: Session,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 1000,
) -> dict[str, Any]:
    raw_rows, source = load_raw_tasks(
        db,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
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
                "callbacks": [
                    {
                        "side": cb.side,
                        "title": cb.title,
                        "lines": cb.lines,
                        "tx_hash": cb.tx_hash,
                        "status": cb.status,
                    }
                    for cb in o.callbacks
                ],
            }
            for o in orders
        ],
    }
