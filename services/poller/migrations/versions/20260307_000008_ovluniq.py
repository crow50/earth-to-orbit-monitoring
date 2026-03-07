"""add unique constraint on overlays (overlay_type, name)

Revision ID: 20260307_000008_ovluniq
Revises: 20260307_000007_recovery_events
Create Date: 2026-03-07

"""

from __future__ import annotations

from alembic import op

revision = "20260307_000008_ovluniq"
down_revision = "20260307_000007_recovery_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_overlays_type_name",
        "overlays",
        ["overlay_type", "name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_overlays_type_name", "overlays", type_="unique")
