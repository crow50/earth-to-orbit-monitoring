from __future__ import annotations

import time
from datetime import datetime
from typing import Iterable, List

from dateutil import parser

from .client import fetch_launches, filter_cape_canaveral
from .config import settings
from .db import session_scope
from .models import Launch
from .notifications import notify_significant_change, process_porch_alerts
from .schemas import LaunchRecord


def parse_launches(raw_launches: Iterable[dict]) -> List[LaunchRecord]:
    records: List[LaunchRecord] = []
    for launch in raw_launches:
        pad = launch.get("pad") or {}
        location = pad.get("location") or {}
        status = launch.get("status") or {}
        mission = launch.get("mission") or {}
        program_entries = launch.get("program") or []
        program_description = None
        if program_entries:
            program_description = program_entries[0].get("description")
        launch_provider = (launch.get("launch_service_provider") or {}).get("name")

        net = _parse_dt(launch.get("net"))
        last_updated = _parse_dt(launch.get("last_updated"))

        records.append(
            LaunchRecord(
                id=str(launch.get("id")),
                name=launch.get("name") or "",
                net=net,
                status=status.get("name"),
                pad=pad.get("name"),
                location_id=location.get("id"),
                last_updated=last_updated,
                location_name=location.get("name"),
                mission_name=mission.get("name"),
                mission_type=mission.get("type"),
                mission_description=mission.get("description"),
                program_description=program_description,
                launch_provider=launch_provider,
                vid_urls=[url for url in (launch.get("vid_urls") or []) if url],
                webcast_live=bool(launch.get("webcast_live")),
            )
        )
    return records


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return parser.isoparse(value)


def detect_significant_changes(existing: Launch, incoming: LaunchRecord) -> List[str]:
    changes: List[str] = []
    if existing.net != incoming.net:
        changes.append("net")
    if existing.status != incoming.status:
        changes.append("status")
    return changes


def upsert_launches(records: Iterable[LaunchRecord]) -> None:
    with session_scope() as session:
        for record in records:
            existing = session.get(Launch, record.id)
            if existing:
                changes = detect_significant_changes(existing, record)
                if changes:
                    notify_significant_change(record, changes)
                existing.name = record.name
                existing.net = record.net
                existing.status = record.status
                existing.pad = record.pad
                existing.location_id = record.location_id
                existing.last_updated = record.last_updated
                process_porch_alerts(existing, record)
            else:
                launch = Launch(
                    id=record.id,
                    name=record.name,
                    net=record.net,
                    status=record.status,
                    pad=record.pad,
                    location_id=record.location_id,
                    last_updated=record.last_updated,
                )
                session.add(launch)
                process_porch_alerts(launch, record)


def poll_once() -> None:
    raw_launches = fetch_launches()
    filtered = filter_cape_canaveral(raw_launches)
    records = parse_launches(filtered)
    upsert_launches(records)


def run_polling_loop() -> None:
    while True:
        try:
            poll_once()
        except Exception as exc:
            print(f"Polling error: {exc}")
        time.sleep(settings.poll_interval_seconds)


if __name__ == "__main__":
    run_polling_loop()
