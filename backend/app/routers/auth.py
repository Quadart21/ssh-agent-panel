from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, hash_password, validate_password_strength, verify_password
from app.db import get_db
from app.deps import get_current_user, normalize_user_access, oauth2_scheme
from app.models import User
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
    TmuxActionResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorRecoveryCodesRead,
    TwoFactorSetupRead,
    TwoFactorStatusRead,
    UserSessionRead,
    UserRead,
)
from app.services.audit import write_audit_log
from app.services.auth_state import (
    clear_login_failures,
    create_user_session,
    ensure_login_allowed,
    list_user_sessions,
    revoke_all_sessions,
    revoke_session,
    revoke_session_by_id,
)
from app.services.notification_settings import get_or_create_notification_settings
from app.services.telegram import send_telegram_message, telegram_is_configured
from app.services.two_factor import (
    disable_two_factor,
    enable_two_factor,
    get_or_create_pending_two_factor,
    get_two_factor_record,
    regenerate_recovery_codes,
    two_factor_setup_payload,
    verify_two_factor_challenge,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    ensure_login_allowed(db, payload.email, ip_address)
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        from app.services.auth_state import register_login_failure

        register_login_failure(db, payload.email, ip_address)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь отключён.")
    user = normalize_user_access(user)

    two_factor = get_two_factor_record(db, user)
    if two_factor and two_factor.is_enabled:
        if not verify_two_factor_challenge(two_factor, payload.otp_code, payload.recovery_code):
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Требуется корректный код 2FA или recovery-код.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        db.commit()

    clear_login_failures(db, payload.email, ip_address)
    session = create_user_session(db, user, ip_address=ip_address, user_agent=user_agent)
    token = create_access_token(user.email, session_id=session.session_token_id)
    write_audit_log(db, user=user, action="auth.login", target_type="user", target_id=str(user.id))
    profile = get_or_create_notification_settings(db)
    if profile.notify_login and telegram_is_configured(db):
        try:
            send_telegram_message(f"{settings.app_display_name}\nВход в панель: {user.email}", db)
        except Exception:
            pass
    return TokenResponse(access_token=token, user=UserRead.model_validate(user, from_attributes=True))


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return UserRead.model_validate(current_user, from_attributes=True)


@router.post("/change-password", response_model=TmuxActionResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Текущий пароль введён неверно.")
    try:
        validate_password_strength(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.commit()
    write_audit_log(db, user=current_user, action="auth.change_password", target_type="user", target_id=str(current_user.id))
    return TmuxActionResponse(ok=True, message="Пароль успешно изменён.")


@router.post("/logout", response_model=TmuxActionResponse)
def logout(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(token)
    session_token_id = payload.get("sid")
    session = next((item for item in list_user_sessions(db, current_user) if item.session_token_id == session_token_id), None)
    if session:
        revoke_session(db, session)
    write_audit_log(db, user=current_user, action="auth.logout", target_type="user", target_id=str(current_user.id))
    return TmuxActionResponse(ok=True, message="Текущая сессия завершена.")


@router.get("/sessions", response_model=list[UserSessionRead])
def get_sessions(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(token)
    current_session_token_id = payload.get("sid")
    sessions = list_user_sessions(db, current_user)
    return [
        UserSessionRead.model_validate(item, from_attributes=True).model_copy(
            update={"is_current": item.session_token_id == current_session_token_id}
        )
        for item in sessions
    ]


@router.post("/sessions/logout-all", response_model=TmuxActionResponse)
def logout_all_sessions(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(token)
    revoked_count = revoke_all_sessions(db, current_user, except_session_token_id=payload.get("sid"))
    write_audit_log(db, user=current_user, action="auth.logout_all", target_type="user", target_id=str(current_user.id), details=str(revoked_count))
    return TmuxActionResponse(ok=True, message=f"Завершено сессий: {revoked_count}.")


@router.delete("/sessions/{session_id}", response_model=TmuxActionResponse)
def logout_single_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    revoke_session_by_id(db, current_user, session_id)
    write_audit_log(db, user=current_user, action="auth.logout_session", target_type="session", target_id=str(session_id))
    return TmuxActionResponse(ok=True, message="Сессия завершена.")


@router.get("/2fa/status", response_model=TwoFactorStatusRead)
def two_factor_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = get_two_factor_record(db, current_user)
    return TwoFactorStatusRead(
        enabled=bool(record and record.is_enabled),
        pending_setup=bool(record and not record.is_enabled),
    )


@router.post("/2fa/setup", response_model=TwoFactorSetupRead)
def two_factor_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        _, recovery_codes, secret = get_or_create_pending_two_factor(db, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = two_factor_setup_payload(secret, current_user.email, recovery_codes)
    return TwoFactorSetupRead(**payload)


@router.post("/2fa/enable", response_model=TwoFactorStatusRead)
def two_factor_enable(
    payload: TwoFactorEnableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        enable_two_factor(db, current_user, payload.otp_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    write_audit_log(db, user=current_user, action="auth.2fa_enable", target_type="user", target_id=str(current_user.id))
    return TwoFactorStatusRead(enabled=True, pending_setup=False)


@router.post("/2fa/disable", response_model=TwoFactorStatusRead)
def two_factor_disable(
    payload: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        disable_two_factor(db, current_user, payload.password, payload.otp_code, payload.recovery_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    write_audit_log(db, user=current_user, action="auth.2fa_disable", target_type="user", target_id=str(current_user.id))
    return TwoFactorStatusRead(enabled=False, pending_setup=False)


@router.post("/2fa/recovery-codes", response_model=TwoFactorRecoveryCodesRead)
def two_factor_recovery_codes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        recovery_codes = regenerate_recovery_codes(db, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    write_audit_log(db, user=current_user, action="auth.2fa_recovery_regenerate", target_type="user", target_id=str(current_user.id))
    return TwoFactorRecoveryCodesRead(recovery_codes=recovery_codes)
