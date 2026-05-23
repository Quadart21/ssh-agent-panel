"""server metrics cache columns

Revision ID: 0012_server_metrics_cache
Revises: 0011_metrics_embeds
Create Date: 2026-05-23 22:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0012_server_metrics_cache"
down_revision = "0011_metrics_embeds"
branch_labels = None
depends_on = None

_COLUMNS = (
    ("metrics_cpu_percent", sa.Integer(), None),
    ("metrics_ram_percent", sa.Integer(), None),
    ("metrics_disk_percent", sa.Integer(), None),
    ("metrics_uptime", sa.String(length=64), None),
    ("metrics_online", sa.Boolean(), False),
    ("metrics_available", sa.Boolean(), False),
    ("metrics_source", sa.String(length=32), None),
    ("metrics_collected_at", sa.DateTime(), None),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("servers")}
    for name, column_type, server_default in _COLUMNS:
        if name in existing:
            continue
        kwargs = {"nullable": True}
        if server_default is not None:
            kwargs["server_default"] = sa.false() if server_default is False else server_default
        op.add_column("servers", sa.Column(name, column_type, **kwargs))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("servers")}
    for name, _, _ in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("servers", name)
