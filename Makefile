# Makefile - developer convenience targets for earth-to-orbit-monitoring

# Docker Compose command detection
COMPOSE_CMD := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

# Use absolute path so Make targets work when invoked from other directories
COMPOSE_FILE=$(CURDIR)/docker-compose.yml

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Compose convenience
.PHONY: compose-build compose-pull up down restart ps logs prune
compose-build: ## Build or rebuild services
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) build

compose-pull: ## Pull service images
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) pull

up: ## Bring up the stack (detached)
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) up -d

down: ## Stop and remove containers, networks
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) down

restart: ## Restart all services
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) restart

ps: ## List containers
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) ps

logs: ## View output from containers
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) logs -f

prune: ## Remove unused docker data
	docker system prune -f

# Service-specific
.PHONY: frontend-build frontend-dev api-shell db-shell db-wait
frontend-build: ## Build the frontend production assets
	@echo "Building frontend..."
	cd frontend && npm install && npm run build

frontend-dev: ## Run frontend in development mode
	cd frontend && npm install && npm run dev

api-shell: ## Open a shell in the api container
	$(COMPOSE_CMD) exec api /bin/bash

db-shell: ## Open a psql shell in the database container
	$(COMPOSE_CMD) exec db psql -U rl -d rocket_launch

db-wait: ## Wait for database to be ready
	@echo "Waiting for database..."
	@until $(COMPOSE_CMD) exec -T db pg_isready -U rl >/dev/null 2>&1; do \
		sleep 1; \
	done

# Testing/quality
.PHONY: test smoke-local
test: ## Run all tests (poller + frontend build)
	@echo "Running all tests..."
	@if [ -d services/poller ]; then \
		make -C services/poller test; \
	else \
		echo "ERROR: services/poller not found"; \
		exit 1; \
	fi
	@$(MAKE) frontend-build

smoke-local: ## Run local smoke tests against running services
	@echo "Running smoke tests..."
	@curl -sSf http://localhost:3000/ > /dev/null || (echo "Frontend check failed" && exit 1)
	@curl -sSf http://localhost:8000/api/health > /dev/null || (echo "API health check failed" && exit 1)
	@curl -sSf http://localhost:8000/api/v1/meta/filters > /dev/null || (echo "API filters check failed" && exit 1)
	@echo "Smoke tests passed!"

# Migrations
.PHONY: migrate-local
migrate-local: ## Run database migrations locally via db-migrate service
	@echo "Running database migrations..."
	$(COMPOSE_CMD) run --rm --build db-migrate

# UI evidence (screenshots)
.PHONY: shot
shot: ## Capture a screenshot and write it into docs/screenshots/ (requires OpenClaw browser)
	@if [ -z "$(URL)" ] || [ -z "$(OUT)" ]; then \
		echo "Usage: make shot URL=https://earthtoorbit.space/ OUT=docs/screenshots/pr-123/before-home.png [PROFILE=openclaw] [FULL_PAGE=1]"; \
		exit 1; \
	fi
	@PROFILE=$${PROFILE:-openclaw}; \
	FULL=$${FULL_PAGE:-1}; \
	if [ "$$FULL" = "1" ]; then FULL_FLAG="--full-page"; else FULL_FLAG=""; fi; \
	scripts/e2o_screenshot.sh --url "$(URL)" --out "$(OUT)" --profile "$$PROFILE" $$FULL_FLAG

# Production workflow helpers
.PHONY: deploy-prod
deploy-prod: ## Production deployment workflow (Dry run by default)
	@if [ -z "$(DEPLOY_HOST)" ] || [ -z "$(DEPLOY_DIR)" ]; then \
		echo "Usage: make deploy-prod DEPLOY_HOST=user@host DEPLOY_DIR=/path/to/app [DRY_RUN=1]"; \
		exit 1; \
	fi
	@echo "Target Host: $(DEPLOY_HOST)"
	@echo "Target Directory: $(DEPLOY_DIR)"
	@if [ "$(DRY_RUN)" = "1" ]; then \
		echo "--- DRY RUN ---"; \
		echo "ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR) && git pull --ff-only && (docker compose version >/dev/null 2>&1 && CC=\"docker compose\" || CC=\"docker-compose\") && $CC pull && $CC build --pull && $CC run --rm --build db-migrate && $CC up -d && $CC ps'"; \
	else \
		echo "Executing deployment..."; \
		ssh $(DEPLOY_HOST) "cd $(DEPLOY_DIR) && git pull --ff-only && if docker compose version >/dev/null 2>&1; then CC='docker compose'; else CC='docker-compose'; fi && $$CC pull && $$CC build --pull && $$CC run --rm --build db-migrate && $$CC up -d && $$CC ps"; \
	fi
