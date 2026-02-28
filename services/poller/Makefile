VENV ?= .venv
PYTHON ?= $(shell command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python3)
PY := $(if $(wildcard $(VENV)/bin/python),$(VENV)/bin/python,$(PYTHON))

.PHONY: db-up migrate venv install test shell clean

venv:
ifneq ($(wildcard $(VENV)/bin/python),)
	@echo "Using existing venv: $(VENV)"
else
	@echo "Creating venv at $(VENV)"
	$(PYTHON) -m venv $(VENV)
endif
	@echo "Upgrading pip/setuptools/wheel in $(VENV)"
	$(VENV)/bin/python -m pip install -U pip setuptools wheel

install: venv
	@echo "Installing editable package and test extras into $(VENV)..."
	$(VENV)/bin/python -m pip install -e .[test]

test: install
	@$(VENV)/bin/python -m pytest -q

shell: venv
	@echo "Entering venv shell; type exit to return"
	@bash -c "source $(VENV)/bin/activate && exec bash"

clean:
	rm -rf $(VENV)

db-up:
	docker compose up -d db

migrate:
	until docker compose exec -T db pg_isready -U postgres; do \
		echo "Waiting for postgres..."; \
		sleep 2; \
	done
	alembic upgrade head
