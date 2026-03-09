"""add launch details: rocket, mission desc, mission type, pad location fallback

Revision ID: 20260309_000011
Revises: 20260308_000010
Create Date: 2026-03-09

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "20260309_000011"
down_revision = "20260308_000010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "launches" not in set(insp.get_table_names()):
        return

    cols = {c["name"] for c in insp.get_columns("launches")}

    # Capture more mission 'flavor' for the UI tiles
    if "rocket_name" not in cols:
        op.add_column("launches", sa.Column("rocket_name", sa.String(255), nullable=True))

    if "mission_description" not in cols:
        op.add_column("launches", sa.Column("mission_description", sa.Text(), nullable=True))

    if "mission_type" not in cols:
        op.add_column("launches", sa.Column("mission_type", sa.String(100), nullable=True))

    # Fallback location name from LaunchLibrary payload (denormalized)
    if "pad_location_name" not in cols:
        op.add_column("launches", sa.Column("pad_location_name", sa.String(255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "launches" not in set(insp.get_table_names()):
        return

    op.drop_column("launches", "pad_location_name")
    op.drop_column("launches", "mission_type")
    op.drop_column("launches", "mission_description")
    op.drop_column("launches", "rocket_name")
