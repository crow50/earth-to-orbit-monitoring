from __future__ import annotations

import os


class Settings:
    def __init__(self) -> None:
        self.launch_library_base_url = os.getenv(
            "LAUNCH_LIBRARY_BASE_URL", "https://ll.thespacedevs.com/2.2.0"
        )
        self.poll_interval_seconds = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            pg_user = os.getenv("POSTGRES_USER")
            pg_password = os.getenv("POSTGRES_PASSWORD")
            pg_db = os.getenv("POSTGRES_DB")
            pg_host = os.getenv("POSTGRES_HOST", "localhost")
            pg_port = os.getenv("POSTGRES_PORT", "5432")
            if pg_user and pg_password and pg_db:
                database_url = (
                    f"postgresql+psycopg://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}"
                )
        self.database_url = database_url or "postgresql+psycopg://postgres:postgres@localhost:5432/launches"
        self.cape_canaveral_location_id = os.getenv("CAPE_CANAVERAL_LOCATION_ID")
        self.cape_canaveral_location_name = os.getenv(
            "CAPE_CANAVERAL_LOCATION_NAME", "Cape Canaveral"
        )


settings = Settings()
