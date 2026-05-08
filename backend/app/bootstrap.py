from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import User


def ensure_admin_user(db: Session) -> None:
    existing = db.query(User).filter(User.email == settings.admin_email).first()
    if existing:
        if verify_password(settings.admin_password, existing.password_hash) and not existing.must_change_password:
            existing.must_change_password = True
            db.commit()
        return

    admin = User(
        email=settings.admin_email,
        full_name="System Administrator",
        password_hash=hash_password(settings.admin_password),
        role="admin",
        is_active=True,
        must_change_password=True,
    )
    db.add(admin)
    db.commit()
