# Makefile Targets

This document explains the common targets in the root `Makefile` of the `earth-to-orbit-monitoring` repository.

## Usage

From the root of the repository, run:
```bash
make <target>
```

To see all available targets with brief descriptions:
```bash
make help
```

## Local Development & Operations

| Target | Description |
|--------|-------------|
| `make up` | Bring up the entire stack in detached mode (`docker compose up -d`). |
| `make down` | Stop and remove the stack containers. |
| `make ps` | List all running containers in the stack. |
| `make logs` | View the logs from all services (follows output). |
| `make restart` | Restart all services. |
| `make prune` | Runs `docker system prune` to clean up old images/containers. |

## Service Operations

| Target | Description |
|--------|-------------|
| `make frontend-build` | Builds the frontend production assets locally using `npm run build`. |
| `make frontend-dev` | Runs the frontend in development mode using `npm run dev`. |
| `make db-shell` | Opens a `psql` shell inside the running database container. |
| `make db-wait` | Blocks until the database container is ready to accept connections. |

## Testing & Quality

| Target | Description |
|--------|-------------|
| `make test` | Runs the poller service tests (pytest) and builds the frontend. This is the primary local check before pushing code. |
| `make smoke-local` | Performs basic `curl` health checks against the locally running stack. Requires `make up` to be completed first. |

## Database Migrations

| Target | Description |
|--------|-------------|
| `make migrate-local` | Runs Alembic migrations via the `db-migrate` service (rebuilds image to avoid stale migrations). |

## Production Deployment Workflow

The `make deploy-prod` target helps automate the steps required to update a remote deployment.

### Examples

**Dry Run (Default if DRY_RUN=1):**
```bash
make deploy-prod DEPLOY_HOST=e2o-demo DEPLOY_DIR=/opt/earth-to-orbit-monitoring DRY_RUN=1
```
This will print the exact `ssh` command that would be executed on the remote host without actually running it.

**Live Deployment:**
```bash
make deploy-prod DEPLOY_HOST=e2o-demo DEPLOY_DIR=/opt/earth-to-orbit-monitoring
```
This executes the following on the remote host:
1. `git pull --ff-only`
2. `docker compose pull`
3. `docker compose build --pull`
4. `docker compose run --rm --build db-migrate`
5. `docker compose up -d`
6. `docker compose ps`
