# E2O Deployment Strategy: GitHub Pages vs. DigitalOcean

## GitHub Pages (Current)
- **Status**: Live at https://crow50.github.io/earth-to-orbit-monitoring/
- **Pros**: Zero cost, zero maintenance, extremely fast.
- **Cons**: Static only. Cannot run the Python API, Postgres DB, or Poller. The "telemetry loading" message will never resolve without a backend.

## DigitalOcean Droplet (Proposed)
- **Status**: Not started.
- **Pros**: Full stack. Can run Docker Compose with the API, Database, and Poller. Provides a true functional demo for potential BTO clients.
- **Cons**: Monthly cost (-12), requires security hardening and monitoring.
- **Implementation**:
    - Use `doctl` to provision a $6 Droplet.
    - Deploy via Docker Compose.
    - Protect with Twingate (ZTNA) to demonstrate the BTO "Managed Secure Access" tier.
    - Expose the Dashboard via a custom domain or Tailscale.

## Recommendation
Transition to a **DigitalOcean Droplet** to showcase the full "Managed Infrastructure & DevSecOps" capability of Baker Tech Ops. We can use the E2O project as the definitive case study for new clients.
