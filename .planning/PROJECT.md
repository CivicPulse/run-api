# CivicPulse Run API

## What This Is

A multi-tenant, nonpartisan REST API for managing political campaigns — serving candidates of any party or affiliation. The API powers field operations (canvassing, phone banking, volunteer management) with integrated voter CRM capabilities, designed to rival tools like NGPVAN's MiniVAN and NationBuilder while remaining open-source and accessible.

## Core Value

Any candidate, regardless of party or budget, can run professional-grade field operations — canvassing, phone banking, and volunteer coordination — from a single API.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Project scaffold with FastAPI + SQLAlchemy + PostgreSQL stack — existing
- ✓ ZITADEL authentication integration planned at auth.civpulse.org — existing decision
- ✓ Kubernetes deployment target — existing decision
- ✓ Competitive research on campaign tech landscape — existing (docs/campaign_platforms_research.md)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Authentication & user management via ZITADEL
- [ ] Multi-tenant campaign management (campaign CRUD, owner assignment, data isolation)
- [ ] Voter/constituent data import from multiple sources (L2, state SOS files, generic CSV)
- [ ] Canonical voter model with configurable field mappings per data source
- [ ] Constituent CRM with interaction history and segmentation
- [ ] Canvassing management — turf cutting, walk list generation, household clustering
- [ ] Canvassing tracking — door-knock outcomes, branched survey scripts, survey responses
- [ ] GPS routing suggestions for canvassing routes
- [ ] Real-time canvassing dashboards
- [ ] Phone banking — call list generation, scripts, call outcome tracking
- [ ] Volunteer management — signup, skill tracking, shift scheduling
- [ ] Volunteer assignment to turfs, phone banks, and tasks

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Donation management / Stripe integration — defer to v2, keep v1 focused on field ops
- FEC/state campaign finance compliance — high complexity, defer to v2
- Event management — defer to v2
- Email/SMS messaging — defer to v2
- Campaign website management — defer to v2
- Analytics & reporting beyond real-time dashboards — defer to v2
- Mobile app — this is a backend API only; mobile clients are separate projects
- Web dashboard frontend — API-only; frontends are separate projects

## Context

- The campaign tech market is dominated by partisan platforms (NGPVAN for Democrats, WinRed/i360 for Republicans) that exclude independent and third-party candidates
- ~49% of Americans identify with neither major party but have no access to professional campaign tools
- NGPVAN is degrading under private equity ownership (Bonterra/Apax); NationBuilder is increasingly expensive
- Open-source alternatives exist in fragments (Spoke for texting, CiviCRM for donor mgmt) but nothing integrated
- An example L2-format voter file exists at `data/example-2026-02-24.csv` with 50+ fields including voting history, likelihood scores, ethnicity estimates, lat/long, and household data
- The project follows Specification-Driven Development (SDD) as documented in `docs/spec_driven_dev(SDD).md`
- Existing codebase map is at `.planning/codebase/`

## Constraints

- **Tech stack**: FastAPI + SQLAlchemy + PostgreSQL + PostGIS — already decided and declared in pyproject.toml
- **Auth**: ZITADEL at https://auth.civpulse.org — external OpenID Connect/OAuth2 provider, non-negotiable
- **Deployment**: Kubernetes — production deployment target
- **Python**: 3.13+ with uv for package management
- **API-only**: No frontend — this is a REST API consumed by separate client applications
- **Multi-tenant**: Must support data isolation between campaigns from day one
- **Nonpartisan**: No political affiliation restrictions on who can use the platform

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ZITADEL for auth | Externalize auth to proven OpenID Connect provider; avoid building auth from scratch | — Pending |
| PostgreSQL + PostGIS | Geographic queries essential for turf cutting and canvassing; PostGIS is the standard | — Pending |
| Multi-tenant from start | Shared deployment for many campaigns reduces ops burden; data isolation via campaign_id | — Pending |
| API-only (no frontend) | Separation of concerns; enables multiple client apps (web, mobile, CLI) | — Pending |
| Multi-source voter import | Campaigns use different data vendors (L2, state SOS, etc.); flexible mapping system needed | — Pending |
| Field ops as core value | Canvassing + phone banking is the biggest gap for independent candidates | — Pending |

---
*Last updated: 2026-03-09 after initialization*
