from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Launch(BaseModel):
    id: str
    mission_name: Optional[str] = None
    rocket_name: Optional[str] = None
    launch_time: Optional[datetime] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

app = FastAPI(title="Earth to Orbit Monitoring Dashboard API", version="0.1.0")

@app.get("/")
def read_root():
    """Redirect root to API documentation."""
    return RedirectResponse(url="/docs")

# Simple in-memory sample data (replace with DB-backed implementation)
SAMPLE_LAUNCHES = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "mission_name": "Demo Launch",
        "rocket_name": "Falcon 1",
        "launch_time": "2006-03-24T22:30:00Z",
        "location_name": "Omelek Island",
        "latitude": 5.0,
        "longitude": -162.0,
    }
]

@app.get("/api/v1/launches", response_model=List[Launch])
def list_launches(start: Optional[str] = Query(None), end: Optional[str] = Query(None), limit: int = 20):
    """List launches (MVP placeholder).

    Query params:
    - start, end: ISO date strings (not yet implemented)
    - limit: max results to return
    """
    # TODO: replace with DB queries and proper filtering
    return SAMPLE_LAUNCHES[:limit]

@app.get("/api/v1/launches/{launch_id}", response_model=Launch)
def get_launch(launch_id: str):
    for l in SAMPLE_LAUNCHES:
        if l["id"] == launch_id:
            return l
    raise HTTPException(status_code=404, detail="launch not found")
