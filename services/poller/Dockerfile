FROM python:3.12-slim

WORKDIR /app

# Install runtime deps for migrations (kept simple; can be slimmed later)
COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -U pip \
    && python -m pip install --no-cache-dir -r requirements.txt

# App / migrations
COPY pyproject.toml ./pyproject.toml
COPY alembic.ini ./alembic.ini
COPY poller ./poller
COPY migrations ./migrations

# Helper scripts
COPY scripts ./scripts

# Install the package (so alembic env imports work)
RUN python -m pip install --no-cache-dir -e .

CMD ["bash", "-lc", "python /app/scripts/wait_for_db.py && alembic upgrade head"]
