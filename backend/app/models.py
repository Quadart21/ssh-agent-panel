from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ServerGroup(Base, TimestampMixin):
    __tablename__ = "server_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    servers: Mapped[list["Server"]] = relationship(back_populates="group")


class Server(Base, TimestampMixin):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    ip: Mapped[str] = mapped_column(String(120), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=22)
    login: Mapped[str] = mapped_column(String(120), nullable=False)
    password_enc: Mapped[str | None] = mapped_column(String(255), nullable=True)
    key_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pay_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    monthly_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    billing_period: Mapped[str | None] = mapped_column(String(16), nullable=True, default="monthly")
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True, default="RUB")
    provider: Mapped[str | None] = mapped_column(String(120), nullable=True)
    setup_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    agent_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    agent_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    agent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    agent_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    agent_cpu_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_ram_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_disk_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_uptime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("server_groups.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    group: Mapped[ServerGroup | None] = relationship(back_populates="servers")


class CommandPattern(Base, TimestampMixin):
    __tablename__ = "command_patterns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    commands: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="admin", nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(default=False, nullable=False)
    section_permissions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    action_permissions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_server_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)

    two_factor: Mapped["UserTwoFactor | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AlertNotificationState(Base):
    __tablename__ = "alert_notification_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    server_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


class ServerPaymentNotificationState(Base):
    __tablename__ = "server_payment_notification_states"

    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True)
    sent_7d_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_3d_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    overdue_notices_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_overdue_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PaymentNotificationBatch(Base):
    __tablename__ = "payment_notification_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    server_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    telegram_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class NotificationSettings(Base, TimestampMixin):
    __tablename__ = "notification_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    telegram_bot_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_topic_general: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_topic_login: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_topic_servers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_topic_payments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_topic_automation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scheduler_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    scheduler_interval_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    alert_repeat_minutes: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    notify_login: Mapped[bool] = mapped_column(default=True, nullable=False)
    notify_server_offline: Mapped[bool] = mapped_column(default=True, nullable=False)
    notify_payment_expired: Mapped[bool] = mapped_column(default=True, nullable=False)
    notify_payment_expiring: Mapped[bool] = mapped_column(default=True, nullable=False)
    notify_automation_failed: Mapped[bool] = mapped_column(default=True, nullable=False)


class CloudflareSettings(Base, TimestampMixin):
    __tablename__ = "cloudflare_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    api_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_ttl: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class UserTwoFactor(Base, TimestampMixin):
    __tablename__ = "user_two_factor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True, index=True)
    secret_enc: Mapped[str] = mapped_column(String(255), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    recovery_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    user: Mapped[User] = relationship(back_populates="two_factor")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    session_token_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class LoginThrottleState(Base):
    __tablename__ = "login_throttle_states"
    __table_args__ = (UniqueConstraint("scope", "identifier", name="uq_login_throttle_scope_identifier"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    identifier: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False, index=True)
    command: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued", index=True)
    stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stderr: Mapped[str] = mapped_column(Text, nullable=False, default="")
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
