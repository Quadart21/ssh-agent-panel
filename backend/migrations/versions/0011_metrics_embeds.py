"""metrics embed widgets and drop server checks

Revision ID: 0011_metrics_embeds
Revises: 0010_server_check_runs
Create Date: 2026-05-23 20:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0011_metrics_embeds"
down_revision = "0010_server_check_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "server_check_runs" in inspector.get_table_names():
        op.drop_table("server_check_runs")
    if "metrics_embeds" not in inspector.get_table_names():
        op.create_table(
            "metrics_embeds",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("token", sa.String(length=64), nullable=False, unique=True, index=True),
            sa.Column("server_ids", sa.JSON(), nullable=False),
            sa.Column("theme", sa.String(length=16), nullable=False, server_default="dark"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_email", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "metrics_embeds" in inspector.get_table_names():
        op.drop_table("metrics_embeds")
    if "server_check_runs" not in inspector.get_table_names():
        op.create_table(
            "server_check_runs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("server_id", sa.Integer(), sa.ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("check_id", sa.String(length=64), nullable=False, index=True),
            sa.Column("check_title", sa.String(length=120), nullable=False),
            sa.Column("check_group", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="queued", index=True),
            sa.Column("requested_by_email", sa.String(length=255), nullable=False),
            sa.Column("ok", sa.Boolean(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("exit_code", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("report", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True, index=True),
        )
