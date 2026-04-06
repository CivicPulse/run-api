# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CivicPulse Run API MVP

**Shipped:** 2026-03-10
**Phases:** 7 | **Plans:** 20

### What Was Built
- Full campaign management API with ZITADEL OIDC auth, RLS multi-tenancy, and role-based access control
- Voter CRM with CSV import pipeline (RapidFuzz field mapping), composable search/filter, tags, lists, and interaction history
- PostGIS canvassing operations: turf cutting, household-clustered walk lists, door-knock tracking, reusable survey engine
- Phone banking: call lists with DNC filtering, claim-on-fetch, call recording with survey reuse, auto-DNC
- Volunteer management: shift scheduling, waitlists, cross-domain check-in, hours tracking
- Operational dashboards with aggregation endpoints and cursor-paginated drilldowns
- Integration wiring fixes: ZitadelService lifespan init, Alembic model discovery

### What Worked
- Phase-by-phase execution with verifier agents kept quality high — all 7 phases passed verification
- Reusable survey engine pattern (Phase 3 → Phase 4) avoided code duplication
- Composition pattern for services (VoterInteractionService, SurveyService, DNCService) kept coupling clean
- native_enum=False convention avoided future migration pain
- Wave 0 test stubs (Phase 3) established test-first scaffolding pattern
- Milestone audit caught two real integration gaps (INT-01, INT-02) that Phase 7 fixed before shipping

### What Was Inefficient
- ROADMAP.md plan checkboxes not updated during execution (Phases 1-2 show `[ ]` despite being complete)
- Integration tests written but never executed against live infrastructure — 18 tech debt items accumulated
- Phase 2 progress table showed "3/4 In Progress" despite being complete
- Nyquist validation enabled but never run for any phase (all 7 in draft status)

### Patterns Established
- Services compose other services via constructor injection (no inheritance)
- RLS subquery pattern for child tables without direct campaign_id FK
- Late imports at call site for cross-phase model references
- StrEnum columns with native_enum=False for extensibility
- Cursor pagination via UUID comparison (not offset-based)
- Interaction events as shared data backbone across domains

### Key Lessons
1. Run milestone audit before declaring done — it caught real runtime wiring gaps
2. Integration tests need to run against live infrastructure at some point; deferring all of them accumulates significant tech debt
3. The survey engine reuse pattern proved the value of designing Phase 3 models without canvassing-specific FKs

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: 2 days from initial commit to milestone completion
- Notable: 56K LOC across 20 plans with high consistency in patterns

---

## Milestone: v1.1 — Local Dev & Deployment Readiness

**Shipped:** 2026-03-10
**Phases:** 4 | **Plans:** 7

### What Was Built
- Three-stage Docker build (node/uv/python-slim) producing 485MB production image with health probes
- Docker Compose full-stack dev environment with auto-migrations, MinIO bootstrap, Vite hot-reload proxy
- Idempotent seed data script with Macon-Bibb County demo data (50 voters, campaigns, turfs, interactions)
- GitHub Actions CI/CD: PR validation gates + GHCR publish with SHA/latest tags and K8s manifest auto-update
- Kubernetes manifests: Deployment with init container migrations, ClusterIP Service, ConfigMap, Secret template
- Traefik IngressRoute and ArgoCD Application for zero-touch GitOps deployment

### What Worked
- Milestone audit caught zero gaps — clean pass on all 15 requirements, 12 integration points, 3 E2E flows
- Cross-phase consistency: same Alembic pattern used in dev-entrypoint (P9) and K8s init container (P11)
- CI infinite-loop prevention designed correctly on first attempt (GITHUB_TOKEN commits don't re-trigger)
- Phase dependencies cleanly layered: P8 → P9 (compose), P8 → P10 (CI), P10 → P11 (K8s)

### What Was Inefficient
- ROADMAP.md Phase 11 plan checkboxes not updated (show `[ ]` despite being complete)
- ROADMAP.md Phase 11 progress table row had malformed columns
- Nyquist validation still not run — phases 9, 10 missing VALIDATION.md entirely
- Summary files lack `one_liner` field, requiring manual extraction during milestone completion

### Patterns Established
- Three-stage Docker build pattern: node frontend → uv Python deps → python-slim runtime
- Dev entrypoint pattern: wait-for-it + alembic upgrade + boto3 bucket init
- CI separation: PR workflow for quality gates, publish workflow for image delivery
- K8s manifest pattern: init container for migrations, envFrom for config/secrets, .yaml.example for templates

### Key Lessons
1. Summary files should include a `one_liner` field for automated extraction during milestone completion
2. ROADMAP.md checkbox and progress table updates should be part of plan completion workflow
3. Infrastructure-as-code phases execute cleanly because they have minimal runtime dependencies to test

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: Same day as v1.0 completion — fast iteration on infra phases
- Notable: 1,512 lines of Docker/CI/K8s config across 7 plans with zero test failures

---

## Milestone: v1.2 — Full UI

**Shipped:** 2026-03-13
**Phases:** 11 | **Plans:** 43

### What Was Built
- Shared UI infrastructure: RequireRole permission gating, useFormGuard navigation protection, reusable DataTable with server-side operations
- Complete voter CRM UI: contacts (phone/email/address), tags, static/dynamic lists, 19-dimension advanced search, interaction notes
- Multi-step CSV import wizard with auto-detected column mapping, preview, progress tracking, and import history
- Campaign settings (edit, delete, ownership transfer) and member management (invite, role change, remove)
- Full phone banking workflow: session management, member picker for caller assignment, active calling screen with claim/record/skip, progress dashboards
- Call list & DNC management: CRUD with DNC filtering, entry status tracking, bulk DNC import with reason column
- Volunteer management: filterable roster, dual-mode self-registration, availability slots, campaign tags, hours tracking
- Shift management: scheduling with date-grouped cards, volunteer signup/assignment, check-in/out, roster view, hours adjustment
- Integration polish: member name resolution across all views, RequireRole gates on all mutation paths

### What Worked
- Shared infrastructure (Phase 12) paid off enormously — RequireRole, DataTable, and useFormGuard used in every subsequent phase
- Milestone audit process caught real integration gaps: INT-01 (claimed_by UUID display), INT-02 (DNC RequireRole gates), PHON-03 (raw UUID in caller picker) — all fixed before shipping
- Nyquist validation enforced from the start — all 11 phases compliant with wave_0_complete
- Pattern consistency: every phase followed the same structure (types → hooks → pages → tests → verification)
- SUMMARY.md files with frontmatter enabled automated milestone completion tooling
- Gap closure phases (19-22) ensured 66/66 requirements verified with 3-source cross-reference

### What Was Inefficient
- Some ROADMAP.md progress table rows had malformed columns (Phase 17, 19, 21, 22)
- 7 SUMMARY frontmatter files missing requirements_completed entries (CAMP-03..07, PHON-09, PHON-10) — documentation completeness gaps
- REQUIREMENTS.md "60 total" label incorrect (should be 66) — off-by-6 from audit-inserted phases
- Orphaned top-level components (ConfirmDialog.tsx, EmptyState.tsx) not cleaned up after shared/ versions created
- Phase 16 inline useQuery for survey script not extracted to dedicated hook — accumulated as tech debt

### Patterns Established
- Popover+Command combobox pattern for searchable pickers (member picker, volunteer assignment)
- it.todo wave 0 test stubs: keep suite green while scaffolding, implement later
- XHR for presigned URL uploads (ky interceptors break MinIO auth)
- Sheet-based dialogs for long forms (VolunteerEditSheet, ShiftDialog) vs Dialog for short ones
- Client-side search with digit stripping for small datasets (DNC phone numbers)
- Backend enrichment pattern: add computed fields (caller_count, call_list_name, claimed_by name) at endpoint layer, not service layer
- VERIFICATION.md as formal evidence document with 3-source cross-reference (code, tests, REQUIREMENTS.md)

### Key Lessons
1. Build shared infrastructure first — the 3-plan Phase 12 investment saved hundreds of lines of duplication across 10 subsequent phases
2. Milestone audit is essential — even after 43 plans, the audit found real integration gaps that needed dedicated fix phases
3. Nyquist wave 0 compliance is worth enforcing — it ensures every requirement has at least one test, catching gaps early
4. Gap closure phases (19-22) are normal and expected — they're a sign of honest verification, not planning failure
5. Backend enrichment at endpoint layer (not service layer) keeps services returning clean models while views get display-ready data

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 4 days from Phase 12 start to milestone completion
- Notable: 61K lines of frontend code across 43 plans; 252 tests passing with zero TypeScript errors

---

## Milestone: v1.3 — Voter Model & Import Enhancement

**Shipped:** 2026-03-15
**Phases:** 7 | **Plans:** 18

### What Was Built
- Expanded voter model with 22 new first-class columns via Alembic migration 006 (propensity scores, mailing address, demographics, household, military)
- Enhanced import pipeline: auto-VoterPhone creation via RETURNING clause, voting history parsing, propensity percentage parsing, fixed SET clause bug
- 15 new composable filter conditions with backward-compatible voting history year expansion
- Complete frontend overhaul: voter detail page (7 cards), accordion filter builder (sliders, dynamic checkboxes), expanded edit sheet (27 fields), grouped column mapping
- POST /voters/search with Literal-typed sort_by, dynamic cursor pagination, and Playwright E2E tests
- 23-dimension filter chip system with category colors, plus ImportJob type alignment and integration polish (Phase 29)

### What Worked
- Milestone audit process caught 3 real integration gaps (INT-01/02/03) that Phase 29 fixed before shipping — audit-driven gap closure is now a proven pattern across all 4 milestones
- Phase 23's single migration approach (renames + 22 new columns in one file) was clean and avoided multi-migration coordination
- func.lower() pattern for case-insensitive filters applied consistently across registration and mailing address fields
- RETURNING clause for voter-to-phone linking was a single-round-trip solution per batch
- Nyquist validation enforced from the start — all 7 phases compliant with wave_0_complete

### What Was Inefficient
- Summary files still lack `one_liner` field — automated extraction returns null, requiring manual reading during milestone completion
- ROADMAP.md plan checkboxes still show `[ ]` after execution (Phases 23-29) — same issue from v1.0/v1.1
- Phase 29 row in ROADMAP.md progress table had malformed columns (missing milestone column) — recurring formatting issue
- Milestone audit file status remained `tech_debt` even after Phase 29 closed all integration gaps — no re-audit step in workflow

### Patterns Established
- POST body for complex search (replaces GET query params when filter count exceeds URL comfort)
- Literal-typed sort columns for compile-time validation without runtime overhead
- filterChipUtils shared utility pattern for centralized chip formatting across multiple pages
- Year-only voting history expansion via PostgreSQL overlap operator for backward compatibility
- SET clause derived from model columns (Voter.__table__.columns) instead of first batch row keys

### Key Lessons
1. Audit-driven gap closure phases are standard practice — every milestone since v1.0 has needed at least one
2. POST /voters/search was the right call once filter count exceeded 19 dimensions — GET query params don't scale
3. Single-migration approach for column expansion is preferable when all columns are nullable and related
4. Summary files need a `one_liner` field — this has been a pain point for 4 consecutive milestones

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 3 days from Phase 23 start to milestone completion
- Notable: 18 plans across 7 phases in 3 days; 6,771 lines added across 45 files

---

## Milestone: v1.4 — Volunteer Field Mode

**Shipped:** 2026-03-17
**Phases:** 9 | **Plans:** 26

### What Was Built
- Mobile-first field layout shell with zero admin chrome, assignment-aware volunteer hub with pull-to-refresh
- Linear canvassing wizard: door-by-door with household grouping, voter context cards, inline survey, auto-advance, persistent sessionStorage state, resume prompt
- Phone banking field mode: tap-to-call via tel: links, clipboard fallback, E.164 formatting, shared OutcomeGrid/InlineSurvey components, session progress
- Offline outcome queue with localStorage persistence and automatic sync engine for both canvassing and phone banking
- Guided onboarding tour via driver.js: per-segment completion (welcome/canvassing/phone banking), contextual tooltips, quick-start cards, help button replay
- WCAG AA accessibility: ARIA landmarks, screen reader labels, live regions, 44px touch targets, color contrast, milestone celebration toasts
- Google Maps navigation links with walking directions in field mode (HouseholdCard, DoorListView) and admin pages (voter detail, walk list detail)
- Integration fixes: offline sync optimistic UI consistency, hub progress updates after sync drain
- Tech debt cleanup: Playwright selector ambiguity, useCallback deps, 36 tour test stub implementations

### What Worked
- Canvassing-first phase ordering (Phase 31 before 32) produced 5 shared components (OutcomeGrid, VoterCard, InlineSurvey, FieldProgress, HouseholdCard) reused directly in phone banking
- Milestone audit caught 2 integration issues + 3 tech debt items — all resolved before archival via gap closure phases (37, 38) and quick task 260317-w3n
- driver.js choice over react-joyride validated — framework-agnostic, works with React 19, CSS-only customization
- Offline queue architecture (Zustand + localStorage with call-site onError override) handled both canvassing and phone banking with minimal code
- Playwright page.route() API mocking pattern enabled CI-compatible e2e testing without live backend across all field mode phases

### What Was Inefficient
- Summary files still lack `one_liner` field — 5th consecutive milestone with this pain point during milestone completion
- ROADMAP.md plan checkboxes still show `[ ]` after execution (phases 30-38) — same recurring issue from all prior milestones
- Phase 35 had a 4th unplanned plan (35-04) for TypeScript error cleanup — introduced complexity could have been handled in Phase 38
- Some e2e tests required complex sessionStorage/localStorage seeding for auth state — suggests a shared test utility would reduce duplication
- Phase 36 took longest (46min combined) due to admin page e2e test complexity with campaign API mocking

### Patterns Established
- Separate /field/ route tree with isFieldRoute bypass in __root.tsx for zero-admin-chrome mobile UX
- Zustand + sessionStorage for wizard state (clears on tab close, fresh start each session)
- Zustand + localStorage for offline queue (survives app close, drains on reconnect)
- Orchestrator hook pattern: returns signal objects (bulkPrompt, surveyTrigger) instead of callback nesting
- OutcomeGrid string callback type for domain-agnostic outcome recording across canvassing and phone banking
- driver.js tour with per-segment completion tracking in localStorage
- HasRegistrationAddress Pick type for reusable address-dependent component props
- Call-site onError override on .mutate() for offline-aware error handling

### Key Lessons
1. Phase ordering for maximum component reuse pays off — 5 shared field components avoided significant duplication
2. driver.js is the right tour library for React 19+ projects — react-joyride's React 18 dependency is a blocker
3. Offline queue architecture should use localStorage (not sessionStorage) for cross-session survival
4. page.route() API mocking is the Playwright pattern for CI-compatible field mode testing
5. Milestone audit + gap closure phases + quick tasks form a reliable quality pipeline: audit catches issues, gap phases fix integration bugs, quick tasks handle tech debt

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 3 days from Phase 30 start to milestone completion
- Notable: 23,659 lines added across 304 files; 117 commits; 9 phases with 26 plans

---

## Milestone: v1.5 — Go Live — Production Readiness

**Shipped:** 2026-03-25
**Phases:** 10 | **Plans:** 36

### What Was Built
- Fixed critical multi-tenancy data isolation: transaction-scoped RLS set_config, centralized get_campaign_db dependency replacing 244 inline calls, pool checkout reset, verified all 33 RLS policies
- Multi-campaign membership fix with idempotent backfill migration, deprecated get_campaign_from_token
- Production observability: Sentry error tracking with PII scrubbing, structlog ASGI request middleware with ContextVars, structured JSON telemetry
- Trusted-proxy-aware rate limiting on all 73 endpoints with CF-Connecting-IP CIDR validation and per-user JWT-based keys
- Organization management: org_owner/org_admin roles, additive role resolution, org dashboard with campaign cards, member directory with role matrix, campaign creation wizard, org switcher
- Interactive map-based turf editor: Leaflet/Geoman polygon draw/edit, GeoJSON import/export, Nominatim address search, overlap detection, satellite toggle
- UI/UX polish: sidebar slide-over, error boundaries on all routes, contextual tooltips at 4 decision points, loading skeletons, meaningful empty states across 14 list pages
- WCAG AA compliance: 4 shared a11y components, 38-route parameterized axe-core scan, 5 screen reader flow tests, keyboard navigation, skip-nav links, focus management
- Playwright E2E tests: auth setup, voter/turf/phone bank/volunteer specs, RLS isolation tests, connected journey spec, CI Docker Compose integration
- Integration consistency: RLS centralization in turf endpoints, rate limit coverage across all 22 route files with AST-based guard test

### What Worked
- Parallel phase execution (39-43 had minimal dependencies) enabled fast delivery — 10 phases in 2 days
- Milestone audit before gap closure phases identified 3 concrete issues (INT-01, INT-02, FLOW-01) that Phases 47-48 addressed precisely
- AST-based guard test for rate limit coverage ensures future endpoints can't skip rate limiting — catches issues at CI time
- Centralized get_campaign_db pattern proved its worth when audit found 2 turf endpoints still using inline set_campaign_context
- Connected E2E journey spec (Phase 48) adapted to actual UI rather than planned wizard — pragmatic testing over specification compliance

### What Was Inefficient
- Some plan checkboxes in ROADMAP.md still show `[ ]` after execution — 6th consecutive milestone with this issue
- Phase 40 plans count shows 1/2 in progress table but phase marked complete — bookkeeping inconsistency
- Phase 41 plans count shows 1/3 but all 3 plans have SUMMARY.md files — plan tracking gap
- Rate limiting Phase 47-03 took 16 minutes due to touching 18 route files — could have been parallelized with subagents
- Milestone audit remained in `tech_debt` status after gap closure — no re-audit workflow step

### Patterns Established
- Transaction-scoped RLS context via set_config(true) as mandatory pattern for connection-pooled PostgreSQL
- Pure ASGI middleware (not BaseHTTPMiddleware) for structlog to avoid streaming response issues
- ContextVars for cross-cutting request context (Sentry, logging, error responses, rate limiting)
- AST-based decorator coverage tests for infrastructure requirements (rate limiting)
- Stored auth state in Playwright for multi-spec test suites (auth.setup.ts pattern)
- Connected E2E journey specs that adapt to actual UI rather than planned wireframes

### Key Lessons
1. RLS context MUST be transaction-scoped (set_config third param = true) in connection-pooled environments — session-scoped leaks across requests
2. Centralized dependencies (get_campaign_db) are only effective if audited — 2 endpoints escaped centralization despite 244 being converted
3. AST-based guard tests are the right pattern for "every endpoint must have X" requirements — no import side effects, catches at CI time
4. Connected E2E specs should test actual UI, not planned specifications — the implementation may diverge from the plan
5. Rate limiting requires per-endpoint opt-in with SlowAPI — infrastructure exists but each route file needs decorators

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 2 days from Phase 39 start to milestone completion (2026-03-24 → 2026-03-25)
- Notable: 37,350 lines added across 348 files; 36 plans across 10 phases; 48/48 requirements satisfied

---

## Milestone: v1.6 — Imports

**Shipped:** 2026-03-29
**Phases:** 7 | **Plans:** 16

### What Was Built
- Procrastinate PostgreSQL job queue replacing TaskIQ — durable background imports with 202 Accepted, per-campaign queueing lock, standalone worker container
- Per-batch commit pipeline with RLS restoration, crash resume from last_committed_row, real-time polling progress, bounded error storage to MinIO
- Streaming CSV import from MinIO with async line-by-line iterator — constant memory regardless of file size
- Complete L2 auto-mapping: 58-field canonical dictionary with 217 aliases, 6-pattern voting history parser, format auto-detection, frontend match-type badges
- Import cancellation with cooperative batch-loop detection, CANCELLING/CANCELLED lifecycle, concurrent import prevention
- Gap closure phases fixed error report download link, type alignment, and 6 documentation debt items

### What Worked
- Milestone audit caught 2 real integration gaps (INT-01 error report download, INT-02 type mismatch) and 6 tech debt items — all resolved via gap closure phases 54-55 before archival
- Parallel phase dependencies (52 and 53 both depend on 49, not on each other) enabled efficient execution
- Per-batch RLS restore pattern (commit_and_restore_rls) solved the critical "COMMIT resets session context" issue cleanly and reusably
- Streaming architecture (async generator → batch loop → per-batch commit) composed cleanly across phases 50-51
- cancelled_at timestamp design (not status enum) provided race-safe cancellation without lost-update window
- CANONICAL_FIELDS alias dictionary approach with >80% exact ratio for L2 auto-detection proved reliable and extensible

### What Was Inefficient
- v1.6 milestone originally planned 5 phases but needed 7 (phases 54-55 for gap closure) — two gap closure phases for a 5-phase milestone is high ratio
- ROADMAP.md plan checkboxes updated correctly this milestone (improvement over v1.0-v1.5 pain point)
- Audit status `tech_debt` vs `passed` distinction caused initial confusion during milestone completion — the audit gaps were closed by subsequent phases but the audit file wasn't re-run

### Patterns Established
- Procrastinate as PostgreSQL-native job queue — no external broker needed, queueing_lock for idempotency
- commit_and_restore_rls helper for any operation needing mid-transaction commits with RLS context preservation
- Streaming async generator pattern for processing large files without memory proportional to file size
- Canonical field alias dictionary with match_type (exact/fuzzy/null) for vendor-format auto-detection
- cancelled_at timestamp as authoritative cancellation signal (not status enum) for race-safe cooperative cancellation

### Key Lessons
1. RLS context resets on COMMIT — any per-batch commit pattern must re-set campaign context after each commit (critical silent failure mode)
2. Procrastinate's AlreadyEnqueued exception is the correct signal for queueing lock conflicts (not UniqueViolation)
3. cancelled_at timestamp is safer than status-based cancellation — avoids lost-update race between API cancel and worker status finalization
4. Format auto-detection via alias match ratio (>80% exact = L2) is more reliable than header pattern matching
5. Gap closure phases at 2/5 ratio suggests the audit found genuine integration gaps, not just documentation debt

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 2 days from milestone start to completion (2026-03-28 → 2026-03-29)
- Notable: 5,214 lines added across 44 files; 16 plans across 7 phases; 14/14 requirements satisfied

---

## Milestone: v1.13 — Production Shakedown Remediation

**Shipped:** 2026-04-06
**Phases:** 6 | **Plans:** 18

### What Was Built
- Closed all 7 P0 cross-tenant isolation breaches: body FK injection, spatial join, UUID lookup, field/me gate — all fail-closed with campaign-scoped guards
- FastAPI exception handler mapping DB errors to safe 4xx responses with no stack traces, SQL, or infrastructure details
- Production security headers middleware (CSP, X-Frame-Options, X-Content-Type-Options) and HTTPS redirect
- ZITADEL grant idempotency for campaign creation, CSV import pre-scan restore, phone bank validation, survey reorder rejection
- Accessible names on all axe-reported surfaces (SelectTrigger, icon controls, routed card overlays), touch targets raised, field tour lazy-loaded
- Schema validation tightening: WGS84 bounds, null-byte rejection, future birth dates, negative call durations, oversized strings
- Full production reverification: 15 shakedown phases re-run, 0 critical axe violations across 16 pages, GO verdict achieved

### What Worked
- Shakedown-driven milestone scoping was highly effective — verified production failures are unambiguous requirements, no scope debates
- Phase sequencing (isolation → errors → workflows → a11y → validation → reverification) naturally layered fixes so later phases built on earlier ones
- Squash-merge PR (#22) for the bulk fix followed by targeted commits for the post-deployment P0 fix kept the git history clean
- Milestone audit with 3-source cross-reference (VERIFICATION.md, SUMMARY frontmatter, REQUIREMENTS.md) caught the stale REQUIREMENTS.md checkboxes
- Separating "code is correct" from "ops condition" in the audit prevented false negatives — ZITADEL connectivity and HSTS are infrastructure issues, not code gaps

### What Was Inefficient
- Phase 81 checkbox in ROADMAP.md left unchecked (`[ ]`) despite all 3 plans having SUMMARY.md files — cosmetic but confusing for tooling
- REQUIREMENTS.md traceability table showed all 23 items as "Pending" despite being satisfied — stale from never being updated during execution
- Two production deploys needed (sha-5865734 for bulk fix, sha-76920d6 for the P0 walk-list/call-list scoping fix found post-deploy)
- The 490-file diff is inflated by shakedown evidence documents (screenshots, test results) — actual code changes were much smaller

### Patterns Established
- Production shakedown as milestone driver: verified failures in deployed code set remediation scope
- Ops conditions documented separately from code gaps in audit — prevents blocking code milestones on infrastructure work
- Targeted shakedown reruns as formal verification method — re-run specific phases with evidence collection
- Product sign-off with explicit budget rebaseline for performance targets that can't meet original spec

### Key Lessons
1. Production shakedowns are the most effective way to discover cross-tenant isolation gaps — unit tests missed spatial join and transitive scoping issues that only appear with real multi-tenant data
2. Squash-merge + targeted follow-up commits is the right pattern for remediation milestones — keeps the PR reviewable while allowing post-deploy hotfixes
3. REQUIREMENTS.md checkboxes should be updated during execution, not just at archival — the stale "Pending" state confused the audit
4. Separate code correctness from ops conditions in audit verdicts — blocking a milestone on Cloudflare config or pod connectivity wastes developer time
5. Error sanitization is a cross-cutting concern — the FastAPI exception handler pattern (catching IntegrityError, DataError, etc.) should have been in place before production

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 2 days (2026-04-05 → 2026-04-06) — fastest remediation milestone
- Notable: 25 commits, 6 phases, 18 plans; shakedown verdict moved from NO-GO to GO

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 20 | Established GSD workflow with phase verification and milestone audit |
| v1.1 | 4 | 7 | Infrastructure-as-code phases; clean milestone audit (zero gaps) |
| v1.2 | 11 | 43 | Full Nyquist compliance, 3-source verification, gap closure phases as standard practice |
| v1.3 | 7 | 18 | POST body for complex search, Literal-typed sort columns, audit-driven gap closure confirmed as pattern |
| v1.4 | 9 | 26 | Mobile-first field mode, offline queue + sync, driver.js tours, WCAG AA, shared component reuse across domains |
| v1.5 | 10 | 36 | Production hardening (RLS fix, Sentry, rate limiting), org management, map editor, WCAG compliance scan, E2E test coverage |
| v1.6 | 7 | 16 | Durable background imports (Procrastinate), per-batch crash resilience, streaming CSV, L2 auto-mapping, cancellation |
| v1.10 | 3 | 3 | Import recovery with orphan detection, advisory-lock protection, crash-resume |
| v1.11 | 15 | 31 | Chunk parallelization, parent fan-out/fan-in, cancellation finalization, wizard flow recovery |
| v1.12 | 7 | 30 | Service/route tenant scoping, FORCE RLS, frontend auth guards, concurrency/integrity hardening, a11y/test backfill |
| v1.13 | 6 | 18 | Production shakedown remediation: P0 isolation fixes, error sanitization, security headers, workflow recovery, GO verdict |

### Cumulative Quality

| Milestone | Unit Tests | Integration Tests | LOC | Frontend LOC |
|-----------|------------|-------------------|-----|-------------|
| v1.0 | 236+ passing | 24+ written (not executed) | 56,653 | — |
| v1.1 | 268 passing | — | +1,512 (infra) | — |
| v1.2 | 252 passing (frontend) | 284 passing (backend) | — | 30,691 TypeScript |
| v1.3 | 252+ (frontend) | 284+ (backend) | ~34K Python + ~34K TS | +6,771 lines (45 files) |
| v1.4 | 300+ (frontend) | 284+ (backend) | ~34K Python + ~58K TS | +23,659 lines (304 files) |
| v1.5 | 300+ (frontend) | 300+ (backend) | ~22K Python + ~43K TS | +37,350 lines (348 files) |
| v1.6 | 300+ (frontend) | 350+ (backend) | ~22K Python + ~43K TS | +5,214 lines (44 files) |
| v1.10 | 300+ (frontend) | 380+ (backend) | ~22K Python + ~43K TS | — (backend only) |
| v1.11 | 300+ (frontend) | 400+ (backend) | ~22K Python + ~43K TS | +3,400 lines (24 files) |
| v1.12 | 300+ (frontend) | 450+ (backend) | ~22K Python + ~43K TS | security/a11y/test backfill |
| v1.13 | 300+ (frontend) | 470+ (backend) | ~22K Python + ~43K TS | remediation across 490 files |

### Top Lessons (Verified Across Milestones)

1. Design models and components for cross-phase reuse from the start (survey engine → phone banking; RequireRole/DataTable → all UI phases)
2. Run integration tests against live infrastructure — deferred testing is deferred risk
3. Run milestone audit before declaring done — catches real gaps in every milestone (v1.0: 2 gaps, v1.2: 4 gaps, v1.5: 3 gaps)
4. Keep ROADMAP.md checkboxes and progress table updated during execution — manual fixups during archival are wasteful
5. Build shared infrastructure early — Phase 12's 3-plan investment in RequireRole, DataTable, useFormGuard saved massive duplication across 10 subsequent phases
6. Gap closure phases are healthy — they mean the audit process works, not that planning failed
7. POST body search is the right pattern once filter dimensions exceed ~20 — GET query params don't scale
8. Summary files should include a `one_liner` field — verified as pain point across all 7 milestones
9. Phase ordering for maximum component reuse (canvassing before phone banking) avoids duplication across domains
10. Offline queue architecture: localStorage for cross-session survival, sessionStorage for per-session state
11. Transaction-scoped RLS (set_config true) is mandatory for connection-pooled PostgreSQL — session-scoped leaks
12. AST-based guard tests catch infrastructure compliance gaps (rate limiting, decorators) at CI time without import side effects
13. RLS context resets on COMMIT in PostgreSQL — any per-batch commit pattern must re-set campaign context (v1.6 critical lesson)
14. Use timestamps (cancelled_at) over status enums for cancellation signals to avoid lost-update races between concurrent actors
15. Production shakedowns are the most effective tenant isolation audit — they find cross-tenant leaks that unit tests miss (spatial joins, transitive scoping)
16. Separate code correctness from ops/infrastructure conditions in audit verdicts — don't block code milestones on Cloudflare config or pod connectivity
17. Error sanitization (exception handler mapping) should be built in from the start, not added during production remediation
