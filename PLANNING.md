# Planning: Rocket Launch Alerts Dashboard

This document outlines the Epics and User Stories for the Rocket Launch Alerts Dashboard project.

## Epics

### Epic 1: Launch Data Ingestion
**Goal**: Reliably fetch, store, and update rocket launch data from Launch Library 2 API.
**User Stories**:
- As a user, I want the system to automatically poll the Launch Library 2 API every 5 minutes for new and updated launch data.
- As a user, I want the system to filter launch data to only include launches from Cape Canaveral.
- As a user, I want the system to store detailed launch information (ID, name, date, status, pad, location_id, last_update) in the database.
- As a user, I want the system to detect significant changes in launch details (e.g., date, status) to trigger appropriate notifications.

### Epic 2: User Preferences & Subscriptions
**Goal**: Allow users to configure their notification preferences and subscribe to specific launches or locations.
**User Stories**:
- As a user, I want to define my active hours for receiving notifications (e.g., 8 AM - 10 PM EST).
- As a user, I want to subscribe to all launches from a specific location (e.g., Cape Canaveral).
- As a user, I want to subscribe to alerts for a specific rocket launch.
- As a user, I want to toggle notifications by type (e.g., status updates, slip warnings, pad status).

### Epic 3: Telegram Notification Delivery
**Goal**: Deliver timely and relevant launch alerts to the user via Telegram.
**User Stories**:
- As a user, I want to receive launch alerts in a dedicated Telegram chat/channel, not my main Oats chat.
- As a user, I want high-churn updates (status/weather/probability) to be throttled to avoid spam.
- As a user, I want low-churn updates (static info) to be delivered once per critical milestone.
- As a user, I want notifications to be time-zone adjusted and respect my active hours.
- As a user, I want notifications to include essential details (mission, status, location, time, URL).

### Epic 4: Dashboard MVP
**Goal**: Provide a basic web interface for managing subscriptions and viewing upcoming launches.
**User Stories**:
- As a user, I can view a list of upcoming launches, filtered by my preferences.
- As a user, I can add, edit, or remove my launch and location subscriptions.
- As a user, I can configure my alert active hours via the dashboard.
- As a user, I can enable/disable high-churn notifications via the dashboard.

### Epic 5: Deployment & Observability
**Goal**: Deploy the system reliably on k3s with appropriate monitoring and logging.
**User Stories**:
- As a sysadmin, I want to deploy all services (poller, notifier, dashboard, DB) using Helm charts on k3s.
- As a sysadmin, I want to ensure API keys and sensitive data are stored securely as Kubernetes secrets.
- As a sysadmin, I want the system to have basic monitoring (Prometheus/Grafana) and centralized logging (EFK stack).
- As a sysadmin, I want automated daily backups for the PostgreSQL database.
