"""infrastructure accounting tables

Revision ID: 0016_accounting
Revises: 0015_metrics_embed_accent
Create Date: 2026-09-14 02:50:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0016_accounting"
down_revision = "0015_metrics_embed_accent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "infra_assets" not in tables:
        op.create_table(
            "infra_assets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
            sa.Column("provider", sa.String(length=120), nullable=True),
            sa.Column("cost", sa.Float(), nullable=True),
            sa.Column("billing_period", sa.String(length=16), nullable=False, server_default="monthly"),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
            sa.Column("pay_until", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_infra_assets_id", "infra_assets", ["id"])
        op.create_index("ix_infra_assets_category", "infra_assets", ["category"])
        op.create_index("ix_infra_assets_pay_until", "infra_assets", ["pay_until"])

    if "accounting_payments" not in tables:
        op.create_table(
            "accounting_payments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("paid_at", sa.DateTime(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
            sa.Column("server_id", sa.Integer(), sa.ForeignKey("servers.id", ondelete="SET NULL"), nullable=True),
            sa.Column("asset_id", sa.Integer(), sa.ForeignKey("infra_assets.id", ondelete="SET NULL"), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_accounting_payments_id", "accounting_payments", ["id"])
        op.create_index("ix_accounting_payments_paid_at", "accounting_payments", ["paid_at"])
        op.create_index("ix_accounting_payments_category", "accounting_payments", ["category"])
        op.create_index("ix_accounting_payments_server_id", "accounting_payments", ["server_id"])
        op.create_index("ix_accounting_payments_asset_id", "accounting_payments", ["asset_id"])

    if "accounting_plans" not in tables:
        op.create_table(
            "accounting_plans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
            sa.Column("due_date", sa.DateTime(), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
            sa.Column("server_id", sa.Integer(), sa.ForeignKey("servers.id", ondelete="SET NULL"), nullable=True),
            sa.Column("asset_id", sa.Integer(), sa.ForeignKey("infra_assets.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_accounting_plans_id", "accounting_plans", ["id"])
        op.create_index("ix_accounting_plans_due_date", "accounting_plans", ["due_date"])
        op.create_index("ix_accounting_plans_status", "accounting_plans", ["status"])
        op.create_index("ix_accounting_plans_category", "accounting_plans", ["category"])

    if "accounting_budgets" not in tables:
        op.create_table(
            "accounting_budgets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("month", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
            sa.Column("planned_amount", sa.Float(), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("year", "month", "currency", "category", name="uq_accounting_budgets_period"),
        )
        op.create_index("ix_accounting_budgets_id", "accounting_budgets", ["id"])
        op.create_index("ix_accounting_budgets_year_month", "accounting_budgets", ["year", "month"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    for name in ("accounting_budgets", "accounting_plans", "accounting_payments", "infra_assets"):
        if name in tables:
            op.drop_table(name)
