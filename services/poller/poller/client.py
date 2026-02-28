from __future__ import annotations

from typing import Any, Dict, Iterable, List

import requests

from .config import settings
import time


class LaunchLibraryError(Exception):
    pass


def fetch_launches() -> List[Dict[str, Any]]:
    url = f"{settings.launch_library_base_url}/launches/"
    params = {"limit": 100, "mode": "detailed"}
    launches: List[Dict[str, Any]] = []

    while url:
        attempts = 0
        while True:
            try:
                response = requests.get(url, params=params, timeout=20)
            except requests.Timeout as exc:
                attempts += 1
                if attempts > 5:
                    raise LaunchLibraryError(str(exc)) from exc
                time.sleep(min(2**attempts, 30))
                continue
            except requests.RequestException as exc:
                raise LaunchLibraryError(str(exc)) from exc

            if response.status_code == 429:
                if "ll.thespacedevs.com" in url:
                    url = url.replace("ll.thespacedevs.com", "lldev.thespacedevs.com")
                    attempts = 0
                    continue
                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait_seconds = int(retry_after)
                else:
                    wait_seconds = min(2**attempts, 30)
                attempts += 1
                if attempts > 5:
                    if launches:
                        return launches
                    raise LaunchLibraryError(
                        f"429 Too Many Requests after {attempts} attempts"
                    )
                time.sleep(wait_seconds)
                continue

            try:
                response.raise_for_status()
            except requests.RequestException as exc:
                raise LaunchLibraryError(str(exc)) from exc
            break

        payload = response.json()
        launches.extend(payload.get("results", []))
        url = payload.get("next")
        params = None

    return launches


def filter_cape_canaveral(launches: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    filtered: List[Dict[str, Any]] = []

    for launch in launches:
        pad = launch.get("pad") or {}
        location = pad.get("location") or {}
        location_id = location.get("id")
        location_name = location.get("name") or ""

        if settings.cape_canaveral_location_id:
            if str(location_id) == str(settings.cape_canaveral_location_id):
                filtered.append(launch)
            continue

        if settings.cape_canaveral_location_name.lower() in location_name.lower():
            filtered.append(launch)

    return filtered
