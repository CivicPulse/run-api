# Requirements: CivicPulse Run API

**Active milestone:** v1.12 Hardening & Remediation
**Defined:** 2026-04-04
**Synced to:** `.planning/milestones/v1.12-REQUIREMENTS.md` (pending milestone completion)
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Source:** `.planning/CODEBASE-REVIEW-2026-04-04.md` — comprehensive 8-agent codebase review identifying 76 findings.

This file is the canonical active requirements entrypoint for GSD workflows.
Archived milestone requirements remain in `.planning/milestones/`.

## v1.12 Requirements

Each requirement maps to a finding in the 2026-04-04 review. Finding IDs (e.g. C1, H6, M14) are listed for traceability.

### Security & Tenant Isolation

- [x] **SEC-01**: `list_campaigns` returns only campaigns the requesting user has membership in or shared org with (C1)
- [x] **SEC-02**: All `VoterListService` methods scope queries by both `list_id` and `campaign_id`, blocking cross-campaign read/update/delete (C2)
- [x] **SEC-03**: All `ImportJob` routes validate the job belongs to the path's `campaign_id` before any action (C3)
- [x] **SEC-04**: `revoke_invite` service validates invite belongs to the path's `campaign_id` before revoking (C4)
- [x] **SEC-05**: `campaigns`, `campaign_members`, and `users` tables have `FORCE ROW LEVEL SECURITY` enabled (C5)
- [x] **SEC-06**: `organizations` and `organization_members` tables have `ENABLE` + `FORCE ROW LEVEL SECURITY` with scoping policies (C6)
- [x] **SEC-07**: Root route guard redirects unauthenticated users to `/login` instead of rendering protected children in the public shell (C7)
- [x] **SEC-08**: OIDC callback surfaces identity-provider error responses (`error`, `error_description`) to the user instead of silently redirecting (C8)
- [x] **SEC-09**: `/campaigns/new` is gated by `RequireOrgRole minimum="org_admin"` (H23)
- [x] **SEC-10**: Settings routes (general/members/danger) enforce role guards before rendering (H24)
- [x] **SEC-11**: DNC list page is gated to `manager` role and above (H25)
- [x] **SEC-12**: Active calling page enforces check-in server-side, not only via local state (H26)
- [x] **SEC-13**: `voter_tags.add_tag` and `surveys` script/question routes validate sub-resources belong to the path `campaign_id` (H4, H5)

### Data Integrity & Concurrency

- [x] **DATA-01**: Shift signup is race-free under concurrency: two concurrent signups at capacity never both succeed (C9)
- [x] **DATA-02**: DNC bulk import handles concurrent imports without raising IntegrityError to the client (C10)
- [x] **DATA-03**: `accept_invite` rolls back ZITADEL project-role grant if DB commit fails, leaving no orphaned grants (C11)
- [x] **DATA-04**: `voter_interactions` has composite indexes on `(campaign_id, voter_id)` and `(campaign_id, created_at)` (C12)
- [x] **DATA-05**: Invite uniqueness on `(email, campaign_id)` only applies to pending invites (not-yet-accepted and not-revoked) (C13)
- [x] **DATA-06**: `VoterEmail` has a unique constraint on `(campaign_id, voter_id, value)` matching peer `VoterPhone` (H18)
- [x] **DATA-07**: `VolunteerTag` has a unique constraint on `(campaign_id, name)` matching peer `VoterTag` (H19)
- [x] **DATA-08**: `transfer_ownership` is atomic: ZITADEL role swap and DB member-role updates either all succeed or all roll back (H3)

### Reliability & Infrastructure

- [x] **REL-01**: `useSyncEngine` releases its `isSyncing` lock on any exception path (try/finally) (C14)
- [x] **REL-02**: Offline queue items failing beyond MAX_RETRY are removed with user feedback; transient errors use `continue` not `break` (C15)
- [x] **REL-03**: `callingStore` does not persist voter PII to sessionStorage (partialize or sanitize-on-rehydrate) (C16)
- [x] **REL-04**: `ZitadelService` HTTP clients have explicit 10s timeouts on all calls (H6)
- [x] **REL-05**: Database engine configures `pool_timeout` and per-statement `statement_timeout` (H14)
- [ ] **REL-06**: Duplicate `Settings` fields (`trusted_proxy_cidrs`, `rate_limit_unauthenticated`) are removed from `app/core/config.py` (H11)
- [ ] **REL-07**: Request-logging middleware resolves client IP only via trusted-proxy CIDR check (H16)
- [x] **REL-08**: `useFieldOps` hooks share query keys with dedicated hook files so mutations invalidate all consumers (H29)
- [ ] **REL-09**: DNC CSV upload enforces a maximum file size before reading (H1)
- [ ] **REL-10**: Import filename is sanitized before being used in S3 object keys (H2)
- [ ] **REL-11**: Rate limiting default in docker-compose is `DISABLE_RATE_LIMIT=false` (H12)

### Quality, Accessibility & Test Coverage

- [ ] **QUAL-01**: Leaflet marker icons are self-hosted instead of fetched from unpkg CDN (H31)
- [ ] **QUAL-02**: `DoorKnockDialog`, `WalkListGenerateDialog`, and `InlineSurvey` radio items have explicit `htmlFor`/`id` label associations (H32, H33)
- [ ] **QUAL-03**: `authStore` has unit tests covering token storage, OIDC events, `switchOrg`, and logout paths
- [ ] **QUAL-04**: `api/client.ts` has unit tests covering auth header injection and 401/403 handling
- [ ] **QUAL-05**: `useOrgPermissions` has unit tests covering the permission gates used by the root layout
- [ ] **QUAL-06**: OIDC callback has tests for error response, null-user, no-campaigns, campaigns API failure, and non-volunteer user paths
- [ ] **QUAL-07**: `authStore.logout()` calls `removeUser()` + store reset before `signoutRedirect()` so cleanup is not dead code (H27)
- [ ] **QUAL-08**: `useOrgCampaigns` error handling narrows to `PermissionError` and 404 instead of swallowing all errors (H28)

## v2 Requirements

### Expanded Remediation (MEDIUM items deferred)

- **V2-01**: Pagination limits on `list_campaigns`, `list_volunteers`, `list_members`, `list_enriched_entries` (M2)
- **V2-02**: `call_list.claim_entries` atomic stale-release for fair distribution (M6)
- **V2-03**: `WalkList.total_entries`/`visited_entries` counter sync via trigger (M8)
- **V2-04**: DataTable clickable rows keyboard-navigable (M22)
- **V2-05**: Route-level `<title>` management for WCAG 2.4.2 (M13)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Refactor of logging middleware architecture | Targeted IP-spoofing fix is sufficient; full rewrite is a separate initiative |
| Rewrite of offline sync engine | Targeted lock + retry fixes address the review findings; full rewrite deferred |
| Full RLS audit of every table | v1.12 targets the specific tables identified in C5/C6; remaining tables reviewed next milestone |
| New integration test harness | Unit tests address coverage gaps; integration tests deferred to v2 |
| Additional L1/L2 review-style audits | The 2026-04-04 review is the spec; no additional discovery needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 71 | Complete |
| SEC-02 | Phase 71 | Complete |
| SEC-03 | Phase 71 | Complete |
| SEC-04 | Phase 71 | Complete |
| SEC-13 | Phase 71 | Complete |
| SEC-05 | Phase 72 | In Progress |
| SEC-06 | Phase 72 | In Progress |
| SEC-07 | Phase 73 | Complete |
| SEC-08 | Phase 73 | Complete |
| SEC-09 | Phase 73 | Complete |
| SEC-10 | Phase 73 | Complete |
| SEC-11 | Phase 73 | Complete |
| SEC-12 | Phase 73 | Complete |
| DATA-01 | Phase 74 | Complete |
| DATA-02 | Phase 74 | Complete |
| DATA-03 | Phase 74 | Complete |
| DATA-04 | Phase 74 | Complete |
| DATA-05 | Phase 74 | Complete |
| DATA-06 | Phase 74 | Complete |
| DATA-07 | Phase 74 | Complete |
| DATA-08 | Phase 74 | Complete |
| REL-01 | Phase 75 | Complete |
| REL-02 | Phase 75 | Complete |
| REL-03 | Phase 75 | Complete |
| REL-08 | Phase 75 | Complete |
| REL-04 | Phase 76 | Complete |
| REL-05 | Phase 76 | Complete |
| REL-06 | Phase 76 | Pending |
| REL-07 | Phase 76 | Pending |
| REL-09 | Phase 76 | Pending |
| REL-10 | Phase 76 | Pending |
| REL-11 | Phase 76 | Pending |
| QUAL-01 | Phase 77 | Pending |
| QUAL-02 | Phase 77 | Pending |
| QUAL-03 | Phase 77 | Pending |
| QUAL-04 | Phase 77 | Pending |
| QUAL-05 | Phase 77 | Pending |
| QUAL-06 | Phase 77 | Pending |
| QUAL-07 | Phase 77 | Pending |
| QUAL-08 | Phase 77 | Pending |

---
*Active requirements file for GSD workflows*
