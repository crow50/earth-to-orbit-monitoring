#!/usr/bin/env python3
"""Wait for Postgres to be reachable before running migrations.

We use SQLAlchemy + the DATABASE_URL since that's what Alembic uses.
"""

from __future__ import annotations

import os
import sys
import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError


def main() -> int:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 2

    timeout_s = int(os.getenv("DB_WAIT_TIMEOUT_SECONDS", "60"))
    interval_s = float(os.getenv("DB_WAIT_INTERVAL_SECONDS", "2"))

    engine = create_engine(url, pool_pre_ping=True)

    started = time.monotonic()
    while True:
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            print("DB is ready")
            return 0
        except OperationalError as exc:
            elapsed = time.monotonic() - started
            if elapsed > timeout_s:
                print(f"ERROR: DB not ready after {timeout_s}s: {exc}", file=sys.stderr)
                return 1
            print(f"Waiting for DB... ({elapsed:.1f}s)")
            time.sleep(interval_s)


if __name__ == "__main__":
    raise SystemExit(main())
