"""panel ssh key and server binding status

Revision ID: 0014_panel_ssh_keys
Revises: 0013_server_ssh_keys
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_panel_ssh_keys"
down_revision = "0013_server_ssh_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "panel_ssh_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("private_key_enc", sa.Text(), nullable=False),
        sa.Column("public_key", sa.String(length=512), nullable=False),
        sa.Column("fingerprint", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.add_column("servers", sa.Column("panel_key_fingerprint", sa.String(length=128), nullable=True))
    op.add_column("servers", sa.Column("panel_key_deployed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("servers", "panel_key_deployed_at")
    op.drop_column("servers", "panel_key_fingerprint")
    op.drop_table("panel_ssh_keys")
