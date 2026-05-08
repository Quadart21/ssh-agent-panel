from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, get_current_user
from app.models import CommandPattern
from app.schemas import PatternCreate, PatternRead, PatternUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/patterns", tags=["patterns"])


@router.get("", response_model=list[PatternRead])
def list_patterns(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "patterns")
    return db.query(CommandPattern).order_by(CommandPattern.created_at.desc()).all()


@router.post("", response_model=PatternRead, status_code=status.HTTP_201_CREATED)
def create_pattern(
    payload: PatternCreate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "patterns")
    ensure_action_access(current_user, "pattern_create")
    exists = db.query(CommandPattern).filter(CommandPattern.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Шаблон с таким именем уже существует.")

    pattern = CommandPattern(**payload.model_dump())
    db.add(pattern)
    db.commit()
    db.refresh(pattern)
    write_audit_log(db, user=current_user, action="pattern.create", target_type="pattern", target_id=str(pattern.id), details=pattern.name)
    return pattern


@router.put("/{pattern_id}", response_model=PatternRead)
def update_pattern(
    pattern_id: int,
    payload: PatternUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "patterns")
    ensure_action_access(current_user, "pattern_update")
    pattern = db.get(CommandPattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Шаблон не найден.")

    for field, value in payload.model_dump().items():
        setattr(pattern, field, value)

    db.commit()
    db.refresh(pattern)
    write_audit_log(db, user=current_user, action="pattern.update", target_type="pattern", target_id=str(pattern.id), details=pattern.name)
    return pattern


@router.delete("/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pattern(
    pattern_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "patterns")
    ensure_action_access(current_user, "pattern_delete")
    pattern = db.get(CommandPattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Шаблон не найден.")

    db.delete(pattern)
    db.commit()
    write_audit_log(db, user=current_user, action="pattern.delete", target_type="pattern", target_id=str(pattern_id), details=pattern.name)
