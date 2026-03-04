# Sprint 2 Plan: E2O Dashboard Professionalization

This sprint focuses on transforming the E2O Monitoring Dashboard from a raw list into a professional, real-time tracking tool.

## Goals
1. **Modernize UI**: Move from a plain list to a responsive, card-based dashboard.
2. **Real-time Context**: Add countdown timers and clear status indicators.
3. **Enhanced Polling**: Improve the reliability and depth of the backend data.
4. **Reliability**: Establish basic monitoring and deployment standards.

---

## UI/UX Improvements

### 1. Card-based Launch Dashboard
- **Description**: Replace the `<ul>` list with a responsive grid of cards. Each card displays key launch info (mission name, rocket, location, status).
- **Acceptance Criteria**:
  - Responsive grid layout (CSS Grid or Flexbox).
  - Cards highlight the next upcoming launch.
  - Consistent styling using a modern framework (Tailwind recommended).
- **Effort**: M
- **Priority**: P1

### 2. Live Countdown Timers
- **Description**: Add a dynamic "T-minus" countdown for the next scheduled launch.
- **Acceptance Criteria**:
  - Countdown updates every second without full page refresh.
  - Automatically handles timezone conversions for the user.
  - Displays "LIFTOFF" or "IN FLIGHT" when T-0 is reached.
- **Effort**: S
- **Priority**: P1

### 3. Status Indicators & Color Coding
- **Description**: Visual cues for launch status (e.g., Green for Success, Blue for Scheduled, Red for Scrubbed/Failure).
- **Acceptance Criteria**:
  - Badge or border color matches the status string from API.
  - Legend or intuitive icons for different states.
- **Effort**: S
- **Priority**: P2

---

## Data Visualization

### 4. Mission Timeline View
- **Description**: A vertical or horizontal timeline showing historical and upcoming launches in sequence.
- **Acceptance Criteria**:
  - Visual separation between "Past" and "Future" launches.
  - Ability to scroll through the sequence.
- **Effort**: M
- **Priority**: P2

### 5. Launch Map Integration
- **Description**: A simple map (Leaflet or Mapbox) showing the location of the next launch.
- **Acceptance Criteria**:
  - Map pin at the launch pad coordinates.
  - Tooltip with mission name on hover.
- **Effort**: M
- **Priority**: P3

---

## Poller & API Improvements

### 6. Scheduled Polling & Webhooks
- **Description**: Refactor the poller to use a more robust scheduling mechanism (e.g., Celery or a stable Cron loop) and support deeper LL2 pagination.
- **Acceptance Criteria**:
  - Poller fetches >20 launches to populate history.
  - Configurable poll intervals for "Active" (near launch) vs "Idle" periods.
- **Effort**: M
- **Priority**: P2

### 7. API Caching & Pagination
- **Description**: Implement server-side caching and paginated results in the FastAPI backend.
- **Acceptance Criteria**:
  - `/api/v1/launches` supports `offset` and `limit` parameters.
  - Cache responses for 60 seconds to reduce DB load.
- **Effort**: S
- **Priority**: P2

---

## Infrastructure

### 8. HTTPS & Domain Setup
- **Description**: Secure the dashboard with SSL and a custom domain.
- **Acceptance Criteria**:
  - Redirect HTTP to HTTPS.
  - SSL cert managed via Let's Encrypt/Certbot.
- **Effort**: S
- **Priority**: P1

### 9. Health Monitoring & Logging
- **Description**: Basic observability for the poller and API.
- **Acceptance Criteria**:
  - Healthcheck endpoint (`/health`).
  - Centralized logs for the poller service.
- **Effort**: S
- **Priority**: P2

---

## Recommended Sprint Order

1. **Phase 1: Foundations (P1)**
   - HTTPS & Domain Setup
   - Card-based Launch Dashboard
   - Live Countdown Timers

2. **Phase 2: Data Depth (P2)**
   - API Caching & Pagination
   - Scheduled Polling & Webhooks
   - Status Indicators & Color Coding
   - Health Monitoring & Logging

3. **Phase 3: Visual Polish (P3)**
   - Mission Timeline View
   - Launch Map Integration
