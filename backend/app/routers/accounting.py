from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import (
    apply_server_scope,
    ensure_action_access,
    ensure_section_access,
    ensure_server_access,
    get_current_user,
    scoped_server_ids,
)
from app.models import AccountingBudget, AccountingPayment, AccountingPlan, InfraAsset, Server, User
from app.schemas import (
    AccountingBudgetCreate,
    AccountingBudgetRead,
    AccountingBudgetUpdate,
    AccountingMarkPaidRequest,
    AccountingMarkPaidResponse,
    AccountingOverview,
    AccountingPaymentCreate,
    AccountingPaymentRead,
    AccountingPaymentUpdate,
    AccountingPlanCreate,
    AccountingPlanRead,
    AccountingPlanUpdate,
    AccountingReport,
    InfraAssetCreate,
    InfraAssetRead,
    InfraAssetUpdate,
)
from app.services.accounting import normalize_monthly_cost
from app.services.accounting_reports import (
    budget_actual_amount,
    build_calendar_events,
    build_overview,
    build_report,
    extend_pay_until,
    month_bounds,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _require_view(user: User) -> None:
    ensure_section_access(user, "accounting")


def _require_manage(user: User) -> None:
    ensure_section_access(user, "accounting")
    ensure_action_access(user, "accounting_manage")


def _asset_read(asset: InfraAsset) -> InfraAssetRead:
    model = InfraAssetRead.model_validate(asset, from_attributes=True)
    return model.model_copy(update={"monthly_equivalent": normalize_monthly_cost(asset.cost, asset.billing_period)})


def _budget_read(db: Session, budget: AccountingBudget) -> AccountingBudgetRead:
    model = AccountingBudgetRead.model_validate(budget, from_attributes=True)
    return model.model_copy(update={"actual_amount": budget_actual_amount(db, budget)})


def _validate_links(db: Session, user: User, server_id: int | None, asset_id: int | None) -> None:
    if server_id is not None:
        server = db.get(Server, server_id)
        if not server:
            raise HTTPException(status_code=404, detail="Сервер не найден.")
        ensure_server_access(user, server)
    if asset_id is not None and not db.get(InfraAsset, asset_id):
        raise HTTPException(status_code=404, detail="Актив не найден.")


@router.get("/overview", response_model=AccountingOverview)
def accounting_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_view(current_user)
    return build_overview(db, user_server_ids=scoped_server_ids(current_user))


@router.get("/calendar")
def accounting_calendar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_view(current_user)
    query = apply_server_scope(db.query(Server).options(joinedload(Server.group)), current_user)
    servers = query.all()
    assets = db.query(InfraAsset).all()
    plans = db.query(AccountingPlan).filter(AccountingPlan.status == "planned").all()
    return build_calendar_events(servers, assets, plans)


@router.get("/reports", response_model=AccountingReport)
def accounting_reports(
    period_from: datetime | None = Query(default=None, alias="from"),
    period_to: datetime | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    now = datetime.utcnow()
    if period_from is None or period_to is None:
        start, end = month_bounds(now.year, now.month)
        period_from = period_from or start
        period_to = period_to or end
    if period_to < period_from:
        raise HTTPException(status_code=400, detail="Некорректный период отчёта.")
    return build_report(db, period_from=period_from, period_to=period_to, user_server_ids=scoped_server_ids(current_user))


@router.get("/assets", response_model=list[InfraAssetRead])
def list_assets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_view(current_user)
    assets = db.query(InfraAsset).order_by(InfraAsset.name.asc()).all()
    return [_asset_read(asset) for asset in assets]


@router.post("/assets", response_model=InfraAssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: InfraAssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    asset = InfraAsset(**payload.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    write_audit_log(db, user=current_user, action="accounting.asset_create", target_type="infra_asset", target_id=str(asset.id), details=asset.name)
    return _asset_read(asset)


@router.put("/assets/{asset_id}", response_model=InfraAssetRead)
def update_asset(
    asset_id: int,
    payload: InfraAssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    asset = db.get(InfraAsset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Актив не найден.")
    for field, value in payload.model_dump().items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    write_audit_log(db, user=current_user, action="accounting.asset_update", target_type="infra_asset", target_id=str(asset.id), details=asset.name)
    return _asset_read(asset)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    asset = db.get(InfraAsset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Актив не найден.")
    name = asset.name
    db.delete(asset)
    db.commit()
    write_audit_log(db, user=current_user, action="accounting.asset_delete", target_type="infra_asset", target_id=str(asset_id), details=name)


@router.get("/payments", response_model=list[AccountingPaymentRead])
def list_payments(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    return (
        db.query(AccountingPayment)
        .order_by(AccountingPayment.paid_at.desc(), AccountingPayment.id.desc())
        .limit(limit)
        .all()
    )


@router.post("/payments", response_model=AccountingPaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: AccountingPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    _validate_links(db, current_user, payload.server_id, payload.asset_id)
    payment = AccountingPayment(**payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    write_audit_log(
        db,
        user=current_user,
        action="accounting.payment_create",
        target_type="accounting_payment",
        target_id=str(payment.id),
        details=f"{payment.title}: {payment.amount} {payment.currency}",
    )
    return payment


@router.put("/payments/{payment_id}", response_model=AccountingPaymentRead)
def update_payment(
    payment_id: int,
    payload: AccountingPaymentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    payment = db.get(AccountingPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден.")
    _validate_links(db, current_user, payload.server_id, payload.asset_id)
    for field, value in payload.model_dump().items():
        setattr(payment, field, value)
    db.commit()
    db.refresh(payment)
    write_audit_log(db, user=current_user, action="accounting.payment_update", target_type="accounting_payment", target_id=str(payment.id), details=payment.title)
    return payment


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    payment = db.get(AccountingPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден.")
    title = payment.title
    db.delete(payment)
    db.commit()
    write_audit_log(db, user=current_user, action="accounting.payment_delete", target_type="accounting_payment", target_id=str(payment_id), details=title)


@router.get("/plans", response_model=list[AccountingPlanRead])
def list_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_view(current_user)
    return db.query(AccountingPlan).order_by(AccountingPlan.due_date.asc(), AccountingPlan.id.asc()).all()


@router.post("/plans", response_model=AccountingPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: AccountingPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    _validate_links(db, current_user, payload.server_id, payload.asset_id)
    plan = AccountingPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    write_audit_log(db, user=current_user, action="accounting.plan_create", target_type="accounting_plan", target_id=str(plan.id), details=plan.title)
    return plan


@router.put("/plans/{plan_id}", response_model=AccountingPlanRead)
def update_plan(
    plan_id: int,
    payload: AccountingPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    plan = db.get(AccountingPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден.")
    _validate_links(db, current_user, payload.server_id, payload.asset_id)
    for field, value in payload.model_dump().items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    write_audit_log(db, user=current_user, action="accounting.plan_update", target_type="accounting_plan", target_id=str(plan.id), details=plan.title)
    return plan


@router.post("/plans/{plan_id}/complete", response_model=AccountingMarkPaidResponse)
def complete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    plan = db.get(AccountingPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден.")
    if plan.status != "planned":
        raise HTTPException(status_code=409, detail="План уже закрыт.")

    payment = AccountingPayment(
        paid_at=datetime.utcnow(),
        amount=plan.amount,
        currency=plan.currency,
        title=plan.title,
        category=plan.category,
        server_id=plan.server_id,
        asset_id=plan.asset_id,
        notes=plan.notes,
    )
    plan.status = "paid"
    db.add(payment)
    db.commit()
    db.refresh(payment)
    write_audit_log(db, user=current_user, action="accounting.plan_complete", target_type="accounting_plan", target_id=str(plan.id), details=plan.title)
    return AccountingMarkPaidResponse(payment=AccountingPaymentRead.model_validate(payment, from_attributes=True), pay_until=None)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    plan = db.get(AccountingPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден.")
    title = plan.title
    db.delete(plan)
    db.commit()
    write_audit_log(db, user=current_user, action="accounting.plan_delete", target_type="accounting_plan", target_id=str(plan_id), details=title)


@router.get("/budgets", response_model=list[AccountingBudgetRead])
def list_budgets(
    year: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    query = db.query(AccountingBudget)
    if year is not None:
        query = query.filter(AccountingBudget.year == year)
    budgets = query.order_by(AccountingBudget.year.desc(), AccountingBudget.month.desc()).all()
    return [_budget_read(db, budget) for budget in budgets]


@router.post("/budgets", response_model=AccountingBudgetRead, status_code=status.HTTP_201_CREATED)
def create_budget(
    payload: AccountingBudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    existing = (
        db.query(AccountingBudget)
        .filter(
            AccountingBudget.year == payload.year,
            AccountingBudget.month == payload.month,
            AccountingBudget.currency == payload.currency,
            AccountingBudget.category.is_(payload.category) if payload.category is None else AccountingBudget.category == payload.category,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Бюджет на этот период уже есть.")
    budget = AccountingBudget(**payload.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    write_audit_log(
        db,
        user=current_user,
        action="accounting.budget_create",
        target_type="accounting_budget",
        target_id=str(budget.id),
        details=f"{budget.year}-{budget.month:02d}: {budget.planned_amount} {budget.currency}",
    )
    return _budget_read(db, budget)


@router.put("/budgets/{budget_id}", response_model=AccountingBudgetRead)
def update_budget(
    budget_id: int,
    payload: AccountingBudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    budget = db.get(AccountingBudget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден.")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(budget, field, value)
    db.commit()
    db.refresh(budget)
    write_audit_log(db, user=current_user, action="accounting.budget_update", target_type="accounting_budget", target_id=str(budget.id))
    return _budget_read(db, budget)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    budget = db.get(AccountingBudget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден.")
    db.delete(budget)
    db.commit()
    write_audit_log(db, user=current_user, action="accounting.budget_delete", target_type="accounting_budget", target_id=str(budget_id))


@router.post("/mark-paid", response_model=AccountingMarkPaidResponse)
def mark_paid(
    payload: AccountingMarkPaidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    paid_at = payload.paid_at or datetime.utcnow()

    if payload.target_type == "server":
        server = db.get(Server, payload.target_id)
        if not server:
            raise HTTPException(status_code=404, detail="Сервер не найден.")
        ensure_server_access(current_user, server)
        amount = payload.amount if payload.amount is not None else (server.monthly_cost or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Укажите сумму оплаты.")
        server.pay_until = extend_pay_until(server.pay_until, server.billing_period, now=paid_at)
        payment = AccountingPayment(
            paid_at=paid_at,
            amount=amount,
            currency=(server.currency or "RUB").upper(),
            title=f"Оплата сервера {server.name}",
            category="server",
            server_id=server.id,
            notes=payload.notes,
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        write_audit_log(
            db,
            user=current_user,
            action="accounting.mark_paid_server",
            target_type="server",
            target_id=str(server.id),
            details=f"{amount} {payment.currency}; pay_until={server.pay_until}",
        )
        return AccountingMarkPaidResponse(
            payment=AccountingPaymentRead.model_validate(payment, from_attributes=True),
            pay_until=server.pay_until,
        )

    asset = db.get(InfraAsset, payload.target_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Актив не найден.")
    amount = payload.amount if payload.amount is not None else (asset.cost or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Укажите сумму оплаты.")
    asset.pay_until = extend_pay_until(asset.pay_until, asset.billing_period, now=paid_at)
    payment = AccountingPayment(
        paid_at=paid_at,
        amount=amount,
        currency=(asset.currency or "RUB").upper(),
        title=f"Оплата актива {asset.name}",
        category=asset.category or "other",
        asset_id=asset.id,
        notes=payload.notes,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    write_audit_log(
        db,
        user=current_user,
        action="accounting.mark_paid_asset",
        target_type="infra_asset",
        target_id=str(asset.id),
        details=f"{amount} {payment.currency}; pay_until={asset.pay_until}",
    )
    return AccountingMarkPaidResponse(
        payment=AccountingPaymentRead.model_validate(payment, from_attributes=True),
        pay_until=asset.pay_until,
    )
