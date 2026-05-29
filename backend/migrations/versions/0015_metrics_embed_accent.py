"""metrics embed accent color and expanded themes

Revision ID: 0015_metrics_embed_accent
Revises: 0014_panel_ssh_keys
Create Date: 2026-05-29 22:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0015_metrics_embed_accent"
down_revision = "0014_panel_ssh_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("metrics_embeds")} if "metrics_embeds" in inspector.get_table_names() else set()
    if "accent_color" not in columns:
        op.add_column("metrics_embeds", sa.Column("accent_color", sa.String(length=7), nullable=True))
    op.alter_column("metrics_embeds", "theme", existing_type=sa.String(length=16), type_=sa.String(length=16), existing_nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("metrics_embeds")} if "metrics_embeds" in inspector.get_table_names() else set()
    if "accent_color" in columns:
        op.drop_column("metrics_embeds", "accent_color")
