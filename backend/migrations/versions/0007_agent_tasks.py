"""agent task queue table

Revision ID: 0007_agent_tasks
Revises: 0006_server_agent_fields
Create Date: 2026-05-22 23:58:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0007_agent_tasks"
down_revision = "0006_server_agent_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "agent_tasks" in inspector.get_table_names():
        return
    op.create_table(
        "agent_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("server_id", sa.Integer(), sa.ForeignKey("servers.id"), nullable=False),
        sa.Column("command", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("stdout", sa.Text(), nullable=False, server_default=""),
        sa.Column("stderr", sa.Text(), nullable=False, server_default=""),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_agent_tasks_id", "agent_tasks", ["id"])
    op.create_index("ix_agent_tasks_server_id", "agent_tasks", ["server_id"])
    op.create_index("ix_agent_tasks_status", "agent_tasks", ["status"])
    op.create_index("ix_agent_tasks_created_at", "agent_tasks", ["created_at"])
    if bind.dialect.name != "sqlite":
        op.alter_column("agent_tasks", "status", server_default=None)
        op.alter_column("agent_tasks", "stdout", server_default=None)
        op.alter_column("agent_tasks", "stderr", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_agent_tasks_created_at", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_status", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_server_id", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_id", table_name="agent_tasks")
    op.drop_table("agent_tasks")
