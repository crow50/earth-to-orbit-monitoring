"""seed ASDS overlays (SpaceX drone ships)

Revision ID: 20260308_000009_asds_overlays_seed
Revises: 20260307_000008_ovluniq
Create Date: 2026-03-08

"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "20260308_000009_asds_overlays_seed"
down_revision = "20260307_000008_ovluniq"
branch_labels = None
depends_on = None


def _upsert_overlay(name: str, overlay_type: str, lon: float, lat: float, props: dict) -> None:
    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"kind": overlay_type, **props},
    }

    op.execute(
        sa.text(
            """
            INSERT INTO overlays (name, overlay_type, geometry, properties, source, is_active)
            VALUES (:name, :overlay_type, CAST(:geometry AS jsonb), CAST(:properties AS jsonb), :source, true)
            ON CONFLICT (overlay_type, name) DO UPDATE SET
                geometry = EXCLUDED.geometry,
                properties = EXCLUDED.properties,
                updated_at = now(),
                is_active = true
            """
        ).bindparams(
            name=name,
            overlay_type=overlay_type,
            geometry=json.dumps(feature),
            properties=json.dumps(props),
            source="manual-seed",
        )
    )


def upgrade() -> None:
    # NOTE: Launch Library often omits live drone ship coordinates. These points are
    # treated as reasonable default/home locations to enable UX (fit-bounds, marker)
    # when only the ASDS name is known.

    # Atlantic
    _upsert_overlay(
        name="Just Read the Instructions",
        overlay_type="asds",
        lon=-80.0,
        lat=30.0,
        props={"abbrev": "JRTI", "operator": "SpaceX", "ocean": "Atlantic"},
    )
    _upsert_overlay(
        name="Of Course I Still Love You",
        overlay_type="asds",
        lon=-79.5,
        lat=30.0,
        props={"abbrev": "OCISLY", "operator": "SpaceX", "ocean": "Atlantic"},
    )

    # Pacific
    _upsert_overlay(
        name="A Shortfall of Gravitas",
        overlay_type="asds",
        lon=-122.5,
        lat=33.0,
        props={"abbrev": "ASOG", "operator": "SpaceX", "ocean": "Pacific"},
    )


def downgrade() -> None:
    op.execute("DELETE FROM overlays WHERE overlay_type = 'asds' AND name IN ('Just Read the Instructions', 'Of Course I Still Love You', 'A Shortfall of Gravitas')")
