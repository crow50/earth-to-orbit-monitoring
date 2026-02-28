Rocket Launch Dashboard — Rebuild plan (skeleton)

Overview
--------
This branch contains a minimal skeleton for Rocket Launch Dashboard v2 (Postgres + FastAPI + React + docker-compose). The goal is to provide a reproducible developer workflow, CI skeleton, and clear migration path from the existing repo.

Directories added
- services/api    -> FastAPI backend (placeholder endpoints)
- services/ingest -> ingest worker (Launch Library dev endpoint placeholder)
- frontend        -> React + Vite frontend (simple list view)
- docker-compose.yml -> local dev composition (db + api + frontend + ingest)
- Makefile        -> helper targets (dev, up, down, build, import)
- .github/workflows/ci.yml -> CI skeleton (test + build/push for main)

Running locally (recommended)
1. From repo root:
   make up
2. API will be available at http://localhost:8000
   Frontend at http://localhost:3000

Next steps
- Implement DB models (SQLAlchemy + Alembic) and replace SAMPLE_LAUNCHES with real queries
- Implement bulk importer (COPY/JSONB) and a staging pipeline for initial historical load
- Add tests and pre-commit hooks (ruff/black/eslint)
- Implement image build & push on CI (GHCR) and full GitOps with Flux/Argo for deployments

Notes about LaunchLibrary API
- Use the dev endpoint (https://lldev.thespacedevs.com/2.3.0) during development to avoid rate limits
- For production ingestion, obtain an API key or implement throttled + cached imports

Branching
- This work is on feature/skeleton-postgres-react. I will not merge to main without explicit "Go".
