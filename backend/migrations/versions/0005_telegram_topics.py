"""telegram topics for notification routing

Revision ID: 0005_telegram_topics
Revises: 0004_server_accounting
Create Date: 2026-05-22 22:55:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0005_telegram_topics"
down_revision = "0004_server_accounting"
branch_labels = None
depends_on = None

TOPIC_COLUMNS = (
    "telegram_topic_general",
    "telegram_topic_login",
    "telegram_topic_servers",
    "telegram_topic_payments",
    "telegram_topic_automation",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("notification_settings")}
    for name in TOPIC_COLUMNS:
        if name in columns:
            continue
        op.add_column("notification_settings", sa.Column(name, sa.Integer(), nullable=True))


def downgrade() -> None:
    for name in reversed(TOPIC_COLUMNS):
        op.drop_column("notification_settings", name)
