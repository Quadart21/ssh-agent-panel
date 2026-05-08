"""prod hardening tables

Revision ID: 0002_prod_hardening
Revises: 0001_baseline
Create Date: 2026-03-20 00:15:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_prod_hardening"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_token_id", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_user_sessions_id", "user_sessions", ["id"])
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_session_token_id", "user_sessions", ["session_token_id"], unique=True)
    op.create_index("ix_user_sessions_created_at", "user_sessions", ["created_at"])
    op.create_index("ix_user_sessions_last_seen_at", "user_sessions", ["last_seen_at"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_index("ix_user_sessions_revoked_at", "user_sessions", ["revoked_at"])

    op.create_table(
        "login_throttle_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("last_failed_at", sa.DateTime(), nullable=True),
        sa.Column("blocked_until", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("scope", "identifier", name="uq_login_throttle_scope_identifier"),
    )
    op.create_index("ix_login_throttle_states_id", "login_throttle_states", ["id"])
    op.create_index("ix_login_throttle_states_scope", "login_throttle_states", ["scope"])
    op.create_index("ix_login_throttle_states_identifier", "login_throttle_states", ["identifier"])
    op.create_index("ix_login_throttle_states_last_failed_at", "login_throttle_states", ["last_failed_at"])
    op.create_index("ix_login_throttle_states_blocked_until", "login_throttle_states", ["blocked_until"])


def downgrade() -> None:
    op.drop_index("ix_login_throttle_states_blocked_until", table_name="login_throttle_states")
    op.drop_index("ix_login_throttle_states_last_failed_at", table_name="login_throttle_states")
    op.drop_index("ix_login_throttle_states_identifier", table_name="login_throttle_states")
    op.drop_index("ix_login_throttle_states_scope", table_name="login_throttle_states")
    op.drop_index("ix_login_throttle_states_id", table_name="login_throttle_states")
    op.drop_table("login_throttle_states")
    op.drop_index("ix_user_sessions_revoked_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_last_seen_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_created_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_session_token_id", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_index("ix_user_sessions_id", table_name="user_sessions")
    op.drop_table("user_sessions")
