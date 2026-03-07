from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


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


@dataclass
class UserPreferences:
    id: Optional[int]
    chat_id: str
    active_hours_start: Optional[str] = "00:00"
    active_hours_end: Optional[str] = "23:59"
    location_subscriptions: List[int] = field(default_factory=list)
    is_enabled: bool = True

    @classmethod
    def from_db(cls, row: Dict[str, Any]) -> UserPreferences:
        loc_subs = row.get("location_subscriptions")
        if isinstance(loc_subs, str):
            loc_subs = json.loads(loc_subs)
        elif loc_subs is None:
            loc_subs = []
            
        return cls(
            id=row.get("id"),
            chat_id=row.get("chat_id"),
            active_hours_start=row.get("active_hours_start"),
            active_hours_end=row.get("active_hours_end"),
            location_subscriptions=loc_subs,
            is_enabled=row.get("is_enabled", True)
        )
