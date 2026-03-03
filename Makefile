# Makefile - developer convenience targets for earth-to-orbit-monitoring

# Use absolute path so Make targets work when invoked from other directories
COMPOSE_FILE=$(CURDIR)/docker-compose.yml

.PHONY: dev up down build test migrate import

dev:
	@echo "Starting development stack (foreground)"
	docker compose -f $(COMPOSE_FILE) up --build

up:
	@echo "Bringing up stack (detached)"
	docker compose -f $(COMPOSE_FILE) up -d --build

down:
	@echo "Stopping stack"
	docker compose -f $(COMPOSE_FILE) down

build:
	@echo "Building images"
	docker compose -f $(COMPOSE_FILE) build

test:
	@echo "Running tests for all services..."
	@if [ -d services/poller ]; then \
		make -C services/poller test; \
	else \
		echo "ERROR: services/poller not found"; \
		exit 1; \
	fi

migrate:
	@echo "Running database migrations..."
	@if [ -d services/poller ]; then \
		make -C services/poller migrate; \
	else \
		echo "ERROR: services/poller not found"; \
		exit 1; \
	fi

import:
	@echo "Run ingest worker (one-shot)"
	docker compose -f $(COMPOSE_FILE) run --rm ingest
