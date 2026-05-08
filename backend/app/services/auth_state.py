from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import LoginThrottleState, User, UserSession


def _utcnow() -> datetime:
    return datetime.utcnow()


def _normalize_identifier(value: str | None) -> str:
    return (value or "").strip().lower()


def _get_throttle_state(db: Session, scope: str, identifier: str) -> LoginThrottleState | None:
    return db.query(LoginThrottleState).filter(
        LoginThrottleState.scope == scope,
        LoginThrottleState.identifier == identifier,
    ).first()


def ensure_login_allowed(db: Session, email: str, ip_address: str | None) -> None:
    now = _utcnow()
    keys = [("email", _normalize_identifier(email))]
    if ip_address:
        keys.append(("ip", _normalize_identifier(ip_address)))

    for scope, identifier in keys:
        if not identifier:
            continue
        state = _get_throttle_state(db, scope, identifier)
        if state and state.blocked_until and state.blocked_until > now:
            remaining = int((state.blocked_until - now).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Слишком много попыток входа. Повторите через {remaining} мин.",
            )


def register_login_failure(db: Session, email: str, ip_address: str | None) -> None:
    now = _utcnow()
    identifiers = [("email", _normalize_identifier(email))]
    if ip_address:
        identifiers.append(("ip", _normalize_identifier(ip_address)))

    for scope, identifier in identifiers:
        if not identifier:
            continue
        state = _get_throttle_state(db, scope, identifier)
        if state is None:
            state = LoginThrottleState(scope=scope, identifier=identifier, failure_count=0)
            db.add(state)

        if state.last_failed_at and now - state.last_failed_at > timedelta(minutes=settings.login_lock_minutes):
            state.failure_count = 0
            state.blocked_until = None

        state.failure_count += 1
        state.last_failed_at = now
        if state.failure_count >= settings.login_max_attempts:
            state.blocked_until = now + timedelta(minutes=settings.login_lock_minutes)

    db.commit()


def clear_login_failures(db: Session, email: str, ip_address: str | None) -> None:
    identifiers = [("email", _normalize_identifier(email))]
    if ip_address:
        identifiers.append(("ip", _normalize_identifier(ip_address)))
    for scope, identifier in identifiers:
        if not identifier:
            continue
        state = _get_throttle_state(db, scope, identifier)
        if state:
            db.delete(state)
    db.commit()


def create_user_session(db: Session, user: User, ip_address: str | None, user_agent: str | None) -> UserSession:
    now = _utcnow()
    session = UserSession(
        user_id=user.id,
        session_token_id=secrets.token_hex(16),
        ip_address=(ip_address or "").strip() or None,
        user_agent=(user_agent or "").strip()[:255] or None,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=settings.session_inactivity_minutes),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def validate_user_session(db: Session, session_token_id: str | None) -> UserSession:
    if not session_token_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия не найдена.")
    session = db.query(UserSession).filter(UserSession.session_token_id == session_token_id).first()
    now = _utcnow()
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия недействительна.")
    if session.expires_at <= now:
        session.revoked_at = now
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия истекла.")
    session.last_seen_at = now
    session.expires_at = now + timedelta(minutes=settings.session_inactivity_minutes)
    db.commit()
    db.refresh(session)
    return session


def revoke_session(db: Session, session: UserSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = _utcnow()
        db.commit()


def revoke_all_sessions(db: Session, user: User, except_session_token_id: str | None = None) -> int:
    query = db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if except_session_token_id:
        query = query.filter(UserSession.session_token_id != except_session_token_id)
    sessions = query.all()
    now = _utcnow()
    for item in sessions:
        item.revoked_at = now
    db.commit()
    return len(sessions)


def revoke_all_sessions_for_user_id(db: Session, user_id: int) -> int:
    sessions = db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None)).all()
    now = _utcnow()
    for item in sessions:
        item.revoked_at = now
    db.commit()
    return len(sessions)


def revoke_session_by_id(db: Session, user: User, session_id: int) -> None:
    session = db.query(UserSession).filter(UserSession.id == session_id, UserSession.user_id == user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сессия не найдена.")
    revoke_session(db, session)


def list_user_sessions(db: Session, user: User) -> list[UserSession]:
    return (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc())
        .all()
    )
