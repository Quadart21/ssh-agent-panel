from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_section_access, get_current_user
from app.models import User
from app.schemas import CryptoSpreadOrder, CryptoSpreadPairStat, CryptoSpreadReport
from app.services.crypto_spread import build_spread_report

router = APIRouter(prefix="/crypto-spread", tags=["crypto-spread"])


@router.get("/report", response_model=CryptoSpreadReport)
def crypto_spread_report(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "crypto-spread")
    payload = build_spread_report(
        db,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    return CryptoSpreadReport(
        source=payload["source"],
        currency=payload["currency"],
        orders_count=payload["orders_count"],
        scanned_count=payload["scanned_count"],
        client_gave_usdt=payload["client_gave_usdt"],
        ps_fee_usdt=payload["ps_fee_usdt"],
        paid_out_usdt=payload["paid_out_usdt"],
        system_earned_usdt=payload["system_earned_usdt"],
        pairs=[CryptoSpreadPairStat(**item) for item in payload["pairs"]],
        orders=[CryptoSpreadOrder(**item) for item in payload["orders"]],
    )
