from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import subprocess
from typing import Iterable, List, Tuple

from .models import Launch
from .schemas import LaunchRecord

ALERT_WINDOW = timedelta(minutes=5)
ALERT_THRESHOLDS: List[Tuple[timedelta, str, str]] = [
    (timedelta(hours=24), "notified_24h", "T-24h"),
    (timedelta(hours=1), "notified_1h", "T-1h"),
    (timedelta(minutes=15), "notified_15m", "T-15m"),
]


def notify_significant_change(launch: LaunchRecord, changes: Iterable[str]) -> None:
    change_list = ", ".join(changes)
    print(
        f"Significant change for {launch.name} ({launch.id}): {change_list}"
    )


def detect_porch_alerts(launch: Launch, record: LaunchRecord) -> List[Tuple[str, str]]:
    if not record.net:
        return []

    now = datetime.now(timezone.utc)
    if record.net <= now:
        return []

    pending: List[Tuple[str, str]] = []
    for delta, field_name, label in ALERT_THRESHOLDS:
        if getattr(launch, field_name, False):
            continue
        alert_time = record.net - delta
        if alert_time <= now <= alert_time + ALERT_WINDOW:
            pending.append((field_name, label))
    return pending


def build_astrobot_prompt(record: LaunchRecord, alert_label: str) -> str:
    payload = {
        "alert": alert_label,
        "launch": {
            "id": record.id,
            "name": record.name,
            "net": record.net.isoformat() if record.net else None,
            "launch_time_utc": record.net.strftime("%Y-%m-%d %H:%M UTC")
            if record.net
            else None,
            "status": record.status,
            "pad": record.pad,
            "location": record.location_name,
            "mission": {
                "name": record.mission_name,
                "type": record.mission_type,
                "description": record.mission_description,
            },
            "program": {
                "description": record.program_description,
            },
            "provider": record.launch_provider,
            "webcast_live": record.webcast_live,
            "vid_urls": record.vid_urls,
        },
        "instructions": {
            "format": "Telegram Markdown",
            "note": (
                "Use launch_time_utc for Launch Time; omit missing fields "
                "without inventing details."
            ),
        },
    }
    return (
        "Generate a Telegram launch notification using the payload below. "
        "Follow SOUL.md. Do not add follow-up questions or meta notes. "
        "Use the message tool to send the final message to target '8526573248' "
        "on channel 'telegram' with accountId 'astrobot'.\n\n"
        f"{json.dumps(payload, indent=2)}"
    )


def run_astrobot_notification(prompt: str) -> Tuple[str, dict]:
    command = [
        "openclaw",
        "agent",
        "--agent",
        "astrobot",
        "--message",
        prompt,
        "--json",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    output = result.stdout.strip() or result.stderr.strip()
    if not output:
        raise RuntimeError("Astrobot returned no output")
    payload = json.loads(output)
    text = ""
    for entry in payload.get("result", {}).get("payloads", []):
        if entry.get("text"):
            text = entry["text"].strip()
            break
    if not text:
        raise RuntimeError("Astrobot did not return a message")
    return text, payload


def process_porch_alerts(launch: Launch, record: LaunchRecord) -> List[dict]:
    alerts = detect_porch_alerts(launch, record)
    results: List[dict] = []
    for field_name, label in alerts:
        prompt = build_astrobot_prompt(record, label)
        message_text, payload = run_astrobot_notification(prompt)
        setattr(launch, field_name, True)
        results.append(
            {
                "alert": label,
                "field": field_name,
                "prompt": prompt,
                "message": message_text,
                "payload": payload,
            }
        )
    return results
