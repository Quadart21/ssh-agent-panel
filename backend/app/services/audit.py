from sqlalchemy.orm import Session

from app.models import AuditLog, User


def write_audit_log(
    db: Session,
    *,
    user: User | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: str | None = None,
) -> None:
    actor = user.email if user else "system"
    db.add(
        AuditLog(
            user_email=actor,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
        )
    )
    db.commit()
