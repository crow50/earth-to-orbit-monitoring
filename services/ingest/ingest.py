#!/usr/bin/env python3
import os
import time

import psycopg2
import requests
from psycopg2.extras import execute_values

LL_API = os.environ.get("LL_API_URL", "https://lldev.thespacedevs.com/2.3.0/launches/")
LL_API_MODE = os.environ.get("LL_API_MODE", "detailed")
LL_LSP_NAME = os.environ.get("LL_LSP_NAME", "").strip()  # e.g., "SpaceX" to prioritize a provider
LL_LIMIT = int(os.environ.get("LL_LIMIT", "20"))
LL_PAGES_TO_FETCH = int(os.environ.get("LL_PAGES_TO_FETCH", "2"))
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "3600"))


def assert_schema_ready(conn):
    """Fail fast if the DB schema isn't present.

    Migrations are owned by Alembic via the `db-migrate` service; runtime services
    must not create/alter tables opportunistically.
    """
    required = [
        "alembic_version",
        "locations",
        "pads",
        "launches",
    ]
    with conn.cursor() as cur:
        missing = []
        for table in required:
            cur.execute("SELECT to_regclass(%s);", (f"public.{table}",))
            if cur.fetchone()[0] is None:
                missing.append(table)

    if missing:
        raise RuntimeError(
            "Database schema is not ready (missing: "
            + ", ".join(missing)
            + "). Run migrations: docker compose run --rm --build db-migrate"
        )


def fetch_launches(url, *, params=None):
    print(f"Fetching from {url}...")
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _safe_float(val):
    if val is None:
        return None
    try:
        if isinstance(val, str) and not val.strip():
            return None
        return float(val)
    except Exception:
        return None


def upsert_locations_and_pads(conn, launches):
    locations = {}
    pads = {}

    for l in launches:
        pad = l.get("pad") or {}
        loc = pad.get("location") or {}

        loc_id = loc.get("id")
        if loc_id is not None:
            loc_id = int(loc_id)
            loc_name = loc.get("name") or f"Location {loc_id}"
            locations[loc_id] = (
                loc_id,
                loc_name,
                loc.get("country_code"),
            )

        pad_id = pad.get("id")
        if pad_id is not None:
            pad_id = int(pad_id)
            pad_name = pad.get("name") or f"Pad {pad_id}"
            pads[pad_id] = (
                pad_id,
                pad_name,
                loc_id if loc_id is not None else None,
                _safe_float(pad.get("latitude")),
                _safe_float(pad.get("longitude")),
            )

    with conn.cursor() as cur:
        if locations:
            execute_values(
                cur,
                """
                INSERT INTO locations (id, name, country_code)
                VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    country_code = EXCLUDED.country_code
                """,
                list(locations.values()),
            )

        if pads:
            execute_values(
                cur,
                """
                INSERT INTO pads (id, name, location_id, latitude, longitude)
                VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    location_id = EXCLUDED.location_id,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude
                """,
                list(pads.values()),
            )

    conn.commit()


def _find_landing_attempt(launch: dict) -> dict | None:
    """Extract a single best landing attempt from Launch Library payload.

    LL2 often places landing info under `rocket.launcher_stage[*].landing`.
    We prefer the first stage landing attempt when present.
    """
    rocket = launch.get("rocket") or {}
    stages = rocket.get("launcher_stage") or []
    for st in stages:
        landing = st.get("landing")
        if not isinstance(landing, dict):
            continue
        # Some payloads use booleans like attempted_landings / attempt
        attempted = landing.get("attempt")
        if attempted is True:
            return landing
    return None


def _upsert_overlay_from_landing(cur, landing: dict) -> int | None:
    """Upsert an overlay record from a landing object; return overlay_id."""
    ll_loc = landing.get("landing_location") or landing.get("location") or {}
    name = ll_loc.get("name") or landing.get("name")
    if not name:
        return None

    # Determine overlay type.
    ltype = landing.get("type") or {}
    abbrev = (ltype.get("abbrev") or "").upper()
    overlay_type = "asds" if abbrev == "ASDS" else "landing_zone"

    lat = _safe_float(ll_loc.get("latitude"))
    lon = _safe_float(ll_loc.get("longitude"))

    if lat is None or lon is None:
        # If we can't locate it (common for ASDS), keep it unmapped for now.
        return None

    import json

    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "kind": overlay_type,
            "ll_location_id": ll_loc.get("id"),
            "ll_type": abbrev or None,
        },
    }

    cur.execute(
        """
        INSERT INTO overlays (name, overlay_type, geometry, properties, source, is_active)
        VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, true)
        ON CONFLICT (overlay_type, name) DO UPDATE SET
            geometry = EXCLUDED.geometry,
            properties = EXCLUDED.properties,
            updated_at = now(),
            is_active = true
        RETURNING id
        """,
        (
            name,
            overlay_type,
            json.dumps(feature),
            json.dumps({"ll": landing}),
            "launchlibrary",
        ),
    )
    return cur.fetchone()[0]


def upsert_recovery_events(conn, launches):
    with conn.cursor() as cur:
        for l in launches:
            launch_id = l.get("id")
            if not launch_id:
                continue

            landing = _find_landing_attempt(l)
            if not landing:
                continue

            attempted = bool(landing.get("attempt"))
            success = landing.get("success")
            if success is not None:
                success = bool(success)

            overlay_id = _upsert_overlay_from_landing(cur, landing)

            # If ASDS/landing location has no coordinates, fall back to pre-seeded overlays by name.
            if overlay_id is None:
                ll_loc = landing.get("landing_location") or landing.get("location") or {}
                loc_name = ll_loc.get("name")
                ltype = landing.get("type") or {}
                abbrev = (ltype.get("abbrev") or "").upper()
                overlay_type = "asds" if abbrev == "ASDS" else "landing_zone"
                if loc_name:
                    cur.execute(
                        "SELECT id FROM overlays WHERE overlay_type = %s AND name = %s LIMIT 1",
                        (overlay_type, loc_name),
                    )
                    row = cur.fetchone()
                    if row:
                        overlay_id = row[0]

            method = ((landing.get("type") or {}).get("abbrev") or None)

            import json

            cur.execute(
                """
                INSERT INTO recovery_events (launch_id, attempted, success, overlay_id, method, provider, raw)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (launch_id) DO UPDATE SET
                    attempted = EXCLUDED.attempted,
                    success = EXCLUDED.success,
                    overlay_id = EXCLUDED.overlay_id,
                    method = EXCLUDED.method,
                    provider = EXCLUDED.provider,
                    raw = EXCLUDED.raw,
                    updated_at = now()
                """,
                (
                    launch_id,
                    attempted,
                    success,
                    overlay_id,
                    method,
                    "launchlibrary",
                    json.dumps({"landing": landing}),
                ),
            )

    conn.commit()


def upsert_launches(conn, launches):
    with conn.cursor() as cur:
        data = []
        for l in launches:
            pad = l.get("pad") or {}
            loc = pad.get("location") or {}

            data.append(
                (
                    l.get("id"),
                    l.get("name"),
                    l.get("net"),
                    (l.get("status") or {}).get("name"),
                    pad.get("name"),
                    pad.get("id"),
                    (loc.get("id") if loc else None),
                    l.get("last_updated"),
                )
            )

        execute_values(
            cur,
            """
            INSERT INTO launches (id, name, net, status, pad, pad_id, location_id, last_updated)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                net = EXCLUDED.net,
                status = EXCLUDED.status,
                pad = EXCLUDED.pad,
                pad_id = EXCLUDED.pad_id,
                location_id = EXCLUDED.location_id,
                last_updated = EXCLUDED.last_updated;
            """,
            data,
        )
    conn.commit()


def main():
    print(f"Starting ingest service with {POLL_INTERVAL_SECONDS}s interval...")

    # Wait for DB
    conn = None
    for i in range(10):
        try:
            conn = psycopg2.connect(DATABASE_URL)
            break
        except Exception as e:
            print(f"Waiting for DB... {e}")
            time.sleep(2)

    if not conn:
        print("Could not connect to DB")
        return

    # Fail fast if migrations were not applied.
    assert_schema_ready(conn)

    while True:
        print(f"--- Poll cycle started at {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
        try:
            url = LL_API
            pages_to_fetch = LL_PAGES_TO_FETCH

            # First request sets the desired mode; subsequent pages follow `next`.
            params = {"mode": LL_API_MODE} if LL_API_MODE else None
            if params is not None and LL_LIMIT:
                params["limit"] = LL_LIMIT
            if params is not None and LL_LSP_NAME:
                # Launch Library supports provider filtering via `lsp__name`.
                params["lsp__name"] = LL_LSP_NAME

            for _ in range(pages_to_fetch):
                if not url:
                    break
                data = fetch_launches(url, params=params)
                results = data.get("results", [])
                print(f"Upserting {len(results)} launches...")

                # Normalize supporting tables first.
                upsert_locations_and_pads(conn, results)
                upsert_launches(conn, results)
                upsert_recovery_events(conn, results)

                url = data.get("next")
                params = None
                # Small delay to be nice to the API
                time.sleep(1)
            print(f"--- Poll cycle complete. Sleeping for {POLL_INTERVAL_SECONDS}s ---")
        except Exception as e:
            print(f"Error during poll cycle: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)

    conn.close()


if __name__ == "__main__":
    main()
