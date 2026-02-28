# Earth to Orbit Monitoring Dashboard

Real-time updates and notifications for scheduled rocket launches.

## 🗺️ Project Roadmap
See [docs/ROADMAP.md](docs/ROADMAP.md) for the latest project status and feature analysis.

## Services

- **Poller** (`services/poller`): Fetches launch data from Launch Library 2, filters for Cape Canaveral, and stores results in PostgreSQL.

## Poller Setup

### Requirements

- Python 3.11+
- PostgreSQL

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@localhost:5432/launches` | PostgreSQL connection string |
| `LAUNCH_LIBRARY_BASE_URL` | `https://ll.thespacedevs.com/2.2.0` | Launch Library 2 base URL |
| `POLL_INTERVAL_SECONDS` | `300` | Polling interval in seconds |
| `CAPE_CANAVERAL_LOCATION_ID` | _(unset)_ | Optional numeric location ID to filter by |
| `CAPE_CANAVERAL_LOCATION_NAME` | `Cape Canaveral` | Fallback substring match for location name |

### Install

```bash
cd services/poller
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Database Migrations

```bash
cd services/poller
alembic upgrade head
```

### Run the Poller

```bash
cd services/poller
python -m poller.poller
```

### Tests

```bash
cd services/poller
pytest
```

## Launch Library 2 API

The Launch Library 2 API is free to use for basic requests. For higher rate limits or commercial use, see the API documentation: https://thespacedevs.com/llapi
