from __future__ import annotations

import os
import time
from datetime import datetime
from typing import List, Optional, Tuple

import psycopg2
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")

# Simple in-process cache (good enough for single-container deployments).
_CACHE_TTL_SECONDS = int(os.environ.get("API_CACHE_TTL_SECONDS", "60"))
_cache: dict[Tuple[int, int], tuple[float, list[dict]]] = {}


class Launch(BaseModel):
    id: str
    mission_name: Optional[str] = None
    rocket_name: Optional[str] = None
    launch_time: Optional[datetime] = None
    location_name: Optional[str] = None
    status: Optional[str] = None


app = FastAPI(
    title="Earth to Orbit Monitoring Dashboard API",
    version="0.2.0",
    # Serve docs under the /api prefix, since the reverse-proxy routes /api/* here.
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def _cache_get(key: Tuple[int, int]) -> Optional[list[dict]]:
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


def _cache_set(key: Tuple[int, int], data: list[dict]) -> None:
    if _CACHE_TTL_SECONDS <= 0:
        return
    _cache[key] = (time.time(), data)


@app.get("/")
def read_root():
    # Useful for direct container access; in production, the site root is owned by the frontend.
    return RedirectResponse(url="/api/docs")


@app.get("/api")
def api_root():
    return RedirectResponse(url="/api/docs")


@app.get("/api/health")
def health():
    """Basic healthcheck suitable for load balancers and monitors."""
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 as ok")
            _ = cur.fetchone()
        conn.close()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        # Keep message minimal; logs can hold details.
        print(f"Healthcheck DB error: {e}")
        raise HTTPException(status_code=503, detail="unhealthy")


@app.get("/api/v1/launches", response_model=List[Launch])
def list_launches(
    response: Response,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
):
    """List launches from DB (newest first). Supports offset/limit."""
    cache_key = (offset, limit)

    cached = _cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = f"public, max-age={_CACHE_TTL_SECONDS}"
        response.headers["X-Cache"] = "HIT"
        return cached

    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    name as mission_name,
                    net as launch_time,
                    pad as location_name,
                    status
                FROM launches
                ORDER BY net DESC
                OFFSET %s
                LIMIT %s
                """,
                (offset, limit),
            )
            rows = cur.fetchall()
        conn.close()

        _cache_set(cache_key, rows)

        response.headers["Cache-Control"] = f"public, max-age={_CACHE_TTL_SECONDS}"
        response.headers["X-Cache"] = "MISS"
        return rows
    except Exception as e:
        print(f"Error fetching launches: {e}")
        # Return empty list if DB not ready or error
        return []


@app.get("/api/v1/launches/{launch_id}", response_model=Launch)
def get_launch(launch_id: str):
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    name as mission_name,
                    net as launch_time,
                    pad as location_name,
                    status
                FROM launches
                WHERE id = %s
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
