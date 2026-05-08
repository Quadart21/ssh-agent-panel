"""baseline schema

Revision ID: 0001_baseline
Revises: 
Create Date: 2026-03-20 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "server_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_server_groups_id", "server_groups", ["id"])

    op.create_table(
        "servers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("ip", sa.String(length=120), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("login", sa.String(length=120), nullable=False),
        sa.Column("password_enc", sa.String(length=255), nullable=True),
        sa.Column("key_path", sa.String(length=255), nullable=True),
        sa.Column("pay_until", sa.DateTime(), nullable=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("server_groups.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_servers_id", "servers", ["id"])

    op.create_table(
        "command_patterns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("commands", sa.JSON(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_command_patterns_id", "command_patterns", ["id"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("section_permissions", sa.JSON(), nullable=False),
        sa.Column("action_permissions", sa.JSON(), nullable=False),
        sa.Column("allowed_server_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=120), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])
    op.create_index("ix_audit_logs_user_email", "audit_logs", ["user_email"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "alert_notification_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fingerprint", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("server_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_alert_notification_states_id", "alert_notification_states", ["id"])
    op.create_index("ix_alert_notification_states_fingerprint", "alert_notification_states", ["fingerprint"], unique=True)
    op.create_index("ix_alert_notification_states_category", "alert_notification_states", ["category"])
    op.create_index("ix_alert_notification_states_server_id", "alert_notification_states", ["server_id"])
    op.create_index("ix_alert_notification_states_is_active", "alert_notification_states", ["is_active"])
    op.create_index("ix_alert_notification_states_last_seen_at", "alert_notification_states", ["last_seen_at"])
    op.create_index("ix_alert_notification_states_last_sent_at", "alert_notification_states", ["last_sent_at"])

    op.create_table(
        "notification_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_bot_token", sa.String(length=255), nullable=True),
        sa.Column("telegram_chat_id", sa.String(length=255), nullable=True),
        sa.Column("scheduler_enabled", sa.Boolean(), nullable=False),
        sa.Column("scheduler_interval_seconds", sa.Integer(), nullable=False),
        sa.Column("alert_repeat_minutes", sa.Integer(), nullable=False),
        sa.Column("notify_login", sa.Boolean(), nullable=False),
        sa.Column("notify_server_offline", sa.Boolean(), nullable=False),
        sa.Column("notify_payment_expired", sa.Boolean(), nullable=False),
        sa.Column("notify_payment_expiring", sa.Boolean(), nullable=False),
        sa.Column("notify_automation_failed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_notification_settings_id", "notification_settings", ["id"])

    op.create_table(
        "user_two_factor",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("secret_enc", sa.String(length=255), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("recovery_codes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_two_factor_id", "user_two_factor", ["id"])
    op.create_index("ix_user_two_factor_user_id", "user_two_factor", ["user_id"], unique=True)
    op.create_index("ix_user_two_factor_is_enabled", "user_two_factor", ["is_enabled"])


def downgrade() -> None:
    op.drop_index("ix_user_two_factor_is_enabled", table_name="user_two_factor")
    op.drop_index("ix_user_two_factor_user_id", table_name="user_two_factor")
    op.drop_index("ix_user_two_factor_id", table_name="user_two_factor")
    op.drop_table("user_two_factor")
    op.drop_index("ix_notification_settings_id", table_name="notification_settings")
    op.drop_table("notification_settings")
    op.drop_index("ix_alert_notification_states_last_sent_at", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_last_seen_at", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_is_active", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_server_id", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_category", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_fingerprint", table_name="alert_notification_states")
    op.drop_index("ix_alert_notification_states_id", table_name="alert_notification_states")
    op.drop_table("alert_notification_states")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_email", table_name="audit_logs")
    op.drop_index("ix_audit_logs_id", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_command_patterns_id", table_name="command_patterns")
    op.drop_table("command_patterns")
    op.drop_index("ix_servers_id", table_name="servers")
    op.drop_table("servers")
    op.drop_index("ix_server_groups_id", table_name="server_groups")
    op.drop_table("server_groups")
