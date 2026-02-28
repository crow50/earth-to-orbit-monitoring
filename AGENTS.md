# AGENTS.md - Project agents for Earth to Orbit Monitoring Dashboard

This repository is maintained and contributed to by automation agents and humans. Use these guidelines to interact with the project files.

Responsibilities:
- Readme and docs are authoritative for running and contributing.
- CI and infra changes should be coordinated through PRs.

Developer helper steps:
1. Always run `git pull origin main` before making changes.
2. Use the Makefile targets for local development (Makefile updated to use `docker compose`).
3. If container builds hang, check service Dockerfiles for large native builds and missing build dependencies.

Contact: maintainers listed in CONTRIBUTORS.md (if present).
