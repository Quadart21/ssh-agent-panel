"""server agent heartbeat fields

Revision ID: 0006_server_agent_fields
Revises: 0005_telegram_topics
Create Date: 2026-05-22 23:45:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0006_server_agent_fields"
down_revision = "0005_telegram_topics"
branch_labels = None
depends_on = None

NEW_COLUMNS = (
    ("agent_enabled", sa.Boolean(), sa.false()),
    ("agent_token_hash", sa.String(length=64), None),
    ("agent_version", sa.String(length=32), None),
    ("agent_last_seen_at", sa.DateTime(), None),
    ("agent_cpu_percent", sa.Integer(), None),
    ("agent_ram_percent", sa.Integer(), None),
    ("agent_disk_percent", sa.Integer(), None),
    ("agent_uptime", sa.String(length=64), None),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("servers")}
    for name, col_type, default in NEW_COLUMNS:
        if name in columns:
            continue
        kwargs: dict[str, object] = {"nullable": True}
        if default is not None:
            kwargs["server_default"] = default
        op.add_column("servers", sa.Column(name, col_type, **kwargs))
    op.create_index("ix_servers_agent_token_hash", "servers", ["agent_token_hash"], unique=False)
    op.create_index("ix_servers_agent_last_seen_at", "servers", ["agent_last_seen_at"], unique=False)
    if bind.dialect.name != "sqlite":
        op.alter_column("servers", "agent_enabled", nullable=False, server_default=None)


def downgrade() -> None:
    op.drop_index("ix_servers_agent_last_seen_at", table_name="servers")
    op.drop_index("ix_servers_agent_token_hash", table_name="servers")
    for name, _, _ in reversed(NEW_COLUMNS):
        op.drop_column("servers", name)
