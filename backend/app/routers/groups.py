from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, get_current_user
from app.models import Server, ServerGroup
from app.schemas import GroupCreate, GroupRead, GroupUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[GroupRead])
def list_groups(
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "groups")
    groups = db.query(ServerGroup).order_by(ServerGroup.name.asc()).all()
    result: list[GroupRead] = []
    for group in groups:
        server_count = db.scalar(select(func.count(Server.id)).where(Server.group_id == group.id)) or 0
        model = GroupRead.model_validate(group, from_attributes=True)
        result.append(model.model_copy(update={"server_count": int(server_count)}))
    return result


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "groups")
    ensure_action_access(current_user, "group_create")
    existing = db.query(ServerGroup).filter(ServerGroup.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Группа с таким именем уже существует.")

    group = ServerGroup(**payload.model_dump())
    db.add(group)
    db.commit()
    db.refresh(group)
    write_audit_log(db, user=current_user, action="group.create", target_type="group", target_id=str(group.id), details=group.name)
    model = GroupRead.model_validate(group, from_attributes=True)
    return model.model_copy(update={"server_count": 0})


@router.put("/{group_id}", response_model=GroupRead)
def update_group(
    group_id: int,
    payload: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "groups")
    ensure_action_access(current_user, "group_update")
    group = db.get(ServerGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена.")

    for field, value in payload.model_dump().items():
        setattr(group, field, value)

    db.commit()
    db.refresh(group)
    write_audit_log(db, user=current_user, action="group.update", target_type="group", target_id=str(group.id), details=group.name)
    server_count = db.scalar(select(func.count(Server.id)).where(Server.group_id == group.id)) or 0
    model = GroupRead.model_validate(group, from_attributes=True)
    return model.model_copy(update={"server_count": int(server_count)})


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: object = Depends(get_current_user),
):
    ensure_section_access(current_user, "groups")
    ensure_action_access(current_user, "group_delete")
    group = db.get(ServerGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена.")

    linked_servers = db.scalar(select(func.count(Server.id)).where(Server.group_id == group.id)) or 0
    if linked_servers:
        raise HTTPException(status_code=409, detail="В группе есть серверы. Сначала перенесите их в другую группу.")

    db.delete(group)
    db.commit()
    write_audit_log(db, user=current_user, action="group.delete", target_type="group", target_id=str(group_id), details=group.name)
