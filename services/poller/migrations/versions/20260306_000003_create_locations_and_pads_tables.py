"""create locations and pads tables

Revision ID: 20260306_000003
Revises: 20260223_000002
Create Date: 2026-03-06 21:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260306_000003"
down_revision = "20260223_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    tables = set(insp.get_table_names())

    if "locations" not in tables:
        op.create_table(
            "locations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("country_code", sa.String(length=8), nullable=True),
        )

    # refresh list after possible create
    tables = set(insp.get_table_names())

    if "pads" not in tables:
        op.create_table(
            "pads",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("location_id", sa.Integer(), sa.ForeignKey("locations.id"), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
        )

    if "launches" not in tables:
        return

    cols = {c["name"] for c in insp.get_columns("launches")}
    if "pad_id" not in cols:
        # Keep the existing `pad` string column for backward compatibility,
        # but add pad_id for normalized joins + mapping.
        op.add_column("launches", sa.Column("pad_id", sa.Integer(), nullable=True))

    existing_indexes = {i["name"] for i in insp.get_indexes("launches")}
    if "ix_launches_location_id" not in existing_indexes:
        op.create_index("ix_launches_location_id", "launches", ["location_id"])
    if "ix_launches_pad_id" not in existing_indexes:
        op.create_index("ix_launches_pad_id", "launches", ["pad_id"])


def downgrade() -> None:
    op.drop_index("ix_launches_pad_id", table_name="launches")
    op.drop_index("ix_launches_location_id", table_name="launches")
    op.drop_column("launches", "pad_id")
    op.drop_table("pads")
    op.drop_table("locations")
