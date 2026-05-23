from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import generate_panel_password, hash_password, validate_password_strength
from app.db import get_db
from app.deps import require_admin
from app.models import User
from app.schemas import (
    PanelUserCreate,
    PanelUserCreatedRead,
    PanelUserPasswordGeneratedRead,
    PanelUserUpdate,
    TmuxActionResponse,
    UserRead,
)
from app.services.audit import write_audit_log
from app.services.auth_state import revoke_all_sessions_for_user_id
from app.services.panel_user_notifications import notify_panel_user_created, summarize_panel_user_access

router = APIRouter(prefix="/panel-users", tags=["panel-users"])


@router.get("", response_model=list[UserRead])
def list_panel_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserRead.model_validate(user, from_attributes=True) for user in users]


@router.get("/generate-password", response_model=PanelUserPasswordGeneratedRead)
def generate_password(_: User = Depends(require_admin)):
    return PanelUserPasswordGeneratedRead(password=generate_panel_password())


@router.post("", response_model=PanelUserCreatedRead, status_code=status.HTTP_201_CREATED)
def create_panel_user(
    payload: PanelUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует.")

    issued_password = (payload.password or "").strip() or generate_panel_password()
    try:
        validate_password_strength(issued_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = User(
        email=payload.email.strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(issued_password),
        role=payload.role,
        is_active=payload.is_active,
        must_change_password=True,
        section_permissions=payload.section_permissions,
        action_permissions=payload.action_permissions,
        allowed_server_ids=payload.allowed_server_ids,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_summary = summarize_panel_user_access(
        role=user.role,
        section_permissions=user.section_permissions or [],
        action_permissions=user.action_permissions or [],
        allowed_server_ids=user.allowed_server_ids or [],
    )
    telegram_sent, telegram_note = notify_panel_user_created(
        db,
        user=user,
        password=issued_password,
        created_by=current_user,
        access_summary=access_summary,
        notify_telegram=payload.notify_telegram,
    )

    write_audit_log(db, user=current_user, action="panel_user.create", target_type="user", target_id=str(user.id), details=user.email)
    return PanelUserCreatedRead(
        **UserRead.model_validate(user, from_attributes=True).model_dump(),
        issued_password=issued_password,
        telegram_sent=telegram_sent,
        telegram_note=telegram_note,
    )


@router.put("/{user_id}", response_model=UserRead)
def update_panel_user(
    user_id: int,
    payload: PanelUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден.")

    if user.id == current_user.id and not payload.is_active:
        raise HTTPException(status_code=400, detail="Нельзя отключить самого себя.")
    if user.id == current_user.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Нельзя снять роль admin у самого себя.")

    user.full_name = payload.full_name.strip()
    user.role = payload.role
    user.is_active = payload.is_active
    user.section_permissions = payload.section_permissions
    user.action_permissions = payload.action_permissions
    user.allowed_server_ids = payload.allowed_server_ids
    if payload.password:
        try:
            validate_password_strength(payload.password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        user.password_hash = hash_password(payload.password)
        user.must_change_password = True

    db.commit()
    db.refresh(user)
    write_audit_log(db, user=current_user, action="panel_user.update", target_type="user", target_id=str(user.id), details=user.email)
    return UserRead.model_validate(user, from_attributes=True)


@router.delete("/{user_id}", response_model=TmuxActionResponse)
def delete_panel_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден.")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить свой аккаунт.")
    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя удалить последнего администратора.")

    email = user.email
    revoke_all_sessions_for_user_id(db, user.id)
    db.delete(user)
    db.commit()
    write_audit_log(
        db,
        user=current_user,
        action="panel_user.delete",
        target_type="user",
        target_id=str(user_id),
        details=email,
    )
    return TmuxActionResponse(ok=True, message=f"Пользователь {email} удалён.")


@router.post("/{user_id}/logout-all", response_model=TmuxActionResponse)
def logout_all_panel_user_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден.")
    revoked_count = revoke_all_sessions_for_user_id(db, user.id)
    write_audit_log(
        db,
        user=current_user,
        action="panel_user.logout_all_sessions",
        target_type="user",
        target_id=str(user.id),
        details=f"{user.email} ({revoked_count})",
    )
    return TmuxActionResponse(ok=True, message=f"Завершено сессий пользователя: {revoked_count}.")
