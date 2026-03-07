# Earth to Orbit (E2O) - Strategic Roadmap

This roadmap defines the evolution of the E2O Monitoring Dashboard from a stable ingestion engine into a high-fidelity operational awareness platform.

## Vision
To provide a professional, real-time "status board" for global space infrastructure, moving beyond simple tracking into proactive monitoring and visualization.

---

## 🌅 Horizon 1: Near-Term (Operational Hardening)
**Focus:** Reliability, portability, and production-readiness. Transitioning from "it works on my machine" to "it works anywhere."

### Milestones
- **Migrations Service:** Decouple database schema management from the API/Poller services.
  - *Acceptance:* `db-migrate` container runs successfully and handles schema versioning.
- **Deploy Playbook:** Standardized deployment instructions (Ansible or optimized Compose).
  - *Acceptance:* A single command can bring up the entire stack on a clean VPS.
- **Bootstrap Removal:** Eliminate reliance on legacy bootstrap scripts in favor of native service health checks.
  - *Acceptance:* Services restart and connect based on container health, not manual ordering.

---

## 🌅 Horizon 2: Mid-Term (Geo-Spatial & Overlays)
**Focus:** Visualization and context. Moving from lists to maps and rich overlays.

### Milestones
- **Geo/Overlay System Scaffold:** Implementation of a spatial data layer in the backend.
  - *Acceptance:* API supports querying launches by coordinates and provides spatial metadata.
- **Exemplar Overlay: Landing Zones:** Visualization of recovery areas (ASDS drone ships, LZ-1, etc.).
  - *Acceptance:* Dashboard displays recovery site locations and real-time status where available.
- **Exemplar Overlay: Launch Corridors:** Static or dynamic path visualization for major launch trajectories.
  - *Acceptance:* User can toggle "Corridors" to see typical ascent paths from KSC/VAFB.

---

## 🌅 Horizon 3: Long-Term (Platform Maturity)
**Focus:** Professional operations, security, and global scale.

### Milestones
- **Observability & Incident Response:** Deep instrumentation of the ingestion pipeline.
  - *Acceptance:* Grafana dashboard showing ingestion latency, DB health, and automated alerting on LL2 API failures.
- **Auth & RBAC:** Secure access for management and configuration.
  - *Acceptance:* Distinct roles (Viewer, Editor, Admin) for dashboard interactions and alert management.
- **Data Provenance & Performance:** High-speed historical querying and verified data sourcing.
  - *Acceptance:* Sub-second response times for multi-year historical queries; tracking of data source metadata.
- **Test Strategy:** End-to-end integration testing for the full stack.
  - *Acceptance:* CI pipeline that validates ingestion-to-UI flow for every PR.

---
*Maintained by PM @ BakerTech Ops*
