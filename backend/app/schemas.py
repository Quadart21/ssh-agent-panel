from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


def to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class GroupBase(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(GroupBase):
    pass


class GroupRead(GroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    server_count: int = 0

    model_config = {"from_attributes": True}


class ServerBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    ip: str = Field(min_length=3, max_length=120)
    port: int = Field(default=22, ge=1, le=65535)
    login: str = Field(min_length=1, max_length=120)
    password_enc: str | None = Field(default=None, max_length=255)
    key_path: str | None = Field(default=None, max_length=255)
    group_id: int | None = None
    pay_until: datetime | None = None
    monthly_cost: float | None = Field(default=None, ge=0)
    billing_period: str = Field(default="monthly", max_length=16)
    currency: str = Field(default="RUB", max_length=8)
    provider: str | None = Field(default=None, max_length=120)
    setup_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None

    @field_validator("billing_period", mode="before")
    @classmethod
    def validate_billing_period(cls, value: object) -> str:
        normalized = (str(value).strip().lower() if value not in (None, "") else "monthly")
        if normalized not in {"monthly", "yearly", "quarterly"}:
            raise ValueError("Период оплаты: monthly, yearly или quarterly.")
        return normalized

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str:
        if value in (None, ""):
            return "RUB"
        return str(value).strip().upper()[:8]

    @field_validator("pay_until", mode="before")
    @classmethod
    def normalize_pay_until(cls, value: object) -> datetime | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return to_naive_utc(value)
        text = str(value).strip()
        if not text:
            return None
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return to_naive_utc(parsed)


class ServerCreate(ServerBase):
    test_connection: bool = True
    auto_install_agent: bool = True


class ServerUpdate(ServerBase):
    pass


class ServerQuickUpdate(BaseModel):
    group_id: int | None = None
    monthly_cost: float | None = Field(default=None, ge=0)
    billing_period: str | None = Field(default=None, max_length=16)
    currency: str | None = Field(default=None, max_length=8)

    @field_validator("billing_period")
    @classmethod
    def validate_billing_period(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in {"monthly", "yearly", "quarterly"}:
            raise ValueError("Период оплаты: monthly, yearly или quarterly.")
        return normalized

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()[:8]


class BulkServerCreateRequest(BaseModel):
    items: list[ServerCreate] = Field(default_factory=list, min_length=1)


class BulkServerCreateItemResult(BaseModel):
    name: str
    ip: str
    ok: bool
    server_id: int | None = None
    message: str


class BulkServerCreateResponse(BaseModel):
    total: int
    created: int
    skipped: int = 0
    failed: int
    results: list[BulkServerCreateItemResult]


class ServerRead(ServerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    group_name: str | None = None
    monthly_equivalent: float | None = None
    agent_enabled: bool = False
    agent_version: str | None = None
    agent_last_seen_at: datetime | None = None
    agent_online: bool = False
    auth_method: str = "none"
    has_password: bool = False
    key_fingerprint: str | None = None

    model_config = {"from_attributes": True}


class ServerAccessRead(BaseModel):
    server_id: int
    server_name: str
    ip: str
    port: int
    login: str
    auth_method: str
    password: str | None = None
    private_key: str | None = None
    public_key: str | None = None
    key_fingerprint: str | None = None
    ssh_command: str
    ssh_command_with_key: str | None = None


class ServerConvertToKeyRead(BaseModel):
    ok: bool
    message: str
    auth_method: str
    key_fingerprint: str
    private_key: str
    public_key: str
    ssh_command: str


class PanelSshKeyRead(BaseModel):
    configured: bool
    fingerprint: str | None = None
    public_key: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ServerKeyBindingRead(BaseModel):
    server_id: int
    server_name: str
    ip: str
    port: int
    login: str
    group_name: str | None = None
    binding_status: str
    can_deploy: bool
    panel_key_deployed_at: datetime | None = None
    auth_method: str


class SshKeysOverviewRead(BaseModel):
    panel_key: PanelSshKeyRead | None
    stats: dict[str, int]
    servers: list[ServerKeyBindingRead]


class SshKeyDeployRequest(BaseModel):
    server_ids: list[int] = Field(default_factory=list, min_length=1)
    remove_password: bool = False


class SshKeyDeployItemResult(BaseModel):
    server_id: int
    server_name: str
    ok: bool
    message: str
    binding_status: str | None = None


class SshKeyDeployResponse(BaseModel):
    total: int
    ok: int
    failed: int
    results: list[SshKeyDeployItemResult]


class AgentEnrollRead(BaseModel):
    ok: bool
    message: str
    token: str
    install_script: str
    installed: bool = False
    install_error: str | None = None


class BulkAgentReinstallItemResult(BaseModel):
    server_id: int
    server_name: str
    ok: bool
    installed: bool
    message: str


class BulkAgentReinstallResponse(BaseModel):
    total: int
    installed: int
    failed: int
    skipped: int
    results: list[BulkAgentReinstallItemResult]


class AgentHeartbeatRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    version: str | None = Field(default=None, max_length=32)
    cpu_percent: int = Field(default=0, ge=0, le=100)
    ram_percent: int = Field(default=0, ge=0, le=100)
    disk_percent: int = Field(default=0, ge=0, le=100)
    uptime: str | None = Field(default=None, max_length=64)
    task_id: int | None = Field(default=None, ge=1)
    task_status: str | None = Field(default=None, max_length=16)
    task_stdout: str | None = None
    task_stderr: str | None = None
    task_exit_code: int | None = None


class ServerAccountingItem(BaseModel):
    server_id: int
    server_name: str
    group_name: str
    provider: str | None = None
    monthly_cost: float | None = None
    billing_period: str = "monthly"
    currency: str = "RUB"
    monthly_equivalent: float | None = None
    pay_until: datetime | None = None
    setup_cost: float | None = None


class ServerAccountingGroupTotal(BaseModel):
    group_name: str
    currency: str
    monthly_total: float
    server_count: int


class ServerAccountingSummary(BaseModel):
    primary_currency: str
    total_monthly: float
    total_yearly: float
    total_setup_cost: float
    servers_with_cost: int
    servers_without_cost: int
    totals_by_currency: dict[str, float]
    by_group: list[ServerAccountingGroupTotal]
    items: list[ServerAccountingItem]


class ServerConnectionCheck(BaseModel):
    ip: str
    port: int = Field(default=22, ge=1, le=65535)
    login: str
    password_enc: str | None = None
    key_path: str | None = None
    private_key_pem: str | None = None


class ConnectionTestResult(BaseModel):
    ok: bool
    message: str
    latency_ms: int | None = None


class PatternBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    commands: list[str] = Field(default_factory=list)

    @field_validator("commands")
    @classmethod
    def commands_must_not_be_empty_strings(cls, value: list[str]) -> list[str]:
        cleaned = [command.strip() for command in value if command.strip()]
        if not cleaned:
            raise ValueError("Добавьте хотя бы одну команду.")
        return cleaned


class PatternCreate(PatternBase):
    pass


class PatternUpdate(PatternBase):
    pass


class PatternRead(PatternBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_servers: int
    online_servers: int
    offline_servers: int
    agent_online: int
    expiring_soon: int
    payment_expired: int
    groups_total: int
    patterns_total: int
    avg_cpu: float
    avg_ram: float
    avg_disk: float
    password_auth_count: int
    key_auth_count: int
    monthly_spend: float
    monthly_currency: str


class ServerMetricSnapshot(BaseModel):
    server_id: int
    cpu_percent: int
    ram_percent: int
    disk_percent: int
    uptime: str
    online: bool
    metrics_available: bool = True
    collected_at: datetime | None = None


class BulkCommandRequest(BaseModel):
    server_ids: list[int] = Field(default_factory=list)
    group_id: int | None = None
    pattern_id: int | None = None
    commands: list[str] = Field(default_factory=list)

    @field_validator("commands")
    @classmethod
    def normalize_commands(cls, value: list[str]) -> list[str]:
        return [command.strip() for command in value if command.strip()]


class CommandExecutionResult(BaseModel):
    server_id: int
    server_name: str
    ok: bool
    command: str
    stdout: str
    stderr: str


class BulkCommandResponse(BaseModel):
    results: list[CommandExecutionResult]


class Pm2ProcessRead(BaseModel):
    name: str
    pm_id: int
    status: str
    mode: str
    pid: int | None = None
    instances: int | None = None
    cpu: float = 0.0
    memory: int = 0
    restarts: int = 0
    uptime_ms: int | None = None


class Pm2AppStart(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    script: str = Field(min_length=1, max_length=2000)
    instances: int = Field(default=1, ge=1, le=64)
    cwd: str | None = Field(default=None, max_length=500)
    interpreter: str | None = Field(
        default=None,
        max_length=500,
        description="PM2 --interpreter (например python3 или /path/to/venv/bin/python).",
    )
    script_args: str | None = Field(
        default=None,
        max_length=500,
        description="Аргументы после `--` у pm2 (например `start` для `npm`).",
    )
    run_as_user: str | None = Field(default=None, max_length=64)


class Pm2LogsResponse(BaseModel):
    app_name: str
    content: str
    lines: int = 0
    pages: int = 50
    lines_per_page: int = 50
    truncated: bool = False


class TmuxActionResponse(BaseModel):
    ok: bool
    message: str


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    must_change_password: bool = False
    section_permissions: list[str] = Field(default_factory=list)
    action_permissions: list[str] = Field(default_factory=list)
    allowed_server_ids: list[int] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class AuditLogRead(BaseModel):
    id: int
    user_email: str
    action: str
    target_type: str | None = None
    target_id: str | None = None
    details: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSessionRead(BaseModel):
    id: int
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    is_current: bool = False

    model_config = {"from_attributes": True}


class AlertRead(BaseModel):
    level: str
    category: str
    title: str
    message: str
    server_id: int | None = None
    server_name: str | None = None
    pay_until: datetime | None = None


class LinuxUserRead(BaseModel):
    username: str
    shell: str | None = None


class LinuxUserTargetBase(BaseModel):
    server_ids: list[int] = Field(default_factory=list)
    group_id: int | None = None


class LinuxUserCreateRequest(LinuxUserTargetBase):
    username: str = Field(min_length=1, max_length=32)
    password: str | None = Field(default=None, max_length=255)
    ssh_public_key: str | None = None
    sudo_access: bool = False

    @field_validator("username")
    @classmethod
    def validate_linux_username(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Введите имя пользователя.")
        allowed_letters = "abcdefghijklmnopqrstuvwxyz"
        allowed_other = "0123456789_-"
        for index, char in enumerate(cleaned):
            allowed = char in allowed_letters or char in allowed_other
            if not allowed:
                raise ValueError("Имя пользователя может содержать только строчные латинские буквы, цифры, '-' и '_'.")
            if index == 0 and not (char in allowed_letters or char == "_"):
                raise ValueError("Имя пользователя должно начинаться с буквы или символа '_'.")
        return cleaned

    @field_validator("ssh_public_key")
    @classmethod
    def normalize_public_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class LinuxUserDeleteRequest(LinuxUserTargetBase):
    username: str = Field(min_length=1, max_length=32)
    purge_home: bool = True

    @field_validator("username")
    @classmethod
    def validate_delete_username(cls, value: str) -> str:
        return LinuxUserCreateRequest.validate_linux_username(value)


class LinuxUserOperationResult(BaseModel):
    server_id: int
    server_name: str
    ok: bool
    username: str
    action: str
    message: str
    stderr: str = ""


class LinuxUserOperationResponse(BaseModel):
    results: list[LinuxUserOperationResult]


class FirewallRuleRead(BaseModel):
    index: int | None = None
    rule: str


class FirewallStatusRead(BaseModel):
    enabled: bool
    status_text: str
    rules: list[FirewallRuleRead]
    raw_output: str


class FirewallRuleRequest(BaseModel):
    action: str = Field(min_length=1, max_length=10)
    port: int = Field(ge=1, le=65535)
    protocol: str = Field(default="tcp", min_length=3, max_length=4)
    source: str | None = Field(default=None, max_length=255)

    @field_validator("action")
    @classmethod
    def validate_firewall_action(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"allow", "deny", "delete"}:
            raise ValueError("Доступные действия: allow, deny, delete.")
        return cleaned

    @field_validator("protocol")
    @classmethod
    def validate_protocol(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"tcp", "udp"}:
            raise ValueError("Допустимые протоколы: tcp или udp.")
        return cleaned

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class FirewallToggleRequest(BaseModel):
    enabled: bool


class Fail2BanJailRead(BaseModel):
    name: str
    banned_count: int
    banned_ips: list[str] = Field(default_factory=list)


class SecurityReportRead(BaseModel):
    auth_log_path: str | None = None
    auth_log_excerpt: str
    lastb_excerpt: str
    fail2ban_summary: str
    fail2ban_jails: list[Fail2BanJailRead] = Field(default_factory=list)


class KickUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)

    @field_validator("username")
    @classmethod
    def validate_kick_username(cls, value: str) -> str:
        return LinuxUserCreateRequest.validate_linux_username(value)


class Fail2BanUnbanRequest(BaseModel):
    jail: str = Field(min_length=1, max_length=120)
    ip: str = Field(min_length=3, max_length=120)


class MetricsEmbedCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    server_ids: list[int] = Field(min_length=1)
    theme: str = Field(default="dark", pattern="^(dark|light|midnight|slate|ocean)$")
    accent_color: str | None = Field(default=None, max_length=7)

    @field_validator("accent_color", mode="before")
    @classmethod
    def normalize_accent_color(cls, value: object) -> str | None:
        if value in (None, ""):
            return None
        text = str(value).strip()
        if not text:
            return None
        if not text.startswith("#"):
            text = f"#{text}"
        if len(text) != 7 or any(ch not in "0123456789abcdefABCDEF#" for ch in text[1:]):
            raise ValueError("Цвет акцента укажите в формате #RRGGBB.")
        return f"#{text[1:].lower()}"


class MetricsEmbedUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    server_ids: list[int] | None = Field(default=None, min_length=1)
    theme: str | None = Field(default=None, pattern="^(dark|light|midnight|slate|ocean)$")
    accent_color: str | None = Field(default=None, max_length=7)
    enabled: bool | None = None

    @field_validator("accent_color", mode="before")
    @classmethod
    def normalize_accent_color(cls, value: object) -> str | None:
        return MetricsEmbedCreate.normalize_accent_color(value)


class MetricsEmbedRead(BaseModel):
    id: int
    title: str
    token: str
    server_ids: list[int]
    theme: str
    accent_color: str | None = None
    enabled: bool
    created_by_email: str
    created_at: datetime
    updated_at: datetime
    embed_url: str
    iframe_code: str


class PublicEmbedServerMetricsRead(BaseModel):
    name: str
    cpu_percent: int
    ram_percent: int
    disk_percent: int
    uptime: str
    online: bool
    metrics_available: bool = True


class PublicEmbedMetricsRead(BaseModel):
    title: str
    theme: str
    accent_color: str | None = None
    updated_at: datetime
    servers: list[PublicEmbedServerMetricsRead] = Field(default_factory=list)


class AutomationPresetRead(BaseModel):
    key: str
    name: str
    description: str
    category: str
    commands: list[str]
    default_env: dict[str, str] = Field(default_factory=dict)


class AutomationRunRequest(BaseModel):
    preset_key: str = Field(min_length=1, max_length=120)
    server_ids: list[int] = Field(default_factory=list)
    group_id: int | None = None
    custom_env: dict[str, str] = Field(default_factory=dict)

    @field_validator("custom_env")
    @classmethod
    def normalize_custom_env(cls, value: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for key, raw_value in value.items():
            clean_key = key.strip().upper()
            if not clean_key:
                continue
            normalized[clean_key] = raw_value.strip()
        return normalized


class TelegramStatusRead(BaseModel):
    configured: bool
    chat_id: str | None = None


class TelegramWebhookRead(BaseModel):
    configured: bool
    webhook_url: str | None = None
    webhook_active: bool = False
    telegram_webhook_url: str | None = None


class NotificationSettingsRead(BaseModel):
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    telegram_topic_general: int | None = None
    telegram_topic_login: int | None = None
    telegram_topic_servers: int | None = None
    telegram_topic_payments: int | None = None
    telegram_topic_automation: int | None = None
    configured: bool
    scheduler_enabled: bool
    scheduler_interval_seconds: int
    alert_repeat_minutes: int
    notify_login: bool
    notify_server_offline: bool
    notify_payment_expired: bool
    notify_payment_expiring: bool
    notify_automation_failed: bool


class NotificationSettingsUpdate(BaseModel):
    telegram_bot_token: str | None = Field(default=None, max_length=255)
    telegram_chat_id: str | None = Field(default=None, max_length=255)
    telegram_topic_general: int | None = Field(default=None, ge=1)
    telegram_topic_login: int | None = Field(default=None, ge=1)
    telegram_topic_servers: int | None = Field(default=None, ge=1)
    telegram_topic_payments: int | None = Field(default=None, ge=1)
    telegram_topic_automation: int | None = Field(default=None, ge=1)
    scheduler_enabled: bool
    scheduler_interval_seconds: int = Field(ge=30, le=86400)
    alert_repeat_minutes: int = Field(ge=5, le=10080)
    notify_login: bool
    notify_server_offline: bool
    notify_payment_expired: bool
    notify_payment_expiring: bool
    notify_automation_failed: bool


class LoginRequest(BaseModel):
    email: str
    password: str
    otp_code: str | None = None
    recovery_code: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=10, max_length=255)


class TwoFactorStatusRead(BaseModel):
    enabled: bool
    pending_setup: bool


class TwoFactorSetupRead(BaseModel):
    secret: str
    otpauth_url: str
    qr_svg: str
    recovery_codes: list[str]


class TwoFactorEnableRequest(BaseModel):
    otp_code: str = Field(min_length=6, max_length=6)


class TwoFactorDisableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=255)
    otp_code: str | None = Field(default=None, max_length=6)
    recovery_code: str | None = Field(default=None, max_length=255)


class TwoFactorRecoveryCodesRead(BaseModel):
    recovery_codes: list[str]


class PanelUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=120)
    password: str | None = Field(default=None, max_length=255)
    role: str = Field(default="user", min_length=4, max_length=32)
    is_active: bool = True
    section_permissions: list[str] = Field(default_factory=list)
    action_permissions: list[str] = Field(default_factory=list)
    allowed_server_ids: list[int] = Field(default_factory=list)
    notify_telegram: bool = True

    @field_validator("role")
    @classmethod
    def validate_panel_role(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"admin", "user"}:
            raise ValueError("Роль должна быть admin или user.")
        return cleaned


class PanelUserCreatedRead(UserRead):
    issued_password: str
    telegram_sent: bool
    telegram_note: str | None = None


class PanelUserPasswordGeneratedRead(BaseModel):
    password: str


class PanelUserUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    password: str | None = Field(default=None, max_length=255)
    role: str = Field(default="user", min_length=4, max_length=32)
    is_active: bool = True
    section_permissions: list[str] = Field(default_factory=list)
    action_permissions: list[str] = Field(default_factory=list)
    allowed_server_ids: list[int] = Field(default_factory=list)

    @field_validator("role")
    @classmethod
    def validate_panel_update_role(cls, value: str) -> str:
        return PanelUserCreate.validate_panel_role(value)


class CloudflareSettingsRead(BaseModel):
    api_token: str | None = None
    account_id: str | None = None
    default_ttl: int
    configured: bool


class CloudflareSettingsUpdate(BaseModel):
    api_token: str | None = None
    account_id: str | None = None
    default_ttl: int = Field(default=1, ge=1, le=86400)


class CloudflareStatusRead(BaseModel):
    configured: bool
    message: str | None = None


class CloudflareZoneRead(BaseModel):
    id: str
    name: str
    status: str
    paused: bool
    type: str
    name_servers: list[str] = Field(default_factory=list)


class CloudflareDnsRecordRead(BaseModel):
    id: str
    type: str
    name: str
    content: str
    ttl: int
    proxied: bool | None = None
    comment: str | None = None
    priority: int | None = None
    created_on: str | None = None
    modified_on: str | None = None
    relative_name: str
    is_subdomain: bool


class CloudflareDnsRecordCreate(BaseModel):
    type: str = Field(default="A", min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=4096)
    ttl: int | None = Field(default=None, ge=1, le=86400)
    proxied: bool | None = None
    comment: str | None = Field(default=None, max_length=255)
    priority: int | None = Field(default=None, ge=0, le=65535)


class CloudflareDnsRecordUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=16)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=4096)
    ttl: int | None = Field(default=None, ge=1, le=86400)
    proxied: bool | None = None
    comment: str | None = Field(default=None, max_length=255)
    priority: int | None = Field(default=None, ge=0, le=65535)


ASSET_CATEGORIES = {"domain", "cdn", "license", "server", "other"}
PLAN_STATUSES = {"planned", "paid", "cancelled"}
BILLING_PERIODS = {"monthly", "yearly", "quarterly"}


def _normalize_billing_period(value: object) -> str:
    normalized = (str(value).strip().lower() if value not in (None, "") else "monthly")
    if normalized not in BILLING_PERIODS:
        raise ValueError("Период оплаты: monthly, yearly или quarterly.")
    return normalized


def _normalize_currency(value: object) -> str:
    if value in (None, ""):
        return "RUB"
    return str(value).strip().upper()[:8]


def _normalize_category(value: object, *, allow_empty: bool = False) -> str | None:
    if value in (None, ""):
        return "" if allow_empty else "other"
    normalized = str(value).strip().lower()
    if allow_empty and normalized == "":
        return ""
    if normalized not in ASSET_CATEGORIES:
        raise ValueError("Категория: domain, cdn, license, server или other.")
    return normalized


def _normalize_datetime(value: object) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return to_naive_utc(value)
    text = str(value).strip()
    if not text:
        return None
    return to_naive_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))


class InfraAssetBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(default="other", max_length=32)
    provider: str | None = Field(default=None, max_length=120)
    cost: float | None = Field(default=None, ge=0)
    billing_period: str = Field(default="monthly", max_length=16)
    currency: str = Field(default="RUB", max_length=8)
    pay_until: datetime | None = None
    notes: str | None = None

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, value: object) -> str:
        return _normalize_category(value) or "other"

    @field_validator("billing_period", mode="before")
    @classmethod
    def validate_billing_period(cls, value: object) -> str:
        return _normalize_billing_period(value)

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str:
        return _normalize_currency(value)

    @field_validator("pay_until", mode="before")
    @classmethod
    def validate_pay_until(cls, value: object) -> datetime | None:
        return _normalize_datetime(value)


class InfraAssetCreate(InfraAssetBase):
    pass


class InfraAssetUpdate(InfraAssetBase):
    pass


class InfraAssetRead(InfraAssetBase):
    id: int
    created_at: datetime
    updated_at: datetime
    monthly_equivalent: float | None = None

    model_config = {"from_attributes": True}


class AccountingPaymentBase(BaseModel):
    paid_at: datetime
    amount: float = Field(ge=0)
    currency: str = Field(default="RUB", max_length=8)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="other", max_length=32)
    server_id: int | None = None
    asset_id: int | None = None
    notes: str | None = None

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, value: object) -> str:
        return _normalize_category(value) or "other"

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str:
        return _normalize_currency(value)

    @field_validator("paid_at", mode="before")
    @classmethod
    def validate_paid_at(cls, value: object) -> datetime:
        parsed = _normalize_datetime(value)
        if parsed is None:
            raise ValueError("Укажите дату оплаты.")
        return parsed


class AccountingPaymentCreate(AccountingPaymentBase):
    pass


class AccountingPaymentUpdate(AccountingPaymentBase):
    pass


class AccountingPaymentRead(AccountingPaymentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AccountingPlanBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)
    currency: str = Field(default="RUB", max_length=8)
    due_date: datetime
    category: str = Field(default="other", max_length=32)
    server_id: int | None = None
    asset_id: int | None = None
    status: str = Field(default="planned", max_length=16)
    notes: str | None = None

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, value: object) -> str:
        return _normalize_category(value) or "other"

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str:
        return _normalize_currency(value)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value: object) -> str:
        normalized = (str(value).strip().lower() if value not in (None, "") else "planned")
        if normalized not in PLAN_STATUSES:
            raise ValueError("Статус: planned, paid или cancelled.")
        return normalized

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date(cls, value: object) -> datetime:
        parsed = _normalize_datetime(value)
        if parsed is None:
            raise ValueError("Укажите срок.")
        return parsed


class AccountingPlanCreate(AccountingPlanBase):
    pass


class AccountingPlanUpdate(AccountingPlanBase):
    pass


class AccountingPlanRead(AccountingPlanBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AccountingBudgetBase(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    currency: str = Field(default="RUB", max_length=8)
    planned_amount: float = Field(ge=0)
    category: str | None = Field(default=None, max_length=32)

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str:
        return _normalize_currency(value)

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, value: object) -> str | None:
        if value in (None, ""):
            return None
        return _normalize_category(value)


class AccountingBudgetCreate(AccountingBudgetBase):
    pass


class AccountingBudgetUpdate(BaseModel):
    planned_amount: float = Field(ge=0)
    currency: str | None = Field(default=None, max_length=8)
    category: str | None = Field(default=None, max_length=32)

    @field_validator("currency", mode="before")
    @classmethod
    def validate_currency(cls, value: object) -> str | None:
        if value in (None, ""):
            return None
        return _normalize_currency(value)

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, value: object) -> str | None:
        if value in (None, ""):
            return None
        return _normalize_category(value)


class AccountingBudgetRead(AccountingBudgetBase):
    id: int
    actual_amount: float = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AccountingMarkPaidRequest(BaseModel):
    target_type: str = Field(pattern="^(server|asset)$")
    target_id: int
    amount: float | None = Field(default=None, ge=0)
    paid_at: datetime | None = None
    notes: str | None = None

    @field_validator("paid_at", mode="before")
    @classmethod
    def validate_paid_at(cls, value: object) -> datetime | None:
        return _normalize_datetime(value)


class AccountingMarkPaidResponse(BaseModel):
    payment: AccountingPaymentRead
    pay_until: datetime | None = None


class AccountingCalendarEvent(BaseModel):
    source: str
    source_id: int
    title: str
    category: str
    provider: str | None = None
    amount: float | None = None
    currency: str
    due_date: datetime
    status: str
    billing_period: str | None = None


class AccountingOverview(BaseModel):
    primary_currency: str
    monthly_recurring: float
    yearly_forecast: float
    assets_monthly: float
    servers_monthly: float
    budget_planned: float | None
    budget_actual: float
    budget_remaining: float | None
    upcoming_7d: list[AccountingCalendarEvent]
    upcoming_month: list[AccountingCalendarEvent]
    upcoming_month_total: float
    overdue: list[AccountingCalendarEvent]
    top_expenses: list[dict]


class AccountingReportBreakdown(BaseModel):
    key: str
    label: str
    amount: float
    currency: str
    count: int = 0


class AccountingReport(BaseModel):
    primary_currency: str
    period_from: datetime
    period_to: datetime
    total_paid: float
    payments_count: int
    by_category: list[AccountingReportBreakdown]
    by_provider: list[AccountingReportBreakdown]
    by_month: list[AccountingReportBreakdown]
    by_group: list[AccountingReportBreakdown]
    recurring_monthly: float

