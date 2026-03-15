# CivicPulse Run API

## What This Is

A multi-tenant, nonpartisan platform for managing political campaign field operations. The system provides a REST API with full web UI covering authentication, voter CRM with CSV import wizard (including L2 voter file support with propensity scores, demographics, mailing address, household data, and auto-phone creation), canvassing management (PostGIS turf cutting, walk lists, door-knock tracking), phone banking (call lists, DNC management, active calling experience with survey integration), volunteer coordination (self-registration, shift scheduling, check-in/out, hours tracking), and operational dashboards — all with role-based permission gating and row-level security isolation between campaigns. The voter search system supports 32+ composable filter dimensions with category-colored dismissible chips.

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
- ✓ Permission-gated UI with RequireRole component and usePermissions hook — v1.2
- ✓ Form navigation protection with useFormGuard (route blocking + beforeunload) — v1.2
- ✓ Reusable DataTable with server-side sorting, filtering, and pagination — v1.2
- ✓ Campaign settings (edit, delete, ownership transfer) with type-to-confirm — v1.2
- ✓ Campaign member management (invite, list, role change, remove) — v1.2
- ✓ Voter management UI (contacts, tags, static/dynamic lists, advanced 19-filter search, interaction notes) — v1.2
- ✓ Voter import wizard (CSV upload, column mapping with auto-detect, preview, progress tracking, history) — v1.2
- ✓ Call list & DNC management (create with DNC filtering, detail with status tabs, bulk DNC import with reasons) — v1.2
- ✓ Phone banking UI (session CRUD, member picker caller assignment, active calling screen with claim/record/skip, progress dashboards) — v1.2
- ✓ Volunteer management UI (roster, self-registration, availability, tags, hours tracking) — v1.2
- ✓ Shift management UI (scheduling with date groups, signup/assign, check-in/out, roster, hours adjustment) — v1.2
- ✓ Expanded voter model with 22 first-class columns (propensity scores, mailing address, demographics, household, military status) — v1.3
- ✓ Import pipeline auto-creates VoterPhone records from L2 cell phone columns — v1.3
- ✓ Voting history parsing from L2 General/Primary columns into canonical format — v1.3
- ✓ Propensity percentage parsing (string to integer) during import — v1.3
- ✓ Fixed upsert SET clause to derive from model columns, not first batch row — v1.3
- ✓ 15 new composable filter conditions (propensity ranges, demographic multi-select, mailing address) — v1.3
- ✓ Backward-compatible voting history filtering (year-only → General+Primary expansion) — v1.3
- ✓ Voter detail page with propensity badges, mailing address, demographics, household cards — v1.3
- ✓ Accordion filter builder with dual-handle sliders and dynamic checkboxes — v1.3
- ✓ POST /voters/search with Literal-validated sort_by and dynamic cursor pagination — v1.3
- ✓ 23-dimension filter chip system with category colors and dismissible chips — v1.3
- ✓ Grouped column mapping dropdown with 45+ canonical fields for import wizard — v1.3

### Active

#### Current Milestone: v1.4 Volunteer Field Mode

**Goal:** A dedicated, zero-training mobile-first experience for volunteers actively canvassing or phone banking in the field.

**Target features:**
- Volunteer landing page that routes to active assignment (canvassing or phone banking)
- Linear canvassing wizard (next address → knock → record outcome → inline survey → next)
- Phone banking mode with start/stop, tap-to-call tel: links, result recording, inline survey
- One-time guided onboarding tour with option to revisit
- Built-in tooltips and contextual help throughout
- Mobile-optimized touch targets and progressive disclosure

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
- Self-computed propensity scores — vendor problem; import vendor data as-is
- BISG/fBISG ethnicity prediction — 14-26% error rates, legal/ethical concerns
- Normalized ethnicity/language enums — L2 has 50+ values, fixed enums break with vendor data

## Current State

Shipped v1.3 Voter Model & Import Enhancement on 2026-03-15. All 4 milestones complete (v1.0 MVP, v1.1 Dev/Deploy, v1.2 Full UI, v1.3 Voter Model). Starting v1.4 Volunteer Field Mode.

## Context

Shipped v1.0 MVP (39 requirements, 7 phases), v1.1 Local Dev & Deployment Readiness (15 requirements, 4 phases), v1.2 Full UI (66 requirements, 11 phases), and v1.3 Voter Model & Import Enhancement (27 requirements, 7 phases) over 8 days.
Tech stack: FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL, MinIO, TaskIQ (backend); React + TanStack Router/Query + shadcn/ui (frontend).
Codebase: ~34K LOC Python backend + ~34K LOC TypeScript frontend.
Deployment: Docker Compose for local dev, GitHub Actions CI/CD to GHCR, K8s manifests with ArgoCD GitOps.
18 tech debt items from v1.0 (integration tests need live infrastructure). 7 low-severity tech debt items from v1.2. 3 human verification items from v1.3.

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
| RequireRole hides vs disables | Unauthorized content hidden entirely, not greyed out | ✓ Good — simpler UX, fewer edge cases |
| Server-side DataTable | manualSorting/manualFiltering/manualPagination via TanStack Table | ✓ Good — consistent pattern across all 11 phases |
| useFormGuard (route + beforeunload) | Single hook handles both TanStack Router blocking and browser close | ✓ Good — zero data loss reports |
| XHR for MinIO uploads | ky interceptors break presigned URL auth; raw XMLHttpRequest used | ✓ Good — progress events + clean presigned URL support |
| Popover+Command combobox pattern | Member/volunteer pickers use cmdk for search with Popover container | ✓ Good — reused in caller picker, volunteer assignment |
| Client-side DNC search | Strip non-digits before comparing; no backend search endpoint | ✓ Good — DNC lists are campaign-scoped, small enough for client |
| it.todo test stubs | Wave 0 stubs with no imports keep suite green during development | ✓ Good — Nyquist compliance without blocking progress |
| Single migration for voter expansion | Migration 006 handles all renames + 22 new columns in one file | ✓ Good — simpler than splitting across multiple migrations |
| func.lower() for filter equality | Case-insensitive matching on registration/mailing address and demographics | ✓ Good — consistent pattern, zip stays exact match |
| SET clause from model columns | Upsert derives SET from Voter.__table__.columns, not first batch row | ✓ Good — fixed silent column omission bug |
| RETURNING clause for phone linking | Voter upsert returns IDs for VoterPhone bulk creation | ✓ Good — single round-trip per batch |
| Year-only voting history expansion | voted_in: ["2024"] expands to General_2024 + Primary_2024 with overlap | ✓ Good — backward compatible with saved filters |
| POST /voters/search | Body-based search replaces GET query params for complex filters | ✓ Good — all 32 filter dimensions fit cleanly in body |
| Literal-typed sort_by | 12-column union type with compile-time validation | ✓ Good — type safety without runtime overhead |
| filterChipUtils shared utility | Centralized chip formatting with category colors for 23 dimensions | ✓ Good — consistent across voter list, detail, and dialog pages |

---
*Last updated: 2026-03-15 after v1.4 milestone start*
