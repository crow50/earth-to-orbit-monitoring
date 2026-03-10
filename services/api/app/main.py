from __future__ import annotations

import os
import time
from datetime import datetime
from typing import List, Optional, Tuple

import psycopg2
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")

# Simple in-process cache (good enough for single-container deployments).
_CACHE_TTL_SECONDS = int(os.environ.get("API_CACHE_TTL_SECONDS", "60"))
_cache: dict[Tuple, tuple[float, list[dict]]] = {}


class Launch(BaseModel):
    id: str

    # Launch fields
    mission_name: Optional[str] = None
    launch_time: Optional[datetime] = None
    status: Optional[str] = None
    last_updated: Optional[datetime] = None
    vid_urls: Optional[list[str]] = None
    webcast_live: Optional[bool] = None

    # Normalized geo fields
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    location_country_code: Optional[str] = None

    pad_id: Optional[int] = None
    pad_name: Optional[str] = None
    pad_latitude: Optional[float] = None
    pad_longitude: Optional[float] = None

    # Recovery (nullable; filled over time)
    recovery_attempted: Optional[bool] = None
    recovery_success: Optional[bool] = None
    recovery_overlay_id: Optional[int] = None
    recovery_method: Optional[str] = None
    recovery_provider: Optional[str] = None

    # Backward-compat
    # (previously overloaded `location_name` with pad string)
    legacy_pad: Optional[str] = None


class LocationMeta(BaseModel):
    id: int
    name: str
    country_code: Optional[str] = None


class PadMeta(BaseModel):
    id: int
    name: str
    location_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class FiltersMeta(BaseModel):
    statuses: list[str]
    locations: list[LocationMeta]
    pads: list[PadMeta]


class UserPreferences(BaseModel):
    chat_id: str
    active_hours_start: str = "00:00"
    active_hours_end: str = "23:59"
    location_subscriptions: List[int] = Field(default_factory=list)
    is_enabled: bool = True


class Overlay(BaseModel):
    id: int
    name: str
    overlay_type: str
    geometry: dict
    properties: dict = Field(default_factory=dict)
    source: Optional[str] = None
    is_active: bool = True


class RecoveryEvent(BaseModel):
    launch_id: str
    attempted: bool = False
    success: Optional[bool] = None
    overlay_id: Optional[int] = None
    method: Optional[str] = None
    provider: Optional[str] = None
    raw: dict = Field(default_factory=dict)


app = FastAPI(
    title="Earth to Orbit Monitoring Dashboard API",
    version="0.3.0",
    # Serve docs under the /api prefix, since the reverse-proxy routes /api/* here.
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def _cache_get(key: Tuple) -> Optional[list[dict]]:
    if _CACHE_TTL_SECONDS <= 0:
        return None
    hit = _cache.get(key)
    if not hit:
        return None
    ts, data = hit
    if (time.time() - ts) > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return data


def _cache_set(key: Tuple, data: list[dict]) -> None:
    if _CACHE_TTL_SECONDS <= 0:
        return

    # Guard against unbounded growth (high-cardinality filter combinations).
    # Simple max-size + oldest-eviction (good enough for a single-process API).
    max_entries = int(os.environ.get("API_CACHE_MAX_ENTRIES", "512"))
    if max_entries > 0 and len(_cache) >= max_entries:
        # Drop oldest entries by timestamp.
        oldest = sorted(_cache.items(), key=lambda kv: kv[1][0])[: max_entries // 8 or 1]
        for k, _ in oldest:
            _cache.pop(k, None)

    _cache[key] = (time.time(), data)


@app.get("/")
def read_root():
    # Useful for direct container access; in production, the site root is owned by the frontend.
    return RedirectResponse(url="/api/docs")


@app.get("/api")
def api_root():
    return RedirectResponse(url="/api/docs")


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    """Basic healthcheck suitable for load balancers and monitors."""
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 as ok")
            _ = cur.fetchone()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        # Keep message minimal; logs can hold details.
        print(f"Healthcheck DB error: {e}")
        raise HTTPException(status_code=503, detail="unhealthy")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@app.get("/api/v1/meta/filters", response_model=FiltersMeta)
def filters_meta():
    """Return distinct values for building unauthenticated filter UI."""
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT status FROM launches WHERE status IS NOT NULL ORDER BY status"
            )
            statuses = [r["status"] for r in cur.fetchall()]

            # If locations/pads tables don't exist yet, these will throw; treat as empty.
            try:
                cur.execute(
                    "SELECT id, name, country_code FROM locations ORDER BY name"
                )
                locations = cur.fetchall()
            except Exception:
                locations = []

            try:
                cur.execute(
                    """
                    SELECT id, name, location_id, latitude, longitude
                    FROM pads
                    ORDER BY name
                    """
                )
                pads = cur.fetchall()
            except Exception:
                pads = []

        conn.close()

        return {
            "statuses": statuses,
            "locations": locations,
            "pads": pads,
        }
    except Exception as e:
        print(f"Error building filters meta: {e}")
        return {
            "statuses": [],
            "locations": [],
            "pads": [],
        }



def _build_launches_query(
    *,
    q: Optional[str],
    status: Optional[list[str]],
    location_id: Optional[list[int]],
    pad_id: Optional[list[int]],
    from_time: Optional[datetime],
    to_time: Optional[datetime],
    upcoming: Optional[bool],
    offset: int,
    limit: int,
    sort: str,
) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []

    if q:
        like = f"%{q}%"
        clauses.append(
            "(l.name ILIKE %s OR p.name ILIKE %s OR loc.name ILIKE %s OR l.pad ILIKE %s)"
        )
        params.extend([like, like, like, like])

    if status:
        clauses.append("l.status = ANY(%s)")
        params.append(status)

    if location_id:
        clauses.append("l.location_id = ANY(%s)")
        params.append(location_id)

    if pad_id:
        clauses.append("l.pad_id = ANY(%s)")
        params.append(pad_id)

    if from_time:
        clauses.append("l.net >= %s")
        params.append(from_time)

    if to_time:
        clauses.append("l.net <= %s")
        params.append(to_time)

    if upcoming is True:
        clauses.append("l.net >= now()")

    where_sql = ""
    if clauses:
        where_sql = "WHERE " + " AND ".join(clauses)

    if sort not in {"net_desc", "net_asc"}:
        sort = "net_desc"

    order_sql = "ORDER BY l.net DESC" if sort == "net_desc" else "ORDER BY l.net ASC"

    sql = f"""
        SELECT
            l.id,
            l.name AS mission_name,
            l.net AS launch_time,
            l.status,
            l.last_updated,
            l.vid_urls,
            l.webcast_live,

            l.location_id,
            loc.name AS location_name,
            loc.country_code AS location_country_code,

            l.pad_id,
            p.name AS pad_name,
            p.latitude AS pad_latitude,
            p.longitude AS pad_longitude,

            r.attempted AS recovery_attempted,
            r.success AS recovery_success,
            r.overlay_id AS recovery_overlay_id,
            r.method AS recovery_method,
            r.provider AS recovery_provider,

            l.pad AS legacy_pad
        FROM launches l
        LEFT JOIN locations loc ON l.location_id = loc.id
        LEFT JOIN pads p ON l.pad_id = p.id
        LEFT JOIN recovery_events r ON r.launch_id = l.id
        {where_sql}
        {order_sql}
        OFFSET %s
        LIMIT %s
    """

    params.extend([offset, limit])
    return sql, params


@app.get("/api/v1/launches", response_model=List[Launch])
def list_launches(
    response: Response,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    sort: str = Query("net_desc"),
    q: Optional[str] = Query(None, description="Free-text search over mission/pad/location"),
    status: Optional[list[str]] = Query(None, description="Repeatable status filter"),
    location_id: Optional[list[int]] = Query(None, description="Repeatable location_id filter"),
    pad_id: Optional[list[int]] = Query(None, description="Repeatable pad_id filter"),
    from_time: Optional[datetime] = Query(None, description="Filter: net >= from_time"),
    to_time: Optional[datetime] = Query(None, description="Filter: net <= to_time"),
    upcoming: Optional[bool] = Query(None, description="If true, only future launches"),
):
    """List launches with server-side filtering + pagination."""

    # Cache only the low-cardinality "default" query shapes.
    # High-cardinality combinations (especially q + multi-select filters) can
    # explode the keyspace and are not worth caching in-process.
    cacheable = (
        not q
        and not status
        and not location_id
        and not pad_id
        and not from_time
        and not to_time
    )

    cache_key = (
        offset,
        limit,
        sort,
        upcoming,
    )

    if cacheable:
        cached = _cache_get(cache_key)
        if cached is not None:
            response.headers["Cache-Control"] = f"public, max-age={_CACHE_TTL_SECONDS}"
            response.headers["X-Cache"] = "HIT"
            return cached

    try:
        sql, params = _build_launches_query(
            q=q,
            status=status,
            location_id=location_id,
            pad_id=pad_id,
            from_time=from_time,
            to_time=to_time,
            upcoming=upcoming,
            offset=offset,
            limit=limit,
            sort=sort,
        )

        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        conn.close()

        if cacheable:
            _cache_set(cache_key, rows)

        response.headers["Cache-Control"] = f"public, max-age={_CACHE_TTL_SECONDS}"
        response.headers["X-Cache"] = "MISS" if cacheable else "BYPASS"
        return rows
    except Exception as e:
        print(f"Error fetching launches: {e}")
        return []


@app.get("/api/v1/launches/{launch_id}", response_model=Launch)
def get_launch(launch_id: str):
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    l.id,
                    l.name AS mission_name,
                    l.net AS launch_time,
                    l.status,
                    l.last_updated,

                    l.location_id,
                    loc.name AS location_name,
                    loc.country_code AS location_country_code,

                    l.pad_id,
                    p.name AS pad_name,
                    p.latitude AS pad_latitude,
                    p.longitude AS pad_longitude,

                    r.attempted AS recovery_attempted,
                    r.success AS recovery_success,
                    r.overlay_id AS recovery_overlay_id,
                    r.method AS recovery_method,
                    r.provider AS recovery_provider,

                    l.pad AS legacy_pad
                FROM launches l
                LEFT JOIN locations loc ON l.location_id = loc.id
                LEFT JOIN pads p ON l.pad_id = p.id
                LEFT JOIN recovery_events r ON r.launch_id = l.id
                WHERE l.id = %s
                """,
                (launch_id,),
            )
            row = cur.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="launch not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching launch {launch_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/v1/overlays", response_model=List[Overlay])
def list_overlays(
    overlay_type: Optional[str] = Query(None, description="Filter by overlay_type (e.g., landing_zone)"),
    is_active: Optional[bool] = Query(True, description="If true, only active overlays"),
):
    """List overlays for map rendering (Horizon 2 scaffold)."""
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            clauses = []
            params = []

            if overlay_type:
                clauses.append("overlay_type = %s")
                params.append(overlay_type)

            if is_active is True:
                clauses.append("is_active = true")

            where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""

            cur.execute(
                f"""
                SELECT id, name, overlay_type, geometry, properties, source, is_active
                FROM overlays
                {where_sql}
                ORDER BY overlay_type, name
                """,
                params,
            )
            rows = cur.fetchall()
        return rows
    except Exception as e:
        # If overlays table isn't present yet in a dev environment, treat as empty.
        print(f"Error fetching overlays: {e}")
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@app.get("/api/v1/preferences/{chat_id}", response_model=UserPreferences)
def get_preferences(chat_id: str):
    """Get preferences for a specific chat ID."""
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT chat_id, active_hours_start, active_hours_end, location_subscriptions, is_enabled FROM user_preferences WHERE chat_id = %s",
                (chat_id,),
            )
            row = cur.fetchone()
        if not row:
            # Return defaults if user not found
            return UserPreferences(chat_id=chat_id)
        return row
    except Exception as e:
        print(f"Error fetching preferences for {chat_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@app.post("/api/v1/preferences", response_model=UserPreferences)
def update_preferences(prefs: UserPreferences):
    """Create or update user preferences."""
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_preferences (chat_id, active_hours_start, active_hours_end, location_subscriptions, is_enabled)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (chat_id) DO UPDATE SET
                    active_hours_start = EXCLUDED.active_hours_start,
                    active_hours_end = EXCLUDED.active_hours_end,
                    location_subscriptions = EXCLUDED.location_subscriptions,
                    is_enabled = EXCLUDED.is_enabled
                RETURNING chat_id, active_hours_start, active_hours_end, location_subscriptions, is_enabled
                """,
                (
                    prefs.chat_id,
                    prefs.active_hours_start,
                    prefs.active_hours_end,
                    psycopg2.extras.Json(prefs.location_subscriptions),
                    prefs.is_enabled,
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        print(f"Error updating preferences for {prefs.chat_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
