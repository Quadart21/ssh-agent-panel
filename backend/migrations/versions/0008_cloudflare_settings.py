"""cloudflare settings table

Revision ID: 0008_cloudflare_settings
Revises: 0007_agent_tasks
Create Date: 2026-05-23 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0008_cloudflare_settings"
down_revision = "0007_agent_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "cloudflare_settings" in inspector.get_table_names():
        return
    op.create_table(
        "cloudflare_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("api_token", sa.String(length=512), nullable=True),
        sa.Column("account_id", sa.String(length=64), nullable=True),
        sa.Column("default_ttl", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("cloudflare_settings")
