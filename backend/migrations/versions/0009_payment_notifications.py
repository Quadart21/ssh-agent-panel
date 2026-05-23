"""payment notification states and telegram batches

Revision ID: 0009_payment_notifications
Revises: 0008_cloudflare_settings
Create Date: 2026-05-23 14:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0009_payment_notifications"
down_revision = "0008_cloudflare_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "server_payment_notification_states" not in tables:
        op.create_table(
            "server_payment_notification_states",
            sa.Column("server_id", sa.Integer(), sa.ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("sent_7d_at", sa.DateTime(), nullable=True),
            sa.Column("sent_3d_at", sa.DateTime(), nullable=True),
            sa.Column("overdue_notices_sent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_overdue_sent_at", sa.DateTime(), nullable=True),
        )

    if "payment_notification_batches" not in tables:
        op.create_table(
            "payment_notification_batches",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("category", sa.String(length=32), nullable=False, index=True),
            sa.Column("server_ids", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("telegram_message_id", sa.Integer(), nullable=True),
            sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("payment_notification_batches")
    op.drop_table("server_payment_notification_states")
