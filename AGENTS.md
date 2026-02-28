# AGENTS.md - Project agents for Earth to Orbit Monitoring Dashboard

This repository is maintained and contributed to by automation agents and humans. Use these guidelines to interact with the project files.

Project overview
- Purpose: Earth→Orbit Monitoring Dashboard — collects telemetry from ground stations and LEO payloads, processes events, and presents a real-time dashboard and historical reports.
- Stack: "v2" architecture — microservices (services/), React frontend (frontend/), Postgres, Prometheus metrics, and Docker Compose-based local development.

Agent interaction rules
- Work on feature branches only. Branch naming convention: feat/<short-desc>-<issue#> or fix/<short-desc>-<issue#>.
- Always git fetch && git pull the target branch before starting work (avoid rebasing/main conflicts).
  - Recommended: git fetch origin && git checkout <branch> && git pull origin <branch>
- Reference the linked GitHub issue number in every commit message and PR (e.g. "feat: add X feature (#123)").
- Do not commit directly to main. Oats (the initializer) may have special permission to commit to main only during project initialization; subagents and regular contributors must never push commits directly to main.
- Keep commits small and focused; prefer single-purpose commits with clear messages.

Local development & useful commands
- Repository root Makefile provides common targets. Key targets:
  - make dev        # build images and start services for local development
  - make build      # build all service images
  - make test       # run unit tests for services
  - make lint       # run linters for codebase
  - make clean      # remove build artifacts
  (Run make help for full list)
- Compose file (local dev): docker-compose.yml at repository root — use `docker compose` (modern plugin) rather than the legacy docker-compose binary.
  - Example: docker compose up --build
- Running a single service locally (example):
  - docker compose up --build services/<service-name>
- Database migrations: check services/<service>/migrations or tools in Makefile; use the provided Make targets to run migrations where possible.

Verification, reports & artifacts
- CI verification artifacts and human-authored verification reports live under docs/ by convention. Create or place verification outputs in docs/verification/ or docs/reports/ with a short README explaining the artifact.
- When a PR includes verification steps, add a verification.md or link to a report in the PR description and tag the relevant issue.

Code hygiene & PRs
- Run linters and unit tests locally before opening a PR (make lint && make test).
- Include changelog or migration notes in PR descriptions when schema or API changes occur.
- For infra or CI changes, open a PR and request review from infra maintainers listed in CONTRIBUTORS.md.

Agent-specific notes
- Subagents and automated scripts must never push to main. They should create (or update) feature branches and open PRs for human review.
- Oats may commit to main only during the controlled initialization process; afterwards all changes must flow through feature branches and PRs.

Where to find things
- Compose file: ./docker-compose.yml
- Makefile: ./Makefile (repo root)
- Services: ./services/
- Frontend: ./frontend/
- Docs & verification artifacts: ./docs/ (create docs/verification/ for new reports)

Contact
- Maintainers: see CONTRIBUTORS.md (if present). For urgent infra CI issues, contact the on-call in README or the repo's issue tracker.

Keep it practical. If something in this document is unclear or missing, update AGENTS.md with specifics so the next agent has fewer questions.
