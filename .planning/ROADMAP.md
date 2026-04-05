# Roadmap: CivicPulse Run API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- ✅ **v1.3 Voter Model & Import Enhancement** — Phases 23-29 (shipped 2026-03-15)
- ✅ **v1.4 Volunteer Field Mode** — Phases 30-38 (shipped 2026-03-17)
- ✅ **v1.5 Go Live — Production Readiness** — Phases 39-48 (shipped 2026-03-25)
- ✅ **v1.6 Imports** — Phases 49-55 (shipped 2026-03-29)
- ✅ **v1.10 Import Recovery** — Phases 56-58 (shipped 2026-04-01)
- ✅ **v1.11 Faster Imports** — Phases 59-70 (shipped 2026-04-04)
- 🚧 **v1.12 Hardening & Remediation** — Phases 71-77 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) — completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) — completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) — completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) — completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 Local Dev & Deployment Readiness (Phases 8-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 8: Containerization (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Local Dev Environment (2/2 plans) — completed 2026-03-10
- [x] Phase 10: CI/CD Pipeline (1/1 plan) — completed 2026-03-10
- [x] Phase 11: Kubernetes & GitOps (2/2 plans) — completed 2026-03-10

See: `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Full UI (Phases 12-22) — SHIPPED 2026-03-13</summary>

See: `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Voter Model & Import Enhancement (Phases 23-29) — SHIPPED 2026-03-15</summary>

See: `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.4 Volunteer Field Mode (Phases 30-38) — SHIPPED 2026-03-17</summary>

See: `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.5 Go Live — Production Readiness (Phases 39-48) — SHIPPED 2026-03-25</summary>

See: `.planning/milestones/v1.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.6 Imports (Phases 49-55) — SHIPPED 2026-03-29</summary>

See: `.planning/milestones/v1.6-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.10 Import Recovery (Phases 56-58) — SHIPPED 2026-04-01</summary>

- [x] Phase 56: Schema & Orphan Detection (1/1 plan) — completed 2026-04-01
- [x] Phase 57: Recovery Engine & Completion Hardening (1/1 plan) — completed 2026-04-01
- [x] Phase 58: Test Coverage (1/1 plan) — completed 2026-04-01

See: `.planning/milestones/v1.10-ROADMAP.md` for archived phase details.

</details>

<details>
<summary>✅ v1.11 Faster Imports (Phases 59-70) — SHIPPED 2026-04-04</summary>

- [x] Phase 59: Chunk Schema & Configuration — completed 2026-04-03
- [x] Phase 60: Parent Split & Parallel Processing — completed 2026-04-03
- [x] Phase 61: Completion Aggregation & Error Merging — completed 2026-04-03
- [x] Phase 62: Resilience & Cancellation — completed 2026-04-03
- [x] Phase 63: Secondary Work Offloading — completed 2026-04-03
- [x] Phase 64: Frontend Throughput & Status UI — completed 2026-04-03
- [x] Phase 65: Chunk Planning & Concurrency Cap Closure — completed 2026-04-03
- [x] Phase 66: Import Wizard Flow Recovery & Progress Accuracy — completed 2026-04-03
- [x] Phase 67: Chunk Import Cleanup & Deletion Semantics — completed 2026-04-03
- [x] Phase 68: Progress Metric Accuracy & Validation Closeout — completed 2026-04-03
- [x] Phase 69: Queued Cancellation Finalization Closure — completed 2026-04-04
- [x] Phase 70: Reopened Import Restore Flow Closure — completed 2026-04-04

See: `.planning/milestones/v1.11-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.12 Hardening & Remediation (Phases 71-77) — ACTIVE

**Milestone Goal:** Close the 76 findings from the 2026-04-04 comprehensive codebase review — eliminate multi-tenant data leaks, race conditions, and reliability gaps before expanding scope.

- [x] **Phase 71: Tenant Isolation — Service & Route Scoping** - Fix IDOR vulnerabilities by scoping service queries and sub-resource validation to `campaign_id` (completed 2026-04-04)
- [ ] **Phase 72: Row-Level Security Hardening** - Add FORCE RLS to core tables and enable RLS on organization tables
- [x] **Phase 73: Frontend Auth Guards & OIDC Error Surfacing** - Fix route guard logic, OIDC callback errors, and role gates on sensitive pages (completed 2026-04-05)
- [x] **Phase 74: Data Integrity & Concurrency** - Close race conditions, TOCTOUs, compensating-transaction gaps, missing indexes and unique constraints (completed 2026-04-05)
- [x] **Phase 75: Reliability — Frontend State & PII Hygiene** - Fix sync-engine lock/retry, scrub callingStore PII, unify query keys (completed 2026-04-05)
- [x] **Phase 76: Reliability — Backend Infrastructure** - Add HTTP/DB timeouts, remove duplicate Settings fields, fix IP spoofing, enforce upload limits, sanitize filenames, rate-limit defaults (completed 2026-04-05)
- [ ] **Phase 77: Quality, Accessibility & Test Coverage** - Self-host Leaflet assets, a11y label gaps, unit-test backfill for auth/api/org-permissions, logout cleanup, error-narrowing

## Active Phase Details

### Phase 71: Tenant Isolation — Service & Route Scoping
**Goal**: Every service query and sub-resource route scopes by `campaign_id` so no user can read, mutate, or delete data belonging to another campaign.
**Depends on**: Nothing (first phase of v1.12)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-13
**Success Criteria** (what must be TRUE):
  1. `list_campaigns` returns only campaigns the requesting user has membership in or shares an org with
  2. All `VoterListService` read/update/delete/add-members/remove-members operations refuse access to a list whose `campaign_id` does not match the path's `campaign_id`
  3. All `ImportJob` routes (detect, confirm-mapping, cancel, status) return 404 when the job's `campaign_id` does not match the path's `campaign_id`
  4. `revoke_invite`, `voter_tags.add_tag`, and surveys script/question routes reject sub-resources belonging to a different campaign
  5. Automated tests prove cross-campaign access attempts return 404 (not 200) on every affected endpoint
**Plans**: 3 plans
- [x] 71-01-PLAN.md — Wave 0: test infrastructure (two_campaigns_with_resources fixture + test_tenant_isolation.py)
- [x] 71-02-PLAN.md — Campaign/VoterList/Import service scoping (SEC-01, SEC-02, SEC-03)
- [x] 71-03-PLAN.md — Invite/Tag/Survey scoping (SEC-04, SEC-13)

### Phase 72: Row-Level Security Hardening
**Goal**: Core and organization tables enforce RLS at the database layer even against owner/superuser roles.
**Depends on**: Phase 71
**Requirements**: SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. `campaigns`, `campaign_members`, and `users` tables have `FORCE ROW LEVEL SECURITY` set
  2. `organizations` and `organization_members` tables have `ENABLE` + `FORCE ROW LEVEL SECURITY` with scoping policies that restrict reads/writes by org membership
  3. A migration encodes all RLS changes and runs cleanly forward and backward
  4. Integration tests prove cross-org reads of organizations and memberships return no rows
**Plans**: 4 plans
- [x] 74-01-PLAN.md — Migration 027 + model __table_args__ + integration test scaffold (Wave 1)
- [x] 74-02-PLAN.md — C9 shift signup SELECT FOR UPDATE + C10 DNC ON CONFLICT (Wave 2)
- [x] 74-03-PLAN.md — C11 accept_invite + transfer_ownership compensating tx (Wave 2, parallel with 02)
- [x] 74-04-PLAN.md — Unit test repairs + phase summary (Wave 3)

### Phase 73: Frontend Auth Guards & OIDC Error Surfacing
**Goal**: Unauthenticated users cannot reach protected content, sensitive routes enforce role gates, and OIDC errors surface to users instead of silently redirecting.
**Depends on**: Nothing (frontend-independent of 71/72)
**Requirements**: SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, SEC-12
**Success Criteria** (what must be TRUE):
  1. Unauthenticated users hitting a non-public route are redirected to `/login` instead of rendering the protected child in the public shell
  2. The OIDC callback displays identity-provider errors (`error`, `error_description`) to the user rather than silently redirecting
  3. `/campaigns/new`, settings routes (general/members/danger), and the DNC list page enforce `RequireOrgRole`/`RequireRole` before rendering
  4. The active calling page enforces check-in server-side so direct URL navigation cannot bypass the local state guard
  5. Automated coverage proves route guards reject unauthorized users on each gated page
**Plans**: 6 plans
  - [x] 73-01-PLAN.md — Wave 0 E2E test scaffolds (auth-guard-redirect, oidc-error, call-page-checkin + rbac assertions)
  - [x] 73-02-PLAN.md — Backend GET callers/me check-in status endpoint
  - [x] 73-03-PLAN.md — C7 root auth guard fix + login redirect param + same-origin safety
  - [x] 73-04-PLAN.md — C8 OIDC callback error state (Alert + Back to login CTA)
  - [x] 73-05-PLAN.md — H23-H25 role gates on 5 routes + isLoading safety fix
  - [x] 73-06-PLAN.md — H26 call page server-side check-in enforcement
**UI hint**: yes

### Phase 74: Data Integrity & Concurrency
**Goal**: Concurrent writes cannot corrupt shift capacity, DNC uniqueness, invite state, or campaign ownership; key tables have the indexes and constraints they need.
**Depends on**: Phase 71
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08
**Success Criteria** (what must be TRUE):
  1. Two concurrent shift signups at capacity never both succeed; the second is waitlisted or rejected
  2. DNC bulk imports with overlapping rows complete without surfacing `IntegrityError` to the client
  3. `accept_invite` and `transfer_ownership` roll back ZITADEL grant changes if the DB commit fails, leaving no orphaned grants
  4. `voter_interactions` has composite indexes on `(campaign_id, voter_id)` and `(campaign_id, created_at)`; the same email/invite can be re-invited to a campaign once the previous invite is accepted or revoked
  5. `VoterEmail` has a unique `(campaign_id, voter_id, value)` constraint and `VolunteerTag` has a unique `(campaign_id, name)` constraint matching their peer models
**Plans**: 4 plans
- [x] 74-01-PLAN.md — Migration 027 + model __table_args__ + integration test scaffold (Wave 1)
- [x] 74-02-PLAN.md — C9 shift signup SELECT FOR UPDATE + C10 DNC ON CONFLICT (Wave 2)
- [x] 74-03-PLAN.md — C11 accept_invite + transfer_ownership compensating tx (Wave 2, parallel with 02)
- [x] 74-04-PLAN.md — Unit test repairs + phase summary (Wave 3)

### Phase 75: Reliability — Frontend State & PII Hygiene
**Goal**: Offline sync never deadlocks, failing items exit the queue, voter PII does not leak to sessionStorage, and mutations invalidate all hook consumers.
**Depends on**: Nothing
**Requirements**: REL-01, REL-02, REL-03, REL-08
**Success Criteria** (what must be TRUE):
  1. `useSyncEngine` releases its `isSyncing` lock on every exception path (verified via try/finally and tests)
  2. Offline queue items exceeding MAX_RETRY are removed with a user-visible toast; transient errors no longer halt the queue
  3. `callingStore` never persists voter PII to sessionStorage (either partialized or sanitized on rehydrate, matching `canvassingStore`)
  4. `useFieldOps` hooks share query keys with their dedicated hook files so mutations invalidate all consumers
**Plans**: 4 plans
- [x] 75-01-PLAN.md — Failing Vitest test stubs for C14/C15/C16/H29 (Wave 0)
- [x] 75-02-PLAN.md — Sync engine try/finally lock + continue + MAX_RETRY removal+toast (Wave 1)
- [x] 75-03-PLAN.md — callingStore PII sanitizer (partialize + rehydrate merge) (Wave 1)
- [x] 75-04-PLAN.md — useFieldOps query key alignment with dedicated hook files (Wave 2)

### Phase 76: Reliability — Backend Infrastructure
**Goal**: HTTP clients, DB connections, rate limits, uploads, and log IP resolution have the defaults and safeguards needed for production.
**Depends on**: Nothing
**Requirements**: REL-04, REL-05, REL-06, REL-07, REL-09, REL-10, REL-11
**Success Criteria** (what must be TRUE):
  1. `ZitadelService` HTTP clients have explicit 10s timeouts on all calls
  2. The database engine configures `pool_timeout` and a per-statement `statement_timeout`
  3. Duplicate `Settings` fields (`trusted_proxy_cidrs`, `rate_limit_unauthenticated`) are removed and the docker-compose default is `DISABLE_RATE_LIMIT=false`
  4. Request-logging middleware only resolves client IP via the trusted-proxy CIDR check
  5. DNC CSV uploads enforce a max file size before reading, and import filenames are sanitized before use in S3 object keys
**Plans**: 5 plans
- [x] 76-01-PLAN.md — Wave 0 failing test stubs for all 7 REL fixes (Wave 0)
- [x] 76-02-PLAN.md — Config hygiene: Settings dedup + docker-compose rate-limit default + alembic.ini interpolation (Wave 1)
- [x] 76-03-PLAN.md — Timeouts: ZitadelService 10s + DB engine pool/statement timeouts (Wave 1)
- [x] 76-04-PLAN.md — Upload safety: DNC 10MB cap + import filename sanitization (Wave 1)
- [x] 76-05-PLAN.md — Request-logging trusted-proxy IP check (Wave 2)

### Phase 77: Quality, Accessibility & Test Coverage
**Goal**: Field users get self-hosted assets, screen readers get proper labels, auth/logout paths are correct, and critical auth/data hooks have unit test coverage.
**Depends on**: Phase 73, Phase 75
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, QUAL-08
**Success Criteria** (what must be TRUE):
  1. Leaflet marker icons are self-hosted instead of fetched from the unpkg CDN
  2. `DoorKnockDialog`, `WalkListGenerateDialog`, and `InlineSurvey` radio items have explicit `htmlFor`/`id` label associations
  3. Unit tests cover `authStore` (token storage, OIDC events, `switchOrg`, logout), `api/client.ts` (auth header, 401/403), `useOrgPermissions`, and OIDC callback error/null-user/no-campaigns paths
  4. `authStore.logout()` calls `removeUser()` and resets the store before `signoutRedirect()` so cleanup always runs
  5. `useOrgCampaigns` narrows its catch to `PermissionError` and 404 instead of swallowing all errors
**Plans**: 5 plans
- [x] 77-01-PLAN.md — Leaflet self-host + 3-dialog a11y label fixes (Wave 1)
- [x] 77-02-PLAN.md — authStore.logout() reorder + authStore unit tests (Wave 1)
- [x] 77-03-PLAN.md — useOrgCampaigns catch narrowing + useOrg tests (Wave 1)
- [ ] 77-04-PLAN.md — api/client.ts unit tests (Wave 2)
- [ ] 77-05-PLAN.md — useOrgPermissions tests + callback.tsx error/null-user/no-campaigns tests (Wave 2)
**UI hint**: yes

### Backlog / Parking Lot

- [ ] Phase 999.1: Update Zitadel to v3 or v4 — parked backlog item, not part of the active milestone sequence

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 20/20 | Complete | 2026-03-10 |
| 8-11 | v1.1 | 7/7 | Complete | 2026-03-10 |
| 12-22 | v1.2 | 43/43 | Complete | 2026-03-13 |
| 23-29 | v1.3 | 18/18 | Complete | 2026-03-15 |
| 30-38 | v1.4 | 26/26 | Complete | 2026-03-17 |
| 39-48 | v1.5 | 36/36 | Complete | 2026-03-25 |
| 49-55 | v1.6 | 16/16 | Complete | 2026-03-29 |
| 56-58 | v1.10 | 3/3 | Complete | 2026-04-01 |
| 59-70 | v1.11 | 31/31 | Complete | 2026-04-04 |
| 71 | v1.12 | 3/3 | Complete   | 2026-04-04 |
| 72 | v1.12 | 2/3 | In Progress|  |
| 73 | v1.12 | 6/6 | Complete   | 2026-04-05 |
| 74 | v1.12 | 4/4 | Complete   | 2026-04-05 |
| 75 | v1.12 | 4/4 | Complete   | 2026-04-05 |
| 76 | v1.12 | 5/5 | Complete   | 2026-04-05 |
| 77 | v1.12 | 3/5 | In Progress|  |
