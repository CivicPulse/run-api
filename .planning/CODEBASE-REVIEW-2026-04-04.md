# CivicPulse Run — Comprehensive Codebase Review

**Date:** 2026-04-04
**Branch:** `gsd/v1.0-milestone`
**Scope:** 255 Python files, 300 TypeScript/React files
**Method:** 8 parallel specialized review agents covering API security, database/models, services/business logic, core infrastructure, frontend data layer, frontend routes, frontend components/accessibility, and auth/state/test coverage.

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 16 | Active security vulnerabilities, data integrity risks, correctness bugs |
| **HIGH** | 32 | Significant reliability, security, or UX issues |
| **MEDIUM** | 25 | Quality issues needing attention |
| **LOW** | 4 | Style/consistency issues |
| **Test Gaps** | 14 files | Zero unit test coverage on core files |

**Highest-risk findings:**
1. **Multi-tenant data isolation failures** — 4 IDOR vulnerabilities allow cross-campaign data access
2. **Row-Level Security gaps** — `FORCE RLS` missing on core tables; organizations have no RLS at all
3. **Auth guard logic error** — unauthenticated users can access protected campaign routes
4. **Sync engine permanent lock** — offline sync can stall indefinitely
5. **Race conditions** — shift signup, DNC import, and invite acceptance have exploitable races

---

## CRITICAL Issues (16)

### C1 — `list_campaigns` Returns All Campaigns (No Tenant Isolation)
**File:** `app/services/campaign.py:248` • `app/api/v1/campaigns.py:93`
**Confidence:** 88

`CampaignService.list_campaigns` queries `select(Campaign).where(Campaign.status != DELETED)` with no org/membership filter. The route never passes `user.org_id`. Any authenticated viewer receives every non-deleted campaign across all tenants.

**Fix:** Filter to campaigns where user has a `CampaignMember` row, or where `Campaign.organization_id` matches user's org.

---

### C2 — `VoterListService` Has No Campaign Scoping
**Files:** `app/services/voter_list.py:70,96,119` • `app/api/v1/voter_lists.py:90,115,139,167,191,216`
**Confidence:** 97

`get_list`, `update_list`, `delete_list`, `add_members`, `remove_members` all query `VoterList` by `list_id` alone — no `campaign_id` predicate. `list_lists` performs a cross-tenant scan. A volunteer in Campaign A can read/update/delete voter lists in Campaign B.

**Fix:** Add `VoterList.campaign_id == campaign_id` to every service query.

---

### C3 — `ImportJob` Routes Don't Scope by Campaign
**File:** `app/api/v1/imports.py:184,277,351,401`
**Confidence:** 92

`detect_columns`, `confirm_mapping`, `cancel_import`, `get_import_status` use `db.get(ImportJob, import_id)` with no campaign check. Only `delete_import` enforces this.

**Fix:**
```python
if job is None or job.campaign_id != campaign_id:
    raise HTTPException(status_code=404, ...)
```

---

### C4 — `revoke_invite` Doesn't Scope to Campaign
**File:** `app/api/v1/invites.py:106` • `app/services/invite.py:257`
**Confidence:** 95

Route accepts `campaign_id` in path but passes only `invite_id` to service. Service fetches by bare primary key. Admin of Campaign A can revoke any invite in any campaign by brute-forcing UUIDs.

**Fix:** Add `Invite.campaign_id == campaign_id` to service query.

---

### C5 — `FORCE ROW LEVEL SECURITY` Missing on Core Tables
**File:** `alembic/versions/001_initial_schema.py:142-166`
**Confidence:** 95

`campaigns`, `campaign_members`, and `users` tables enable RLS but don't call `FORCE ROW LEVEL SECURITY`. Without FORCE, the table owner role (including superuser) bypasses all RLS policies silently. Migrations 003-005 correctly use both; these three critical tables do not.

**Fix:** New migration with `ALTER TABLE <name> FORCE ROW LEVEL SECURITY` for each.

---

### C6 — `organizations` and `organization_members` Have No RLS
**Files:** `alembic/versions/009_organizations.py`, `015_organization_members.py`
**Confidence:** 95

Neither migration calls `ENABLE ROW LEVEL SECURITY` or creates any policies. Any authenticated request can read all organizations and memberships in the database.

**Fix:** Add ENABLE + FORCE RLS with proper scoping policies.

---

### C7 — No Route-Level Auth Guard (Logic Error)
**File:** `web/src/routes/__root.tsx:243-254`
**Confidence:** 95

```tsx
if (!isAuthenticated || isPublicRoute) {
  return (
    <div ...>
      <main ...><Outlet /></main>  // Child renders unprotected
    </div>
  )
}
```

When `!isAuthenticated` AND the route is not public, the condition still evaluates true, rendering the child route component in the public shell. Unauthenticated users can reach protected campaign routes which fire API calls.

**Fix:**
```tsx
if (!isAuthenticated && !isPublicRoute) {
  return <Navigate to="/login" />
}
```

---

### C8 — OIDC Callback Ignores Error Parameters
**File:** `web/src/routes/callback.tsx:84-87`
**Confidence:** 88

`validateSearch` only extracts `code` and `state`. When IdP returns `?error=access_denied&error_description=...`, both default to `""`, `handleCallback` is called with malformed URL, throws, and the user sees spinner → silent redirect to `/login` with no diagnostic.

**Fix:** Extend `validateSearch` to include `error`/`error_description`, check before calling `handleCallback`.

---

### C9 — Shift Signup Race Condition (Capacity Overflow)
**File:** `app/services/shift.py:364-398`
**Confidence:** 92

`signup_volunteer` reads signed-up count, then assigns `SIGNED_UP` or `WAITLISTED` as two unguarded steps. No `SELECT FOR UPDATE`. Two concurrent requests can both read count=9/10, both pass the check, both signup — overflowing the shift. `_promote_from_waitlist` correctly uses locking; signup does not.

**Fix:** Add `.with_for_update()` to `_get_shift_raw` or use atomic `INSERT ... SELECT ... WHERE count < max`.

---

### C10 — DNC Bulk Import TOCTOU Race
**File:** `app/services/dnc.py:100-130`
**Confidence:** 87

Per-row `SELECT` existence check then separate `INSERT` in loop. Concurrent imports cause `IntegrityError` that isn't caught, surfacing as unhandled 500.

**Fix:** Use `INSERT ... ON CONFLICT DO NOTHING` or catch `IntegrityError`.

---

### C11 — Invite Accept Missing Compensating Transaction
**File:** `app/services/invite.py:170-230`
**Confidence:** 83

`accept_invite` creates `CampaignMember`, calls ZITADEL `assign_project_role`, then commits. If `assign_project_role` succeeds but `db.commit()` fails, the ZITADEL grant is orphaned permanently. `join.py` has compensating cleanup; `accept_invite` does not.

**Fix:** Wrap `db.commit()` in try/except, call `zitadel.remove_project_role` on failure.

---

### C12 — `voter_interactions` Has No Indexes
**File:** `app/models/voter_interaction.py`
**Confidence:** 92

The primary event log table for all voter activity has no `__table_args__` at all. No composite index on `(campaign_id, voter_id)` or `(campaign_id, created_at)`. Every voter detail page and timeline query does a full scan.

**Fix:**
```python
__table_args__ = (
    Index("ix_voter_interactions_campaign_voter", "campaign_id", "voter_id"),
    Index("ix_voter_interactions_campaign_created", "campaign_id", "created_at"),
)
```

---

### C13 — Invite Unique Constraint Is Unconditional (Not Partial)
**File:** `app/models/invite.py:22-27`
**Confidence:** 88

`UniqueConstraint("email", "campaign_id")` is named "pending" but applies unconditionally. After acceptance/revocation, the system cannot re-invite the same email to the same campaign.

**Fix:** Replace with partial unique index:
```sql
CREATE UNIQUE INDEX uq_pending_invite_email_campaign
ON invites (email, campaign_id)
WHERE accepted_at IS NULL AND revoked_at IS NULL;
```

---

### C14 — Sync Engine `isSyncing` Permanent Lock
**File:** `web/src/hooks/useSyncEngine.ts:43-96`
**Confidence:** 95

`setSyncing(true)` at line 47, `setSyncing(false)` at line 96 only runs on normal path. Any unhandled exception leaves `isSyncing = true` forever. Subsequent online events skip all drain attempts — offline sync stalls silently and permanently.

**Fix:** Wrap the body in `try/finally`.

---

### C15 — Sync Engine Infinite Retry + Halted Queue
**File:** `web/src/hooks/useSyncEngine.ts:83-92`
**Confidence:** 90

```ts
} else if (item.retryCount >= 2) {
  useOfflineQueueStore.getState().incrementRetry(item.id)
  continue  // item stays in queue with ever-growing retryCount
} else {
  useOfflineQueueStore.getState().incrementRetry(item.id)
  break  // halts entire queue on one transient error
}
```

Permanently-failing items (e.g. 400 Bad Request) are retried every 30s forever with no user feedback or removal path. Transient errors halt processing of all subsequent items.

**Fix:** Remove items after MAX_RETRY exceeded with user toast. Use `continue` not `break` for transient errors.

---

### C16 — `callingStore` Persists Voter PII Without Validation
**File:** `web/src/stores/callingStore.ts:181-186`
**Confidence:** 88

No `partialize` filter; no validation on rehydration. Full `CallingEntrySnapshot` objects (voter names, E.164 phone numbers, attempt history) written verbatim to `sessionStorage`. Peer `canvassingStore` has both protections; `callingStore` does not.

**Fix:** Add `partialize` to strip PII or add a rehydration validator matching `canvassingStore`'s `sanitizePersistedCanvassingState`.

---

## HIGH Issues (32)

### Backend Security & Reliability

**H1. DNC CSV upload has no size limit** — `app/api/v1/dnc.py:91` — `await file.read()` with no byte cap; OOM risk.

**H2. Import filename not sanitized in S3 key** — `app/api/v1/imports.py:136` — path traversal in S3 object keys.

**H3. `transfer_ownership` not atomic** — `app/api/v1/members.py:303-374` — ZITADEL ops before DB commit; compensation block is empty `pass`.

**H4. `voter_tags.add_tag` doesn't validate tag belongs to campaign** — `app/api/v1/voter_tags.py:129` — can assign Campaign B's tag to Campaign A's voter.

**H5. `surveys` routes don't validate `script_id`/`question_id` against `campaign_id`** — `app/api/v1/surveys.py:125,158,186,221,253,281`.

**H6. ZitadelService has no HTTP timeouts** — `app/services/zitadel.py` (all methods) — slow ZITADEL blocks the event loop indefinitely. Add `timeout=10.0` to all `httpx.AsyncClient` constructions.

**H7. `StorageService.ensure_bucket` masks real errors** — `app/services/storage.py:186-191` — catches all `ClientError`, tries bucket creation even on access-denied. Inspect error code first.

**H8. Campaign create recursive retry leaks ZITADEL grants** — `app/services/campaign.py:136-154` — slug collision rollback doesn't undo ZITADEL `assign_project_role`.

**H9. `_merge_error_files` loads all CSVs into memory** — `app/services/import_service.py:1386-1431` — OOM on large failed imports. Stream through temp file.

**H10. `org.list_members_with_campaign_roles` N+1 query** — `app/services/org.py:63-96` — one query per member; fetch roles in batch.

### Backend Infrastructure

**H11. Duplicate `Settings` fields with conflicting defaults** — `app/core/config.py:45,69` — `trusted_proxy_cidrs` and `rate_limit_unauthenticated` declared twice. Remove first declarations.

**H12. Rate limiting disabled by default in docker-compose** — `docker-compose.yml:25` — `DISABLE_RATE_LIMIT:-true`. Change default to `false`.

**H13. TLS verification unconditionally disabled** — `scripts/bootstrap-zitadel.py:41` — `_VERIFY_TLS = False` applies even to external domain calls. Scope to Docker hostname only.

**H14. DB engine missing pool/query timeouts** — `app/db/session.py:16-22` — no `pool_timeout`, no `statement_timeout`. Add `pool_timeout=10`, `connect_args={"server_settings": {"statement_timeout": "30000"}}`.

**H15. Hardcoded DB URL in `alembic.ini:5`** — silent fallback when `DATABASE_URL_SYNC` not exported. Replace with `%(DATABASE_URL_SYNC)s`.

**H16. Logging middleware extracts IP without trusted-proxy check** — `app/core/middleware/request_logging.py:81-85` — spoofable `X-Real-IP` in logs. Inline `_is_trusted_proxy` check.

**H17. `uv` binary pinned to `:latest`** — `Dockerfile:11` — supply chain risk. Pin to specific version.

### Database Constraints & Schema

**H18. `VoterEmail` missing unique constraint** — `app/models/voter_contact.py:42-59` — peer `VoterPhone` has `uq_voter_phone_campaign_voter_value`; `VoterEmail` doesn't. Duplicate emails allowed.

**H19. `VolunteerTag` missing unique constraint on `(campaign_id, name)`** — `app/models/volunteer.py:86-97` — peer `VoterTag` has it; `VolunteerTag` doesn't.

**H20. `import_jobs` missing `(campaign_id, status)` index** — `app/models/import_job.py` — status polling full-scans.

**H21. `VoterResponse` schema omits L2 fields** — `app/schemas/voter.py` — `house_number`, `street_number_parity`, mailing fields, etc. silently dropped from API responses.

**H22. `voter.geom` has `spatial_index=False`** — `app/models/voter.py:121-124` — GiST index exists in DB (migration 003) but model says otherwise; autogenerate could drop it.

### Frontend Auth & Authorization

**H23. `/campaigns/new` has no auth guard** — `web/src/routes/campaigns/new.tsx:616` — any authenticated user can reach Create Campaign page. Add `RequireOrgRole minimum="org_admin"`.

**H24. Settings routes accessible to all members** — `web/src/routes/campaigns/$campaignId/settings/*.tsx` — no `beforeLoad` guard on general/members/danger; exposes campaign rename, member list, and role data.

**H25. DNC list shows phone numbers to all roles** — `web/src/routes/.../phone-banking/dnc/index.tsx:42-163` — viewers and volunteers can read the full DNC list. Wrap page in `RequireRole minimum="manager"`.

**H26. Volunteers can bypass check-in on calling page** — `web/src/routes/.../sessions/$sessionId/call.tsx` — direct URL navigation skips the local `checkedIn` state guard.

**H27. `authStore.logout()` dead code + incomplete error path** — `web/src/stores/authStore.ts:91-95` — `set({ user: null })` after `signoutRedirect()` never runs; call `mgr.removeUser()` + `set()` before redirect.

### Frontend Data Layer

**H28. `useOrgCampaigns` swallows ALL errors** — `web/src/hooks/useOrg.ts:12-43` — bare `catch {}` hides auth errors and 500s. Narrow to `PermissionError` + 404.

**H29. Duplicate hooks with different query keys** — `web/src/hooks/useFieldOps.ts` vs dedicated hook files — `useFieldOps.useCallLists` uses `["call-lists", campaignId]` while `useCallLists` uses `callListKeys.all(campaignId)`. Mutations don't invalidate `useFieldOps` variants. Stale data.

**H30. `useDeleteTag` bakes `tagId` into hook** — `web/src/hooks/useVoterTags.ts:41-48` (also `useVolunteerTags.ts:47-55`) — mutation should accept `tagId` as variable.

### Frontend Accessibility (WCAG AAA target)

**H31. Map marker icons from unpkg CDN** — `web/src/components/field/CanvassingMap.tsx:19-42` — offline field users see no markers when CDN unreachable. Self-host Leaflet images.

**H32. DoorKnockDialog/WalkListGenerateDialog selects missing `htmlFor`/`id`** — `web/src/components/canvassing/DoorKnockDialog.tsx:99`, `WalkListGenerateDialog.tsx:88` — screen readers announce field with no label.

**H33. `InlineSurvey` radio items fail implicit label association** — `web/src/components/field/InlineSurvey.tsx:243-250` — wrapping `<Label>` doesn't work with Radix `role="radio"` buttons. Use explicit `htmlFor`/`id` like `SurveyWidget`.

---

## MEDIUM Issues (25)

### Backend

- **M1.** `JWT validate_token` retries JWKS on ALL exceptions — `app/core/security.py:137-144` — amplification vector. Narrow to `JoseError`.
- **M2.** `list_campaigns`, `list_volunteers`, `list_members`, `list_enriched_entries` have no pagination limit — unbounded scans.
- **M3.** `voter.delete_voter` doesn't commit — `app/services/voter.py:514-534` — inconsistent with `create_voter`; caller-dependent.
- **M4.** Import batch `phone_manifest` counter not reset on failure — `app/services/import_service.py:1659-1703` — duplicate phone records on retry.
- **M5.** `ZitadelService.remove_project_role` doesn't paginate grants — `app/services/zitadel.py:295-336` — silently fails to remove role.
- **M6.** `call_list.claim_entries` stale-release not atomic — `app/services/call_list.py:241-293` — distribution fairness breaks under concurrency.
- **M7.** `PhoneBankSession.campaign_id` not validated against `call_list_id`'s campaign — `app/models/phone_bank.py` — no DB-level guard; same for `WalkList`.
- **M8.** `WalkList.total_entries`/`visited_entries` counters can drift — no trigger keeps them in sync.
- **M9.** DB session pool RLS reset event fires synchronous cursor on every checkout — `app/db/session.py:25-40` — latency risk under load.
- **M10.** `email` leaked in invite ValueError message — `app/services/invite.py:88`.
- **M11.** `minio:latest` unpinned image tag — `docker-compose.yml:117`.
- **M12.** No explicit rollback in `get_db`/`get_campaign_db` dependencies — `app/api/deps.py:54-62`.

### Frontend

- **M13.** No `<title>` management on any route — violates WCAG 2.4.2.
- **M14.** Turf delete button shown to all roles — `web/src/routes/.../canvassing/index.tsx:130-143`.
- **M15.** Survey create/delete shown to all roles — `web/src/routes/.../surveys/index.tsx:63,117`.
- **M16.** `useCallingSession` stale `callListId` closure — `web/src/hooks/useCallingSession.ts:177-220`.
- **M17.** `handleEndSession` clears state before checkout completes — `web/src/hooks/useCallingSession.ts:337-340`.
- **M18.** `useDeleteCampaign` and `useTransferOwnership` missing `onError` — `web/src/hooks/useCampaigns.ts:51-77`.
- **M19.** `useRemoveListMembers` sends DELETE with JSON body — `web/src/hooks/useVoterLists.ts:94-103` — widely unsupported.
- **M20.** `useCanvassingWizard.handleSkipAddress` has no rollback — `web/src/hooks/useCanvassingWizard.ts:316-325`.
- **M21.** `AssignmentCard` Progress has no accessible label — `web/src/components/field/AssignmentCard.tsx:49`.
- **M22.** DataTable clickable rows not keyboard-navigable — `web/src/components/shared/DataTable.tsx:172-191`.
- **M23.** `FieldHeader` has invalid `<nav>` wrapping `<header>` — `web/src/components/field/FieldHeader.tsx:41-106`.
- **M24.** `AssignVolunteerDialog` radio group has no `<fieldset>`/`<legend>` — `web/src/components/shifts/AssignVolunteerDialog.tsx:130-160`.
- **M25.** `TurfForm` uses hardcoded `text-amber-600` — dark mode contrast fails.

---

## LOW Issues (4)

- **L1.** `StatusBadge` uses `bg-[--status-success]` syntax instead of `bg-status-success` — `web/src/components/shared/StatusBadge.tsx:8-11`.
- **L2.** `cssColor.ts` cache can return stale values after theme toggle — `web/src/lib/cssColor.ts:7-8`.
- **L3.** Transfer ownership picker doesn't exclude current owner — `web/src/routes/.../settings/danger.tsx:53-58`.
- **L4.** Voter "Edit" dropdown navigates to view page (stub) — `web/src/routes/.../voters/index.tsx:518-527`.

---

## Test Coverage Gaps

Vitest config declares 95% coverage thresholds. The following have **zero unit tests**:

| File | Criticality |
|------|-------------|
| `stores/authStore.ts` | **Critical** — token management, OIDC events, switchOrg |
| `api/client.ts` | **Critical** — auth header injection, 401/403 handling |
| `hooks/useOrgPermissions.ts` | **High** — gates root layout nav |
| `hooks/useCampaigns.ts` | **High** — campaign CRUD |
| `hooks/useUsers.ts` | **High** — `useMyCampaignRole` permission fallback |
| `config.ts` | Medium — module-level singleton risk |
| `hooks/useDashboard.ts` | Medium |
| `hooks/useFieldOps.ts` | Medium |
| `hooks/useOrg.ts` | Medium |
| `hooks/usePhoneBankSessions.ts` | Medium |
| `hooks/useSurveys.ts` | Medium |
| `hooks/useTurfs.ts` | Medium |
| `hooks/useWalkLists.ts` | Medium |
| `hooks/use-mobile.ts` | Low |

**`callback.test.tsx`** has only 2 happy-path cases. Missing: OIDC error response, null user after callback, volunteer with no campaigns, campaigns API failure, non-volunteer user.

**E2E suite** (57 specs) is comprehensive; only gap is OIDC error callback path.

---

## Recommended Fix Priority

### Week 1 — Security Blockers
1. Fix 4 IDOR/tenant isolation gaps (C1, C2, C3, C4)
2. Add `FORCE ROW LEVEL SECURITY` to `campaigns`, `campaign_members`, `users` (C5)
3. Add RLS to `organizations` and `organization_members` (C6)
4. Fix route-level auth guard logic error (C7)
5. Add role guards to settings, DNC, Create Campaign routes (H23-H26)

### Week 2 — Data Integrity
6. Fix shift signup race condition (C9)
7. Fix DNC bulk import TOCTOU (C10)
8. Fix invite accept compensating transaction (C11)
9. Fix sync engine lock + infinite retry (C14, C15)
10. Add `voter_interactions` indexes (C12)
11. Fix invite unique constraint partial index (C13)

### Week 3 — Reliability
12. Add HTTP timeouts to ZitadelService (H6)
13. Add DB pool + query timeouts (H14)
14. Fix `callingStore` PII persistence (C16)
15. Fix duplicate query keys in `useFieldOps` (H29)
16. Fix duplicate Settings fields (H11)
17. Fix IP spoofing in logging middleware (H16)

### Week 4 — Quality
18. Self-host Leaflet marker icons (H31)
19. Fix accessibility label gaps (H32, H33)
20. Add unit tests for `authStore`, `api/client.ts`, `useOrgPermissions`
21. Address remaining MEDIUM items

---

## Appendix: Agent Assignments

| Agent | Scope | Files Reviewed |
|-------|-------|----------------|
| API Routes & Security | `app/api/v1/*.py`, `app/core/{security,rate_limit,errors}.py` | 25 |
| Models & Database | `app/models/`, `app/schemas/`, `alembic/` | 60+ |
| Services & Business Logic | `app/services/`, `app/tasks/`, `app/utils/` | 25 |
| Core Infrastructure | `app/core/`, `app/db/`, Docker, deps | 15 |
| Frontend API & Data Layer | `web/src/hooks/`, `web/src/api/`, `web/src/stores/` | 50+ |
| Frontend Routes & Pages | `web/src/routes/**/*.tsx` | 65 |
| Components & Accessibility | `web/src/components/`, `web/src/lib/` | 100+ |
| Auth, State & Test Coverage | Auth files, all `*.test.*` files | 80+ |
