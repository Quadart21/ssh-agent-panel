from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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
    notes: str | None = None


class ServerCreate(ServerBase):
    test_connection: bool = True


class ServerUpdate(ServerBase):
    pass


class ServerRead(ServerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    group_name: str | None = None

    model_config = {"from_attributes": True}


class ServerConnectionCheck(BaseModel):
    ip: str
    port: int = Field(default=22, ge=1, le=65535)
    login: str
    password_enc: str | None = None
    key_path: str | None = None


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
    expiring_soon: int
    groups_total: int
    patterns_total: int


class ServerMetricSnapshot(BaseModel):
    server_id: int
    cpu_percent: int
    ram_percent: int
    disk_percent: int
    uptime: str
    online: bool


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
    script_args: str | None = Field(
        default=None,
        max_length=500,
        description="Аргументы после `--` у pm2 (например `start` для `npm`).",
    )
    run_as_user: str | None = Field(default=None, max_length=64)


class Pm2LogsResponse(BaseModel):
    app_name: str
    content: str


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


class AutomationPresetRead(BaseModel):
    key: str
    name: str
    description: str
    category: str
    commands: list[str]


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


class NotificationSettingsRead(BaseModel):
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
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
    password: str = Field(min_length=8, max_length=255)
    role: str = Field(default="user", min_length=4, max_length=32)
    is_active: bool = True
    section_permissions: list[str] = Field(default_factory=list)
    action_permissions: list[str] = Field(default_factory=list)
    allowed_server_ids: list[int] = Field(default_factory=list)

    @field_validator("role")
    @classmethod
    def validate_panel_role(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"admin", "user"}:
            raise ValueError("Роль должна быть admin или user.")
        return cleaned


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
