"""add foreign key for launches.pad_id -> pads.id

Revision ID: 20260306_000004
Revises: 20260306_000003
Create Date: 2026-03-06 22:08:00
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import inspect

revision = "20260306_000004"
down_revision = "20260306_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    tables = set(insp.get_table_names())
    if "launches" not in tables or "pads" not in tables:
        return

    cols = {c["name"] for c in insp.get_columns("launches")}
    if "pad_id" not in cols:
        return

    fk_names = {fk.get("name") for fk in insp.get_foreign_keys("launches")}
    if "fk_launches_pad_id_pads" in fk_names:
        return

    # Enforce referential integrity for normalized joins.
    op.create_foreign_key(
        "fk_launches_pad_id_pads",
        source_table="launches",
        referent_table="pads",
        local_cols=["pad_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_launches_pad_id_pads", "launches", type_="foreignkey")
