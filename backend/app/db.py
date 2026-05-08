from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_kwargs = {"pool_pre_ping": True}

engine = create_engine(settings.database_url, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


BASELINE_REVISION = "0001_baseline"
APP_TABLES = {
    "server_groups",
    "servers",
    "command_patterns",
    "users",
    "audit_logs",
    "alert_notification_states",
    "notification_settings",
    "user_two_factor",
}


def _get_alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def run_startup_migrations() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    alembic_config = _get_alembic_config()

    if "alembic_version" not in table_names and table_names.intersection(APP_TABLES):
        command.stamp(alembic_config, BASELINE_REVISION)

    command.upgrade(alembic_config, "head")
