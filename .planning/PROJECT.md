# CivicPulse Run API

## What This Is

A multi-tenant, nonpartisan REST API for managing political campaign field operations. The API provides authentication, voter CRM with import pipeline, canvassing management (PostGIS turf cutting, walk lists, door-knock tracking), phone banking (call lists, DNC management, survey reuse), volunteer coordination (shift scheduling, cross-domain check-in, hours tracking), and operational dashboards — all with row-level security isolation between campaigns.

## Core Value

Any candidate, regardless of party or budget, can run professional-grade field operations — canvassing, phone banking, and volunteer coordination — from a single API.

## Requirements

### Validated

- ✓ ZITADEL OIDC authentication with JWT/JWKS validation — v1.0
- ✓ Campaign CRUD with ZITADEL org provisioning and compensating transactions — v1.0
- ✓ PostgreSQL RLS-based multi-tenant data isolation — v1.0
- ✓ Role-based access control (owner, admin, manager, volunteer, viewer) — v1.0
- ✓ Campaign invites with role assignment — v1.0
- ✓ CSV voter file import with RapidFuzz field mapping — v1.0
- ✓ L2-format voter file import with pre-configured mapping — v1.0
- ✓ Canonical voter model with demographics, voting history, lat/long — v1.0
- ✓ Composable voter search/filter query builder — v1.0
- ✓ Target universes via dynamic voter lists — v1.0
- ✓ Voter tagging and static/dynamic list management — v1.0
- ✓ Append-only voter interaction history — v1.0
- ✓ Multi-channel contact management (phone/email/address) — v1.0
- ✓ PostGIS turf cutting with polygon boundaries — v1.0
- ✓ Household-clustered walk list generation — v1.0
- ✓ Door-knock outcome recording with contact attempt tracking — v1.0
- ✓ Reusable survey engine (linear scripts, multiple choice/scale/free text) — v1.0
- ✓ Call list generation with DNC filtering and claim-on-fetch — v1.0
- ✓ Phone bank sessions with call recording and survey integration — v1.0
- ✓ Auto-DNC on refused outcomes — v1.0
- ✓ Volunteer registration with skills and availability — v1.0
- ✓ Shift scheduling with capacity limits and waitlists — v1.0
- ✓ Cross-domain check-in (auto-creates canvasser/caller records) — v1.0
- ✓ Hours tracking with check-in/check-out and manual adjustment — v1.0
- ✓ Canvassing, phone banking, and volunteer dashboards with drilldowns — v1.0

### Active

- [ ] Local dev environment via Docker Compose (full stack: API, PostgreSQL+PostGIS, MinIO)
- [ ] Dockerfile for containerized API with embedded web frontend
- [ ] GitHub Actions CI/CD pipeline for GHCR image publishing
- [ ] Kubernetes manifests for baremetal deployment (Traefik ingress)
- [ ] ArgoCD application manifest for GitOps deployment
- [ ] Web frontend served via FastAPI static files mount (temporary; moves to Cloudflare Pages later)

### Out of Scope

- Donation management / Stripe integration — FEC compliance extremely complex, defer
- FEC/state campaign finance compliance — 80+ federal report types, 50 state systems
- Mobile app — API-only; mobile clients are separate projects
- Predictive dialer / telephony integration — requires Twilio/TCPA/FCC compliance
- Email/SMS delivery engine — building deliverability infra is a separate product
- AI-generated campaign content — client-side concern
- Voter score prediction — import vendor-provided scores instead
- Real-time WebSocket infrastructure — SSE sufficient unless demand emerges
- Actual cluster deployment — manifests only, deployment is a separate operational step
- Helm/Kustomize — plain manifests following contact-api pattern
- Local ZITADEL instance — use existing dev org at auth.civpulse.org

## Current Milestone: v1.1 Local Dev & Deployment Readiness

**Goal:** Make the v1.0 API runnable end-to-end locally via Docker Compose and ready for K8s deployment to baremetal cluster via GHCR images and plain manifests.

**Target features:**
- Docker Compose local dev environment (API + PostgreSQL/PostGIS + MinIO)
- Dockerfile with web frontend build embedded (served via FastAPI static mount)
- GitHub Actions CI/CD for GHCR image publishing (SHA tags, matching contact-api pattern)
- K8s manifests (Deployment, Service, Traefik IngressRoute, Secret template)
- ArgoCD application manifest for GitOps
- Documentation of secrets to generate separately on deploy workstation

## Context

Shipped v1.0 with 56,653 LOC Python across 243 files.
Tech stack: FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL, MinIO, TaskIQ.
39 v1 requirements delivered across 7 phases in 2 days.
18 tech debt items (integration tests written but need live infrastructure execution).
All Nyquist validation phases in draft status.

## Constraints

- **Tech stack**: FastAPI + SQLAlchemy + PostgreSQL + PostGIS — established
- **Auth**: ZITADEL at https://auth.civpulse.org — external OIDC provider
- **Deployment**: Kubernetes — production deployment target
- **Python**: 3.13+ with uv for package management
- **API-first**: Web frontend temporarily served via FastAPI static mount; will move to Cloudflare Pages
- **Multi-tenant**: PostgreSQL RLS isolation between campaigns
- **Nonpartisan**: No political affiliation restrictions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ZITADEL for auth | Externalize auth to proven OIDC provider; avoid building auth from scratch | ✓ Good — Authlib JWT decode + JWKS refresh works well |
| PostgreSQL + PostGIS | Geographic queries essential for turf cutting; PostGIS is the standard | ✓ Good — ST_Contains spatial queries, voter geom backfill |
| Multi-tenant from start | Shared deployment; data isolation via campaign_id RLS | ✓ Good — RLS policies on all 30+ tables, consistent pattern |
| API-only (no frontend) | Separation of concerns; enables multiple client apps | ⚠️ Revisit — v1.1 embeds web frontend temporarily via static mount |
| Multi-source voter import | Campaigns use different data vendors; flexible mapping system needed | ✓ Good — RapidFuzz auto-mapping at 75% threshold |
| Field ops as core value | Canvassing + phone banking is biggest gap for independents | ✓ Good — full canvassing + phone banking with survey reuse |
| Reusable survey engine | Decoupled from canvassing for phone banking reuse | ✓ Good — PhoneBankService composes SurveyService directly |
| Composition over inheritance | Services compose VoterInteractionService, SurveyService, DNCService | ✓ Good — clean dependency injection, no circular imports |
| native_enum=False | VARCHAR for all StrEnum columns for migration extensibility | ✓ Good — avoids ALTER TYPE in future migrations |
| Compensating transactions | ZITADEL org creation + DB insert with rollback on failure | ✓ Good — tested with mocks, needs live validation |
| Claim-on-fetch with SKIP LOCKED | Concurrent call list entry claiming without contention | ✓ Good — PostgreSQL advisory locking pattern |
| Late imports for cross-phase models | Avoid circular deps between volunteer/canvassing/phone banking | ✓ Good — ShiftService.check_in() imports at call site |

| Embed web frontend in API container | Temporary convenience; avoids separate static hosting setup for now | — Pending |
| GHCR for container images | GitHub-native, free for public repos, matches contact-api pattern | — Pending |
| Plain K8s manifests (no Helm) | Simplicity, matches contact-api pattern, ArgoCD handles sync | — Pending |

---
*Last updated: 2026-03-10 after v1.1 milestone start*
