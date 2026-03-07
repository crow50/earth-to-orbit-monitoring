# Deployment

This project is deployed as a small Docker Compose stack on the `e2o-demo` droplet.

## Prereqs
- Docker Engine + Docker Compose plugin installed on the droplet
- Repo checked out at: `/opt/earth-to-orbit-monitoring`

## Standard deploy (safe)
On the droplet:

```bash
cd /opt/earth-to-orbit-monitoring

git fetch origin --prune
git checkout main
git pull --ff-only origin main

docker compose pull
# ensures local builds pick up base image changes
docker compose build --pull

# Run DB migrations (one-shot)
# Use --build to avoid running a stale migration image after code changes.
docker compose run --rm --build db-migrate

# Bring up the stack
docker compose up -d

docker compose ps
```

## Smoke test
```bash
curl -sS https://earthtoorbit.space/api/health
curl -sS -I https://earthtoorbit.space/api/docs | head
curl -sS 'https://earthtoorbit.space/api/v1/meta/filters' | head -c 500
```

## Notes
- LaunchLibrary (LL2) endpoint defaults to `lldev` to avoid rate limits for now. Override via `LL_API_URL` env when ready.
- If `docker compose run --rm migrate` fails, **do not** rely on ingest's best-effort schema bootstrap for production correctness; fix migrations first.
