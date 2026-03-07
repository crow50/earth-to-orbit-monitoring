FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg (binary) are not required, but keep ca-certs for TLS.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY services/db-migrate/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the poller code + alembic config + migrations (poller is schema owner).
COPY services/poller/alembic.ini ./alembic.ini
COPY services/poller/poller ./poller
COPY services/poller/migrations ./migrations

# Default action: upgrade DB to latest revision.
CMD ["alembic", "-c", "alembic.ini", "upgrade", "head"]
