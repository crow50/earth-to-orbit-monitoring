from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")

class Launch(BaseModel):
    id: str
    mission_name: Optional[str] = None
    rocket_name: Optional[str] = None
    launch_time: Optional[datetime] = None
    location_name: Optional[str] = None
    status: Optional[str] = None

app = FastAPI(title="Earth to Orbit Monitoring Dashboard API", version="0.1.0")

def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

@app.get("/")
def read_root():
    """Redirect root to API documentation."""
    return RedirectResponse(url="/docs")

@app.get("/api/v1/launches", response_model=List[Launch])
def list_launches(limit: int = 20):
    """List launches from DB."""
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    id, 
                    name as mission_name, 
                    net as launch_time, 
                    pad as location_name,
                    status
                FROM launches 
                ORDER BY net DESC 
                LIMIT %s
            """, (limit,))
            rows = cur.fetchall()
        conn.close()
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
            cur.execute("""
                SELECT 
                    id, 
                    name as mission_name, 
                    net as launch_time, 
                    pad as location_name,
                    status
                FROM launches 
                WHERE id = %s
            """, (launch_id,))
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
