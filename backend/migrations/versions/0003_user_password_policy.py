"""user password policy fields

Revision ID: 0003_user_password_policy
Revises: 0002_prod_hardening
Create Date: 2026-03-20 01:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0003_user_password_policy"
down_revision = "0002_prod_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    dialect_name = bind.dialect.name
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "must_change_password" not in columns:
        op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
        if dialect_name == "postgresql":
            op.execute("UPDATE users SET must_change_password = false WHERE must_change_password IS NULL")
        else:
            op.execute("UPDATE users SET must_change_password = 0 WHERE must_change_password IS NULL")
        if dialect_name != "sqlite":
            op.alter_column("users", "must_change_password", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
