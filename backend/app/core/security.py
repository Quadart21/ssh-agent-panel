import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext
import pyotp

from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def get_fernet() -> Fernet:
    return Fernet(settings.encryption_key.encode("utf-8"))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Пароль должен содержать минимум 10 символов.")
    if password.lower() == password or password.upper() == password:
        raise ValueError("Пароль должен содержать и строчные, и заглавные буквы.")
    if not any(char.isdigit() for char in password):
        raise ValueError("Пароль должен содержать хотя бы одну цифру.")
    if not any(not char.isalnum() for char in password):
        raise ValueError("Пароль должен содержать хотя бы один спецсимвол.")
    return password


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return value


def create_access_token(subject: str, expires_delta: timedelta | None = None, session_id: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "sid": session_id or uuid.uuid4().hex}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Недействительный токен доступа.") from exc


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.app_display_name)


def verify_totp_code(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_recovery_codes(count: int = 8) -> list[str]:
    return [secrets.token_hex(4) for _ in range(count)]
