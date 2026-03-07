"""create recovery_events table

Revision ID: 20260307_000007_recovery_events
Revises: 20260307_000006_overlays
Create Date: 2026-03-07

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260307_000007_recovery_events"
down_revision = "20260307_000006_overlays"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recovery_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("launch_id", sa.String(length=64), nullable=False),
        sa.Column("attempted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("success", sa.Boolean(), nullable=True),
        sa.Column("overlay_id", sa.Integer(), nullable=True),
        sa.Column("method", sa.String(length=64), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=True, server_default=sa.text("'launchlibrary'")),
        sa.Column(
            "raw",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["launch_id"], ["launches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["overlay_id"], ["overlays.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("launch_id", name="uq_recovery_events_launch_id"),
    )

    op.create_index(
        "ix_recovery_events_attempted",
        "recovery_events",
        ["attempted"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_recovery_events_attempted", table_name="recovery_events")
    op.drop_table("recovery_events")
