from io import BytesIO

import qrcode
import qrcode.image.svg
from sqlalchemy.orm import Session

from app.core.security import (
    build_totp_uri,
    decrypt_secret,
    encrypt_secret,
    generate_recovery_codes,
    generate_totp_secret,
    hash_password,
    verify_password,
    verify_totp_code,
)
from app.models import User, UserTwoFactor


def get_two_factor_record(db: Session, user: User) -> UserTwoFactor | None:
    return db.query(UserTwoFactor).filter(UserTwoFactor.user_id == user.id).first()


def get_or_create_pending_two_factor(db: Session, user: User) -> tuple[UserTwoFactor, list[str], str]:
    record = get_two_factor_record(db, user)
    if record and record.is_enabled:
        raise ValueError("2FA уже включена.")

    secret = generate_totp_secret()
    recovery_codes = generate_recovery_codes()
    encrypted_secret = encrypt_secret(secret)
    hashed_codes = [hash_password(code) for code in recovery_codes]

    if record is None:
        record = UserTwoFactor(
            user_id=user.id,
            secret_enc=encrypted_secret or "",
            is_enabled=False,
            recovery_codes=hashed_codes,
        )
        db.add(record)
    else:
        record.secret_enc = encrypted_secret or ""
        record.recovery_codes = hashed_codes
        record.is_enabled = False

    db.commit()
    db.refresh(record)
    return record, recovery_codes, secret


def enable_two_factor(db: Session, user: User, otp_code: str) -> None:
    record = get_two_factor_record(db, user)
    if not record:
        raise ValueError("Сначала создайте настройку 2FA.")

    secret = decrypt_secret(record.secret_enc)
    if not secret or not verify_totp_code(secret, otp_code):
        raise ValueError("Неверный код 2FA.")

    record.is_enabled = True
    db.commit()


def disable_two_factor(db: Session, user: User, password: str, otp_code: str | None, recovery_code: str | None) -> None:
    record = get_two_factor_record(db, user)
    if not record or not record.is_enabled:
        raise ValueError("2FA не включена.")
    if not verify_password(password, user.password_hash):
        raise ValueError("Неверный текущий пароль.")
    if not verify_two_factor_challenge(record, otp_code, recovery_code):
        raise ValueError("Неверный код 2FA или recovery-код.")

    db.delete(record)
    db.commit()


def regenerate_recovery_codes(db: Session, user: User) -> list[str]:
    record = get_two_factor_record(db, user)
    if not record or not record.is_enabled:
        raise ValueError("2FA не включена.")

    recovery_codes = generate_recovery_codes()
    record.recovery_codes = [hash_password(code) for code in recovery_codes]
    db.commit()
    return recovery_codes


def verify_two_factor_challenge(record: UserTwoFactor, otp_code: str | None, recovery_code: str | None) -> bool:
    secret = decrypt_secret(record.secret_enc)
    if otp_code and secret and verify_totp_code(secret, otp_code):
        return True

    if recovery_code:
        for index, hashed_code in enumerate(record.recovery_codes):
            if verify_password(recovery_code, hashed_code):
                updated = list(record.recovery_codes)
                updated.pop(index)
                record.recovery_codes = updated
                return True
    return False


def two_factor_setup_payload(secret: str, email: str, recovery_codes: list[str]) -> dict[str, object]:
    otpauth_url = build_totp_uri(secret, email)
    return {
        "secret": secret,
        "otpauth_url": otpauth_url,
        "qr_svg": build_totp_qr_svg(otpauth_url),
        "recovery_codes": recovery_codes,
    }


def build_totp_qr_svg(otpauth_url: str) -> str:
    image = qrcode.make(otpauth_url, image_factory=qrcode.image.svg.SvgImage)
    buffer = BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode("utf-8")
