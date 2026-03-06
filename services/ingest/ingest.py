#!/usr/bin/env python3
import os
import time

import psycopg2
import requests
from psycopg2.extras import execute_values

LL_API = os.environ.get("LL_API_URL", "https://lldev.thespacedevs.com/2.3.0/launches/")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "3600"))


def init_db(conn):
    """Best-effort bootstrap for environments not running Alembic migrations."""
    with conn.cursor() as cur:
        # Core tables
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS locations (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                country_code TEXT
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS pads (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                location_id INTEGER REFERENCES locations(id),
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS launches (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                net TIMESTAMPTZ,
                status TEXT,
                pad TEXT,
                pad_id INTEGER,
                location_id INTEGER,
                last_updated TIMESTAMPTZ,
                notified_24h BOOLEAN DEFAULT FALSE,
                notified_1h BOOLEAN DEFAULT FALSE,
                notified_15m BOOLEAN DEFAULT FALSE
            );
            """
        )

        # Forward-compatible alters (if older table already exists).
        cur.execute("ALTER TABLE launches ADD COLUMN IF NOT EXISTS pad_id INTEGER")

        # Useful indexes (safe if they already exist).
        cur.execute("CREATE INDEX IF NOT EXISTS ix_launches_location_id ON launches(location_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_launches_pad_id ON launches(pad_id)")

    conn.commit()


def fetch_launches(url):
    print(f"Fetching from {url}...")
    r = requests.get(url, timeout=30)
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

    init_db(conn)

    while True:
        print(f"--- Poll cycle started at {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
        try:
            url = LL_API
            pages_to_fetch = 2
            for _ in range(pages_to_fetch):
                if not url:
                    break
                data = fetch_launches(url)
                results = data.get("results", [])
                print(f"Upserting {len(results)} launches...")

                # Normalize supporting tables first.
                upsert_locations_and_pads(conn, results)
                upsert_launches(conn, results)

                url = data.get("next")
                # Small delay to be nice to the dev API
                time.sleep(1)
            print(f"--- Poll cycle complete. Sleeping for {POLL_INTERVAL_SECONDS}s ---")
        except Exception as e:
            print(f"Error during poll cycle: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)

    conn.close()


if __name__ == "__main__":
    main()
