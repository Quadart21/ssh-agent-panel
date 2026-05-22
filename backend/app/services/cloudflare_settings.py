from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models import CloudflareSettings


def get_or_create_cloudflare_settings(db: Session) -> CloudflareSettings:
    profile = db.query(CloudflareSettings).first()
    if profile:
        return profile

    profile = CloudflareSettings(
        api_token=encrypt_secret(settings.cloudflare_api_token or None),
        account_id=settings.cloudflare_account_id or None,
        default_ttl=1,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def cloudflare_api_token(profile: CloudflareSettings | None) -> str:
    token_value = decrypt_secret(profile.api_token) if profile and profile.api_token is not None else settings.cloudflare_api_token
    return (token_value or "").strip()


def visible_cloudflare_token(profile: CloudflareSettings | None) -> str | None:
    if not profile or not profile.api_token:
        return None
    token = decrypt_secret(profile.api_token)
    if not token:
        return None
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}…{token[-4:]}"


def cloudflare_is_configured(db: Session | None = None) -> bool:
    if db is not None:
        profile = get_or_create_cloudflare_settings(db)
        return bool(cloudflare_api_token(profile))
    return bool(settings.cloudflare_api_token)
