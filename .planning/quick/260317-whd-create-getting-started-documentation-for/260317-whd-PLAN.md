---
phase: quick
plan: 260317-whd
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - docs/getting-started-admin.md
  - docs/getting-started-campaign-manager.md
  - docs/getting-started-volunteer.md
autonomous: true
must_haves:
  truths:
    - "System admin can follow docs to deploy CivicPulse locally with Docker Compose"
    - "Campaign manager can follow docs to set up a campaign with voters, canvassing, and phone banking"
    - "Volunteer can follow docs to register, use field mode, and manage shifts"
    - "All docs cross-link to each other and to README.md"
    - "README.md serves as a hub linking to all getting started guides"
  artifacts:
    - path: "README.md"
      provides: "Project overview and hub linking to all getting started guides"
    - path: "docs/getting-started-admin.md"
      provides: "System admin deployment and configuration guide"
    - path: "docs/getting-started-campaign-manager.md"
      provides: "Campaign manager operational guide"
    - path: "docs/getting-started-volunteer.md"
      provides: "Volunteer onboarding and field usage guide"
  key_links:
    - from: "README.md"
      to: "docs/getting-started-*.md"
      via: "markdown links in Getting Started section"
    - from: "docs/getting-started-admin.md"
      to: "docs/getting-started-campaign-manager.md"
      via: "Next Steps cross-link"
    - from: "docs/getting-started-campaign-manager.md"
      to: "docs/getting-started-volunteer.md"
      via: "Next Steps cross-link"
---

<objective>
Create three audience-specific getting started guides (system admin, campaign manager, volunteer) and update README.md as a hub document linking to all three.

Purpose: Enable self-service onboarding for all user personas without hand-holding.
Output: 4 markdown files (1 updated README + 3 new guides) with full cross-linking.
</objective>

<execution_context>
@/home/kwhatcher/.claude/get-shit-done/workflows/execute-plan.md
@/home/kwhatcher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@docker-compose.yml
@.env.example
@app/core/config.py
@scripts/dev-entrypoint.sh
@docs/k8s-deployment-guide.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create three getting started guides using agent team approach</name>
  <files>docs/getting-started-admin.md, docs/getting-started-campaign-manager.md, docs/getting-started-volunteer.md</files>
  <action>
Create three markdown documents, each targeting a specific audience. Use parallel sub-agents (one per document) for speed.

**docs/getting-started-admin.md — System Administrator Guide**

Structure:
- **Overview** — What CivicPulse Run is, what this guide covers
- **Prerequisites** — Docker, Docker Compose, git, a ZITADEL instance (link to zitadel.com docs)
- **Quick Start (Docker Compose)** — Step-by-step: clone repo, copy `.env.example` to `.env`, configure ZITADEL vars (`ZITADEL_ISSUER`, `ZITADEL_PROJECT_ID`, `ZITADEL_SERVICE_CLIENT_ID`, `ZITADEL_SERVICE_CLIENT_SECRET`, `ZITADEL_SPA_CLIENT_ID`), run `docker compose up`, verify services (API on :8000, MinIO console on :9001, Postgres on :5433)
- **ZITADEL Configuration** — Create a ZITADEL project, create a service account (for backend API), create an SPA application (for browser OIDC), note the client IDs and secrets, configure redirect URIs (`http://localhost:5173/callback`)
- **Environment Variables Reference** — Table of all env vars from `.env.example` with descriptions, required/optional, and default values
- **Storage (MinIO)** — Default credentials (minioadmin/minioadmin), bucket auto-creation, production note about Cloudflare R2
- **Database** — PostGIS 17-3.5, default creds, migrations run automatically via `dev-entrypoint.sh`, seed data via `python scripts/seed.py`
- **Production Deployment** — Brief pointer to `docs/k8s-deployment-guide.md` for K8s/ArgoCD deployment, note about Cloudflare Tunnel for ingress
- **Troubleshooting** — Common issues: ZITADEL connection refused (check issuer URL), MinIO health check failing (wait for startup), database migration errors (check DATABASE_URL)
- **Cross-links** — Link to README.md, campaign manager guide, k8s deployment guide

**docs/getting-started-campaign-manager.md — Campaign Manager Guide**

Structure:
- **Overview** — What campaign managers can do, link to admin guide for setup
- **Logging In** — ZITADEL OIDC login flow, first-time access
- **Creating a Campaign** — Navigate to campaigns, click New Campaign, fill name/description
- **Importing Voters** — Go to Voters > Imports > New Import, upload CSV, map columns, review and confirm. Mention supported fields (name, address, phone, email, tags)
- **Voter Management** — Voter lists, tags, individual voter detail view, voter contact history
- **Setting Up Surveys/Scripts** — Create survey scripts for canvassers and phone bankers, question types
- **Canvassing Setup** — Turfs: create geographic turfs (draw on map or import), Walk Lists: generate from turfs, assign to volunteers
- **Phone Banking Setup** — Call Lists: create from voter filters, DNC management (import DNC lists), Phone Bank Sessions: create sessions, assign call lists
- **Managing Volunteers** — Volunteer registration (share registration link), Roster view, Tags for organizing, Shifts: create and manage shifts, track hours
- **Campaign Settings** — General settings, member management (roles), danger zone
- **Dashboard** — Overview of campaign metrics and activity
- **Cross-links** — Link to README.md, admin guide (for deployment), volunteer guide (share with your team)

**docs/getting-started-volunteer.md — Volunteer Guide**

Structure:
- **Overview** — What volunteers can do, mobile-friendly design
- **Getting Started** — Receive registration link from campaign manager, create account via ZITADEL, access the campaign
- **Your Dashboard** — Campaign selection (if member of multiple), volunteer home view
- **Field Mode — Canvassing** — Access via Field > Canvassing, view assigned walk list, navigate to doors (Google Maps integration with street address), record survey responses, mark contact attempts, offline support for areas with poor connectivity
- **Field Mode — Phone Banking** — Access via Field > Phone Banking, join a phone bank session, view call script, record call outcomes, automatic next-contact progression, DNC compliance
- **Shifts and Hours** — View available shifts, sign up, log volunteer hours
- **Tips for Success** — Charge your phone, download maps for offline areas, review the survey script before heading out
- **Cross-links** — Link to README.md, campaign manager guide (for your campaign manager)

Each document should:
- Start with a clear title and one-sentence description
- Use a table of contents (linked headings)
- Include practical examples and expected UI descriptions
- End with "See Also" section cross-linking to the other two guides and README.md
  </action>
  <verify>
    <automated>test -f docs/getting-started-admin.md && test -f docs/getting-started-campaign-manager.md && test -f docs/getting-started-volunteer.md && echo "All three guides exist" && grep -l "getting-started" docs/getting-started-*.md | wc -l</automated>
  </verify>
  <done>Three getting started guides exist with audience-appropriate content, cross-linked to each other</done>
</task>

<task type="auto">
  <name>Task 2: Update README.md as documentation hub</name>
  <files>README.md</files>
  <action>
Rewrite README.md to serve as the project hub. Structure:

```
# CivicPulse Run

A multi-tenant, nonpartisan platform for managing political campaign field operations. Any candidate, regardless of party or budget, can run professional-grade field operations.

## Features

- **Campaign Management** — Create and manage campaigns with role-based access
- **Voter CRM** — Import voter files (CSV), manage voter lists and tags, track contact history
- **Canvassing** — Geographic turf cutting with PostGIS, walk list generation, mobile field mode with offline support
- **Phone Banking** — Call list management, phone bank sessions, DNC compliance
- **Volunteer Coordination** — Self-service registration, shift management, hour tracking
- **Operational Dashboard** — Real-time campaign metrics and activity

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS |
| Frontend | React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS |
| Auth | ZITADEL (OIDC) |
| Storage | MinIO (dev) / Cloudflare R2 (prod) |
| Deployment | Docker Compose (dev), K8s + ArgoCD (prod) |

## Getting Started

Choose the guide for your role:

| Guide | Audience | Description |
|-------|----------|-------------|
| [System Administrator](docs/getting-started-admin.md) | DevOps / IT | Deploy and configure the platform |
| [Campaign Manager](docs/getting-started-campaign-manager.md) | Campaign staff | Set up and run campaign operations |
| [Volunteer](docs/getting-started-volunteer.md) | Field volunteers | Use the app for canvassing and phone banking |

## Quick Start (Development)

\```bash
git clone <repo-url>
cd run-api
cp .env.example .env
# Edit .env with your ZITADEL credentials (see Admin guide)
docker compose up
\```

- API: http://localhost:8000
- Web UI: http://localhost:8000 (served by API container)
- MinIO Console: http://localhost:9001
- API Docs: http://localhost:8000/docs

## Documentation

- [System Admin Guide](docs/getting-started-admin.md) — Deployment, configuration, infrastructure
- [Campaign Manager Guide](docs/getting-started-campaign-manager.md) — Campaign setup and operations
- [Volunteer Guide](docs/getting-started-volunteer.md) — Field mode, canvassing, phone banking
- [K8s Deployment Guide](docs/k8s-deployment-guide.md) — Production Kubernetes deployment

## License

[Add license information]
```

Remove the backtick escapes above — those are just to show structure. Write the actual markdown content.
  </action>
  <verify>
    <automated>grep -c "getting-started" README.md && grep "getting-started-admin" README.md && grep "getting-started-campaign-manager" README.md && grep "getting-started-volunteer" README.md && echo "All cross-links present"</automated>
  </verify>
  <done>README.md contains project overview, feature list, tech stack table, getting started section with links to all three guides, quick start commands, and documentation index</done>
</task>

</tasks>

<verification>
- All four files exist and contain substantive content (not stubs)
- Every guide cross-links to the other two and to README.md
- README.md links to all three guides in both the Getting Started table and Documentation section
- No broken relative links between documents
- Content is accurate to the actual codebase (correct ports, env vars, routes)
</verification>

<success_criteria>
- Three audience-specific getting started guides in docs/
- README.md serves as hub with links to all guides
- Cross-linking is bidirectional (each doc links to others)
- Admin guide covers Docker Compose setup, ZITADEL config, env vars, and has accurate technical details
- Campaign manager guide covers the full campaign lifecycle (create, import voters, set up canvassing/phone banking, manage volunteers)
- Volunteer guide covers registration, field mode (canvassing + phone banking), and shifts
</success_criteria>

<output>
After completion, create `.planning/quick/260317-whd-create-getting-started-documentation-for/260317-whd-SUMMARY.md`
</output>
