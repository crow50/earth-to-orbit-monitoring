"""add launches vid_urls + webcast_live

Revision ID: 20260308_000010
Revises: 20260308_000009_asds
Create Date: 2026-03-08

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "20260308_000010"
down_revision = "20260308_000009_asds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "launches" not in set(insp.get_table_names()):
        return

    cols = {c["name"] for c in insp.get_columns("launches")}

    # Store Launch Library 'vid_urls' so the UI can present a watch CTA.
    if "vid_urls" not in cols:
        op.add_column("launches", sa.Column("vid_urls", sa.JSON(), nullable=True))

    # Whether the webcast is live (if source provides it).
    if "webcast_live" not in cols:
        op.add_column("launches", sa.Column("webcast_live", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "launches" not in set(insp.get_table_names()):
        return

    cols = {c["name"] for c in insp.get_columns("launches")}
    if "webcast_live" in cols:
        op.drop_column("launches", "webcast_live")
    if "vid_urls" in cols:
        op.drop_column("launches", "vid_urls")
