from base64 import urlsafe_b64encode
from hashlib import sha256
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300
    alert_repeat_minutes: int = 180
    login_max_attempts: int = 5
    login_lock_minutes: int = 15
    session_inactivity_minutes: int = 720

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("frontend_origins", "allowed_hosts", mode="before")
    @classmethod
    def parse_csv_list(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.frontend_origin, *self.frontend_origins]
        return list(dict.fromkeys(origin for origin in origins if origin))


settings = Settings()

if not settings.encryption_key:
    derived_key = urlsafe_b64encode(sha256(settings.secret_key.encode("utf-8")).digest())
    settings.encryption_key = derived_key.decode("utf-8")
