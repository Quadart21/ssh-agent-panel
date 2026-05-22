"""server accounting fields

Revision ID: 0004_server_accounting
Revises: 0003_user_password_policy
Create Date: 2026-05-22 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0004_server_accounting"
down_revision = "0003_user_password_policy"
branch_labels = None
depends_on = None

NEW_COLUMNS = (
    ("monthly_cost", sa.Float(), None),
    ("billing_period", sa.String(length=16), "monthly"),
    ("currency", sa.String(length=8), "RUB"),
    ("provider", sa.String(length=120), None),
    ("setup_cost", sa.Float(), None),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("servers")}
    for name, col_type, default in NEW_COLUMNS:
        if name in columns:
            continue
        kwargs: dict = {"nullable": True}
        if default is not None:
            kwargs["server_default"] = default
        op.add_column("servers", sa.Column(name, col_type, **kwargs))
    if bind.dialect.name != "sqlite":
        op.alter_column("servers", "billing_period", server_default=None)
        op.alter_column("servers", "currency", server_default=None)


def downgrade() -> None:
    for name, _, _ in reversed(NEW_COLUMNS):
        op.drop_column("servers", name)
