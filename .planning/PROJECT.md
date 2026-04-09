# CivicPulse Run API

## What This Is

A multi-tenant, nonpartisan platform for managing political campaign field operations. The system provides a REST API with full web UI covering authentication, voter CRM with CSV import wizard (including L2 voter file support with propensity scores, demographics, mailing address, household data, and auto-phone creation), canvassing management (PostGIS turf cutting, walk lists, door-knock tracking), phone banking (call lists, DNC management, active calling experience with survey integration), volunteer coordination (self-registration, shift scheduling, check-in/out, hours tracking), and operational dashboards — all with role-based permission gating and row-level security isolation between campaigns. Organization-level management enables multi-campaign oversight with org admin roles, campaign creation wizards, member directories, and org switching. An interactive map-based turf editor provides polygon drawing, GeoJSON import/export, address search, and overlap detection. The voter search system supports 32+ composable filter dimensions with category-colored dismissible chips plus ranked, typo-tolerant voter lookup across names, contacts, addresses, city, ZIP, and source identifiers. A dedicated mobile-first volunteer field mode provides zero-training canvassing and phone banking experiences with offline support, guided onboarding, and WCAG AA accessibility. Production hardening includes Sentry error tracking, structlog request telemetry, trusted-proxy rate limiting on all endpoints, and Playwright E2E test coverage.

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
- ✓ Mobile-first field layout shell with zero admin chrome and assignment-aware volunteer hub — v1.4
- ✓ Linear canvassing wizard with household grouping, inline survey, auto-advance, and persistent state — v1.4
- ✓ Phone banking field mode with tap-to-call, clipboard fallback, E.164 formatting, and outcome recording — v1.4
- ✓ Offline outcome queue with localStorage persistence and automatic sync on connectivity resume — v1.4
- ✓ Guided onboarding tour via driver.js with per-segment completion and help button replay — v1.4
- ✓ WCAG AA accessibility audit — ARIA landmarks, 44px touch targets, color contrast, live regions — v1.4
- ✓ Milestone celebration toasts and voter context cards in canvassing and phone banking — v1.4
- ✓ Google Maps navigation links (walking directions) in field mode and admin pages — v1.4
- ✓ Transaction-scoped RLS context preventing cross-campaign data leaks via pool reuse — v1.5
- ✓ Defense-in-depth pool checkout event resetting campaign context on every connection acquisition — v1.5
- ✓ Centralized get_campaign_db dependency replacing inline set_campaign_context calls — v1.5
- ✓ Multi-campaign membership fix (ensure_user_synced for all org campaigns) with backfill migration — v1.5
- ✓ Sentry error tracking with PII scrubbing and structlog JSON request telemetry — v1.5
- ✓ Trusted-proxy-aware rate limiting (CF-Connecting-IP) with per-user JWT-based keys on all 73 endpoints — v1.5
- ✓ Organization members table with org_owner/org_admin roles and additive role resolution — v1.5
- ✓ Org dashboard with campaign card grid, archive flow, stats bar, and multi-org switcher — v1.5
- ✓ Campaign creation wizard with team invite and org member directory with role matrix — v1.5
- ✓ Interactive map-based turf editor with Leaflet/Geoman, GeoJSON import/export, address search, overlap detection — v1.5
- ✓ UI/UX polish: sidebar slide-over, error boundaries, empty states, loading skeletons, contextual tooltips — v1.5
- ✓ WCAG AA compliance: 38-route axe-core scan, 5 screen reader flow tests, keyboard navigation, skip-nav links — v1.5
- ✓ Playwright E2E tests for critical flows, RLS isolation tests, and connected journey spec with CI integration — v1.5

- ✓ Procrastinate PostgreSQL job queue replacing TaskIQ, with dedicated schema, queueing locks, and 202 Accepted endpoint — v1.6
- ✓ Standalone worker process with HTTP health endpoint, Docker Compose service, and K8s Deployment manifests — v1.6
- ✓ Per-batch import commits with RLS restoration, crash resume from last committed row, real-time polling progress, and bounded per-batch error storage to MinIO — v1.6
- ✓ Streaming CSV import from MinIO with async line-by-line iterator, constant memory usage regardless of file size — v1.6
- ✓ Complete L2 auto-mapping with 58-field canonical dictionary (217 aliases), 6-pattern voting history parser, format auto-detection, and frontend match-type badges — v1.6
- ✓ Import cancellation with cooperative batch-loop detection, CANCELLING/CANCELLED status lifecycle, cancel endpoint (202 Accepted), and frontend cancel UI with ConfirmDialog — v1.6
- ✓ Concurrent import prevention verified end-to-end via Procrastinate queueing lock with 409 Conflict response — v1.6
- ✓ Error report download via MinIO pre-signed URL after partial imports with errors — v1.6
- ✓ Import recovery with orphan detection, startup reclaim, advisory-lock protection, and crash-resume verification — v1.10
- ✓ Chunk import foundation with durable ImportChunk schema, adaptive chunk sizing, and serial-path threshold routing seams — v1.11 Phase 59

- ✓ All 7 P0 cross-tenant isolation breaches eliminated (body injection, spatial join, UUID lookup, field/me gate) — v1.13
- ✓ FastAPI exception handler mapping DB errors to safe 4xx responses (no stack trace leaks) — v1.13
- ✓ Production security headers: CSP, X-Frame-Options, X-Content-Type-Options — v1.13
- ✓ Campaign creation idempotent ensure_project_grant for pre-existing ZITADEL grants — v1.13
- ✓ CSV import endpoint restored (pre-signed upload URL workflow) — v1.13
- ✓ Accessibility: 0 critical axe violations across 16 production pages — v1.13
- ✓ Field hub mobile 3G cold-load rebaselined to 3200 ms budget (product sign-off 2026-04-06) — v1.13
- ✓ Production shakedown verdict: GO with conditions (from NO-GO) — v1.13
- ✓ Search-first voter lookup in the existing voter search flow — v1.14 (LOOK-01, LOOK-05, SRCH-01, SRCH-03, INT-03)
- ✓ Campaign-scoped PostgreSQL search surface with edit/import freshness guarantees — v1.14 (SRCH-02, SRCH-04, TRST-01)
- ✓ Ranked multi-field lookup across name, phone, email, address, city, ZIP, and source identifiers with typo tolerance — v1.14 (LOOK-02, LOOK-03, LOOK-04, TRST-02)
- ✓ Search-first voter page states, stale-response protection, and richer row disambiguation — v1.14 (LOOK-06, INT-01, INT-02)
- ✓ Org-scoped encrypted Twilio credentials and phone inventory with secure webhook routing — v1.15 (ORG-01, ORG-02, ORG-03, SEC-01, SEC-02, SEC-03, SEC-04)
- ✓ Browser click-to-call with Twilio Voice SDK, manual fallback, call logging, and compliance guardrails — v1.15 (VOICE-01, VOICE-02, VOICE-03, VOICE-04)
- ✓ Two-way SMS with bulk queueing, threaded inbox, and STOP/START opt-out enforcement — v1.15 (SMS-01, SMS-02, SMS-03, SMS-04, COMP-01, COMP-02)
- ✓ Org-scoped spend controls and append-only communication telemetry for Twilio voice and SMS — v1.15 (BUD-01, OBS-01)
- ✓ Campaign-scoped Twilio Lookup cache reused by contact editing and SMS preflight — v1.15 (LOOK-01)
- ✓ Provider-agnostic transactional email foundation with Mailgun and code-owned templates — v1.16 (EML-01, EML-02, EML-03, SEC-01)
- ✓ Durable async invite delivery for org, campaign, volunteer, and staff invite flows — v1.16 (EML-04, INV-01, INV-02, INV-03, INV-04)
- ✓ Canonical email-delivery audit trail with authenticated Mailgun webhook reconciliation — v1.16 (AUD-01, AUD-02, AUD-03, SEC-02)
- ✓ ZITADEL SMTP delivery setup and operator runbooks with explicit ownership boundaries — v1.16 (ZIT-01, ZIT-02, OPS-01)
- ✓ Pending-invite admin visibility for delivery status, latest error, and remediation support — v1.16 (AUD-04)

### Active

- v1.17 Easy Volunteer Invites — campaign-scoped volunteer signup links, pending approval workflow, per-link source tracking, and existing-account apply path

### Out of Scope

- Donation management / Stripe integration — FEC compliance extremely complex, defer
- FEC/state campaign finance compliance — 80+ federal report types, 50 state systems
- Mobile app — API-only; mobile clients are separate projects
- Predictive dialer / auto-dialer — TCPA auto-dialer compliance; manual click-to-call only
- Campaign-authored or marketing email campaigns — this milestone is transactional/system email only
- AI-generated campaign content — client-side concern
- Voter score prediction — import vendor-provided scores instead
- Real-time WebSocket infrastructure — SSE sufficient unless demand emerges
- Actual cluster deployment — manifests only, deployment is a separate operational step
- Helm/Kustomize — plain manifests following contact-api pattern
- Local ZITADEL instance — use existing dev org at auth.civpulse.org
- Self-computed propensity scores — vendor problem; import vendor data as-is
- BISG/fBISG ethnicity prediction — 14-26% error rates, legal/ethical concerns
- Normalized ethnicity/language enums — L2 has 50+ values, fixed enums break with vendor data
- Shared org-level voter database — legal/vendor compliance risk; voter data stays campaign-scoped with RLS
- Real-time collaborative turf editing — CRDT/OT for geometry is extreme complexity
- Shapefile (.shp) or KML import — multi-file format requires GDAL/OGR; GeoJSON only
- Freehand polygon drawing — produces self-intersecting polygons that Shapely rejects
- Custom permission builder — fixed 7-role hierarchy (5 campaign + 2 org) is sufficient
- Per-org SSO/SAML configuration — ZITADEL handles SSO at instance level
- White-label / custom branding per org

## Current Milestone

v1.17 Easy Volunteer Invites

**Goal:** Let campaign staff share campaign-scoped volunteer signup links that create pending applications, preserve source attribution, and require approval before a volunteer gains campaign access.

**Target features:**
- Campaign staff can create multiple volunteer signup links per campaign for different channels or sources.
- Each link can be labeled/tracked so staff can tell how an applicant found the campaign.
- Each link can be disabled, rotated, or regenerated if abuse happens.
- Public applicants can submit a volunteer application through a link without being granted campaign access immediately.
- Approved applications become campaign membership; rejected or pending applicants do not get access.
- Existing CivicPulse users who are not members of that campaign can apply through the same flow without creating a second account or re-entering all profile details.

## Current State

**Shipped:** v1.16 Email Delivery Foundation (2026-04-08)

The platform now ships app-owned transactional email for invite workflows alongside the existing Twilio field communications stack. v1.16 closed 6 phases (7 plans), added a provider-agnostic Mailgun-backed email seam with code-owned templates, durable post-commit invite delivery, authenticated webhook reconciliation with canonical delivery-attempt audit rows, separate ZITADEL SMTP runbooks, and pending-invite UI visibility for delivery truth and remediation.

**Ops conditions (not code gaps):**
1. Campaign creation 500 — ZITADEL pod connectivity investigation needed
2. HSTS header — Cloudflare edge configuration
3. QA test data — kubectl cleanup documented

Search freshness boundary remains: direct voter/contact edits are immediate; import completion is expected to become visible within 5 minutes. Twilio lookup cache freshness is 90 days with manual refresh on demand.

Codebase: ~22K LOC Python backend + ~43K LOC TypeScript frontend.

## Next Milestone Goals

- Campaign-scoped volunteer signup links with per-link source attribution and abuse controls
- Pending volunteer application review before any campaign access is granted
- Existing-account apply path for users who already have CivicPulse accounts but are not campaign members

<details>
<summary>Archived v1.16 planning context</summary>

- Provider-agnostic email delivery foundation with Mailgun as the first implementation
- Product invite emails for org/campaign member invitation flows already in the app
- Email support for volunteer/staff invitation flows that already exist
- ZITADEL email delivery configuration and documentation for its own auth/system emails
- Basic delivery/audit metadata for sent email events
- Clear separation between transactional/system email now and broader campaign/authored email later

</details>

## Context

Tech stack: FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL, MinIO, Procrastinate (backend); React + TanStack Router/Query + shadcn/ui + Zustand + driver.js (frontend).
Deployment: Docker Compose for local dev, GitHub Actions CI/CD to GHCR, K8s manifests with ArgoCD GitOps.

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
| Multi-tenant from start | Shared deployment; data isolation via campaign_id RLS | ✓ Good — RLS policies on all 33 tables, transaction-scoped context |
| Multi-source voter import | Campaigns use different data vendors; flexible mapping system needed | ✓ Good — RapidFuzz auto-mapping at 75% threshold |
| Field ops as core value | Canvassing + phone banking is biggest gap for independents | ✓ Good — full canvassing + phone banking with survey reuse |
| Reusable survey engine | Decoupled from canvassing for phone banking reuse | ✓ Good — PhoneBankService composes SurveyService directly |
| Composition over inheritance | Services compose VoterInteractionService, SurveyService, DNCService | ✓ Good — clean dependency injection, no circular imports |
| native_enum=False | VARCHAR for all StrEnum columns for migration extensibility | ✓ Good — avoids ALTER TYPE in future migrations |
| Embed web frontend in API container | Temporary convenience; avoids separate static hosting setup for now | ⚠️ Revisit — will move to Cloudflare Pages |
| Transaction-scoped RLS (set_config true) | Prevents cross-campaign data leaks via connection pool reuse | ✓ Good — critical security fix in v1.5 |
| Centralized get_campaign_db | Single dependency for RLS context; no endpoint can skip it | ✓ Good — replaced 244 inline calls |
| Additive org role resolution | max(campaign role, org role equivalent) — org roles never restrictive | ✓ Good — clean permission hierarchy |
| Leaflet/Geoman for map editor | Free, well-maintained; leaflet-draw abandoned | ✓ Good — polygon draw/edit, GeoJSON round-trip |
| Pure ASGI middleware for structlog | Not BaseHTTPMiddleware to avoid streaming issues | ✓ Good — ContextVars shared across Sentry/logs |
| AST-based rate limit guard test | Verify all route files have decorators without importing app | ✓ Good — catches missing rate limits at CI time |
| Procrastinate over Celery/TaskIQ | PostgreSQL-native job queue; no Redis/RabbitMQ dependency | ✓ Good — durable jobs with queueing locks, simple setup |
| Per-batch commits with RLS restore | COMMIT resets RLS context; must re-set after each batch | ✓ Good — crash-resilient imports, real-time progress |
| Streaming CSV with async generator | Memory-bounded import regardless of file size | ✓ Good — constant ~2 batch + 1 chunk memory footprint |
| cancelled_at timestamp over status enum | Race-safe cancellation signal independent of status transitions | ✓ Good — avoids lost-update race between worker and API |
| format_detected as transient (not persisted) | L2 detection computed at detect time, no schema change needed | ✓ Good — simple, no migration required |
| Production shakedown drives v1.13 scope | Verified failures in deployed behavior should set remediation priority over new feature work | ✓ Good — all P0s fixed, GO verdict achieved |
| Keep lookup inside `POST /voters/search` | Avoid split query semantics and preserve composition with deterministic filters | ✓ Good — one voter-search contract now powers browse, filters, and ranked lookup |
| PostgreSQL-native search surface over external search infra | Lower operational risk while preserving campaign scoping and freshness | ✓ Good — `voter_search_records` supports DB-backed 10k-row lookup in about 116 ms |
| Org-scoped Twilio billing and credentials | Twilio account ownership, spend policy, and number routing belong at org scope rather than per campaign | ✓ Good — credentials, phone inventory, spend controls, and webhook auth all share one org boundary |
| Shared communication ledger before reporting UI | Persist billable call/message facts once so later reporting and targeting can reuse the same telemetry | ✓ Good — voice and SMS now reconcile into append-only communication ledger rows |
| Cached Twilio Lookup over mutating contact source data | Preserve user-entered contact labels while exposing provider-derived line-type intelligence as a reusable summary | ✓ Good — contact CRUD and SMS eligibility now share a 90-day lookup cache without rewriting source fields |
| Transactional email starts with a provider seam | Invite and auth email need immediate delivery, but provider lock-in would make later SMTP/SES/Postmark support expensive | — Pending |
| ZITADEL email stays configure-and-document in-product scope | Auth email originates in ZITADEL, so this milestone should unblock delivery and operations without rebuilding auth templating in CivicPulse | — Pending |

---
## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 — v1.17 Easy Volunteer Invites milestone started*
