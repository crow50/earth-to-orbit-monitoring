"""create launches table

Revision ID: 20260221_000001
Revises: 
Create Date: 2026-02-21 23:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260221_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "launches" in insp.get_table_names():
        return

    op.create_table(
        "launches",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("net", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(length=100)),
        sa.Column("pad", sa.String(length=255)),
        sa.Column("location_id", sa.Integer()),
        sa.Column("last_updated", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("launches")
