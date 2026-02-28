"""add porch alert flags

Revision ID: 20260223_000002
Revises: 20260221_000001
Create Date: 2026-02-23 16:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260223_000002"
down_revision = "20260221_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "launches",
        sa.Column("notified_24h", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "launches",
        sa.Column("notified_1h", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "launches",
        sa.Column("notified_15m", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("launches", "notified_24h", server_default=None)
    op.alter_column("launches", "notified_1h", server_default=None)
    op.alter_column("launches", "notified_15m", server_default=None)


def downgrade() -> None:
    op.drop_column("launches", "notified_15m")
    op.drop_column("launches", "notified_1h")
    op.drop_column("launches", "notified_24h")
