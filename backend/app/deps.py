from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db
from app.models import Server, User
from app.services.auth_state import validate_user_session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def normalize_user_access(user: User) -> User:
    if user.section_permissions is None:
        user.section_permissions = []
    if user.action_permissions is None:
        user.action_permissions = []
    if user.allowed_server_ids is None:
        user.allowed_server_ids = []
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    email = payload.get("sub")
    session_token_id = payload.get("sid")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен не содержит пользователя.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден или отключён.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    validate_user_session(db, session_token_id)
    return normalize_user_access(user)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав.")
    return current_user


def has_section_access(user: User, section: str) -> bool:
    if user.role == "admin":
        return True
    permissions = user.section_permissions or []
    if section in permissions:
        return True
    if section == "pm2" and "tmux" in permissions:
        return True
    return False


def has_action_access(user: User, action: str) -> bool:
    if user.role == "admin":
        return True
    permissions = user.action_permissions or []
    if action in permissions:
        return True
    if action == "pm2_use" and "tmux_use" in permissions:
        return True
    return False


def get_allowed_server_ids(user: User) -> list[int]:
    if user.role == "admin":
        return []
    return list(user.allowed_server_ids or [])


def ensure_section_access(user: User, section: str) -> None:
    if not has_section_access(user, section):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому разделу.")


def ensure_action_access(user: User, action: str) -> None:
    if not has_action_access(user, action):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этой функции.")


def ensure_server_access(user: User, server: Server) -> None:
    if user.role == "admin":
        return
    allowed_ids = set(user.allowed_server_ids or [])
    if server.id not in allowed_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому серверу.")
