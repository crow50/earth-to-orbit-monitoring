from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List


@dataclass
class LaunchRecord:
    id: str
    name: str
    net: datetime | None
    status: str | None
    pad: str | None
    location_id: int | None
    last_updated: datetime | None
    location_name: str | None = None
    mission_name: str | None = None
    mission_type: str | None = None
    mission_description: str | None = None
    program_description: str | None = None
    launch_provider: str | None = None
    vid_urls: List[str] = field(default_factory=list)
    webcast_live: bool = False
