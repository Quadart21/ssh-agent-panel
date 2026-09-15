from base64 import urlsafe_b64encode
from hashlib import sha256
import json
from typing import Any

from cryptography.fernet import Fernet
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _derive_encryption_key(secret_key: str) -> str:
    derived_key = urlsafe_b64encode(sha256(secret_key.encode("utf-8")).digest())
    return derived_key.decode("utf-8")


def _is_valid_fernet_key(value: str) -> bool:
    candidate = value.strip()
    if not candidate:
        return False
    try:
        Fernet(candidate.encode("utf-8"))
    except Exception:
        return False
    return True


class Settings(BaseSettings):
    app_name: str = "SSH Control Panel API"
    app_display_name: str = "SSH Control Panel"
    api_v1_prefix: str = "/api/v1"
    frontend_origin: str = "https://ssh.norenvpn.com"
    frontend_origins: list[str] = []
    allowed_hosts: list[str] = ["ssh.norenvpn.com", "localhost", "127.0.0.1"]
    database_url: str = "postgresql+psycopg://ssh_panel:change_me@127.0.0.1:5432/ssh_panel"
    secret_key: str = "change-me-super-secret-key"
    access_token_expire_minutes: int = 720
    encryption_key: str = ""
    admin_email: str = "admin@ssh.norenvpn.com"
    admin_password: str = "replace-with-a-strong-admin-password"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_webhook_secret: str = ""
    cloudflare_api_token: str = ""
    cloudflare_account_id: str = ""
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300
    alert_repeat_minutes: int = 180
    login_max_attempts: int = 5
    login_lock_minutes: int = 15
    session_inactivity_minutes: int = 720
    public_api_base_url: str = ""
    # iEX / CryptoCash spread analytics
    iex_database_url: str = ""
    iex_ssh_host: str = ""
    iex_ssh_port: int = 22
    iex_ssh_user: str = "root"
    iex_ssh_password: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        enable_decoding=False,
    )

    @field_validator("frontend_origins", "allowed_hosts", mode="before")
    @classmethod
    def parse_csv_list(cls, value: Any) -> Any:
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [
                item.strip().strip('"').strip("'")
                for item in stripped.split(",")
                if item.strip().strip('"').strip("'")
            ]
        return value

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.frontend_origin, *self.frontend_origins]
        return list(dict.fromkeys(origin for origin in origins if origin))

    @property
    def agent_api_base_url(self) -> str:
        configured = self.public_api_base_url.strip()
        if configured:
            return configured.rstrip("/")
        origin = self.frontend_origin.strip().rstrip("/")
        return f"{origin}{self.api_v1_prefix}"


settings = Settings()

if not _is_valid_fernet_key(settings.encryption_key):
    settings.encryption_key = _derive_encryption_key(settings.secret_key)
