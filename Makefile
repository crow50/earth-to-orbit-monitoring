# Makefile - developer convenience targets for rocket-launch-dashboard

COMPOSE_FILE=docker-compose.yml

.PHONY: dev up down build test migrate import

dev:
	@echo "Starting development stack (foreground)"
	docker-compose -f $(COMPOSE_FILE) up --build

up:
	@echo "Bringing up stack (detached)"
	docker-compose -f $(COMPOSE_FILE) up -d --build

down:
	@echo "Stopping stack"
	docker-compose -f $(COMPOSE_FILE) down

build:
	@echo "Building images"
	docker-compose -f $(COMPOSE_FILE) build

test:
	@echo "No tests yet - run individual service tests"

migrate:
	@echo "Migration helpers will be added here (alembic)"

import:
	@echo "Run ingest worker (one-shot)"
	docker-compose -f $(COMPOSE_FILE) run --rm ingest
