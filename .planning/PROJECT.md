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
- ✓ Docker Compose full-stack dev environment with auto-migrations and hot-reload — v1.1
- ✓ Multi-stage Dockerfile (node/uv/python-slim) with health probes and SPA serving — v1.1
- ✓ GitHub Actions CI/CD for GHCR image publishing with SHA tags and manifest auto-update — v1.1
- ✓ Kubernetes manifests with init container migrations, Service, and Secret template — v1.1
- ✓ Traefik IngressRoute and ArgoCD Application for GitOps deployment — v1.1
- ✓ Seed data script for Macon-Bibb County demo dataset — v1.1

### Active

(None yet — define with `/gsd:new-milestone`)

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

## Current State

Shipped v1.0 MVP and v1.1 Local Dev & Deployment Readiness.
Next milestone not yet defined — use `/gsd:new-milestone` to start.

## Context

Shipped v1.0 MVP (39 requirements, 7 phases) and v1.1 Local Dev & Deployment Readiness (15 requirements, 4 phases) in 2 days.
Tech stack: FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL, MinIO, TaskIQ.
Codebase: ~58K LOC Python across 263 files, plus 1,512 lines of Docker/CI/K8s infrastructure.
Deployment: Docker Compose for local dev, GitHub Actions CI/CD to GHCR, K8s manifests with ArgoCD GitOps.
18 tech debt items from v1.0 (integration tests need live infrastructure).

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

| Embed web frontend in API container | Temporary convenience; avoids separate static hosting setup for now | ⚠️ Revisit — will move to Cloudflare Pages |
| GHCR for container images | GitHub-native, free for public repos, matches contact-api pattern | ✓ Good — SHA + latest tagging with CI auto-publish |
| Plain K8s manifests (no Helm) | Simplicity, matches contact-api pattern, ArgoCD handles sync | ✓ Good — ArgoCD auto-sync works well |
| Three-stage Docker build | node → uv → python-slim keeps image at 485MB | ✓ Good — clean separation of build concerns |
| Cloudflare TLS termination | HTTP-only IngressRoute; Cloudflare handles HTTPS | ✓ Good — simplifies K8s config |
| CI manifest commit-back | Publish workflow updates k8s/deployment.yaml with new SHA | ✓ Good — GITHUB_TOKEN prevents infinite loops |

---
*Last updated: 2026-03-10 after v1.1 milestone*
