"""create overlays table

Revision ID: 20260307_000006_overlays
Revises: 20260307_000005_user_prefs
Create Date: 2026-03-07

"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260307_000006_overlays"
down_revision = "20260307_000005_user_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "overlays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("overlay_type", sa.String(length=64), nullable=False),
        sa.Column("geometry", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "properties",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
    )

    op.create_index(
        "ix_overlays_type_active",
        "overlays",
        ["overlay_type", "is_active"],
        unique=False,
    )

    # Seed a minimal exemplar overlay set (Landing Zones) for demo visibility.
    # Using GeoJSON Features (Point geometries).
    seeds = [
        {
            "name": "LZ-1 (Landing Zone 1)",
            "overlay_type": "landing_zone",
            "geometry": {
                "type": "Feature",
                "properties": {"kind": "landing_zone"},
                "geometry": {
                    "type": "Point",
                    "coordinates": [-80.5449, 28.4858],
                },
            },
            "properties": {"site": "Cape Canaveral", "operator": "SpaceX"},
            "source": "manual-seed",
        },
        {
            "name": "LZ-2 (Landing Zone 2)",
            "overlay_type": "landing_zone",
            "geometry": {
                "type": "Feature",
                "properties": {"kind": "landing_zone"},
                "geometry": {
                    "type": "Point",
                    "coordinates": [-80.5443, 28.4854],
                },
            },
            "properties": {"site": "Cape Canaveral", "operator": "SpaceX"},
            "source": "manual-seed",
        },
    ]

    for s in seeds:
        op.execute(
            sa.text(
                """
                INSERT INTO overlays (name, overlay_type, geometry, properties, source, is_active)
                VALUES (:name, :overlay_type, :geometry::jsonb, :properties::jsonb, :source, true)
                """
            ).bindparams(
                name=s["name"],
                overlay_type=s["overlay_type"],
                geometry=json.dumps(s["geometry"]),
                properties=json.dumps(s["properties"]),
                source=s["source"],
            )
        )


def downgrade() -> None:
    op.drop_index("ix_overlays_type_active", table_name="overlays")
    op.drop_table("overlays")
