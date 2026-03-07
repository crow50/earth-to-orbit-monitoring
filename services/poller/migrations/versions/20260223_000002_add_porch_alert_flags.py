"""add porch alert flags

Revision ID: 20260223_000002
Revises: 20260221_000001
Create Date: 2026-02-23 16:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260223_000002"
down_revision = "20260221_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "launches" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("launches")}

    to_add = [
        ("notified_24h", sa.Column("notified_24h", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("notified_1h", sa.Column("notified_1h", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("notified_15m", sa.Column("notified_15m", sa.Boolean(), nullable=False, server_default=sa.false())),
    ]

    for name, col in to_add:
        if name not in cols:
            op.add_column("launches", col)

        # Remove default after backfilling existing rows (or from legacy schemas).
        op.alter_column("launches", name, server_default=None)


def downgrade() -> None:
    op.drop_column("launches", "notified_15m")
    op.drop_column("launches", "notified_1h")
    op.drop_column("launches", "notified_24h")
