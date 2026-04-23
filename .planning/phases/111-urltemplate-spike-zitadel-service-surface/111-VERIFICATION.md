---
phase: 111-urltemplate-spike-zitadel-service-surface
verified: 2026-04-23T17:30:00Z
status: gaps_found
score: 0/6 must-haves verified
---

# Phase 111: urlTemplate Spike + ZITADEL Service Surface — Verification Report

**Phase Goal:** Prove that ZITADEL's `urlTemplate` reliably deep-links an authenticated invitee back to `/invites/<token>` after they set a password, then ship the ZITADEL service surface the rest of the milestone depends on.
**Verified:** 2026-04-23T17:30:00Z
**Status:** gaps_found

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | urlTemplate spike proves deep-link lands invitee on `/invites/<token>` with OIDC session | ? UNCERTAIN | E2E spec scaffolded (`web/e2e/invite-urltemplate-spike.spec.ts`, 318 lines, substantive) but no SUMMARY.md — no evidence it was run against live ZITADEL |
| 2 | `ZitadelService.ensure_human_user()` implemented with search-then-create idempotency | ✗ FAILED | Method does not exist in `app/services/zitadel.py` — grep returns zero matches |
| 3 | `ZitadelService.create_invite_code()` implemented with `returnCode: {}` | ✗ FAILED | Method does not exist in `app/services/zitadel.py` — grep returns zero matches |
| 4 | Both methods share bounded exponential retry with unit tests | ✗ FAILED | No methods exist; no unit tests in `tests/` reference either method |
| 5 | Service-account PAT scoped to `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` | ? UNCERTAIN | No evidence of scope audit or narrowing in any commit |
| 6 | Phase-exit gate: pytest/vitest/Playwright baselines green | ? UNCERTAIN | No test run evidence; no SUMMARY.md documenting baseline check |

**Score:** 0/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/e2e/invite-urltemplate-spike.spec.ts` | Spike E2E test | ✓ EXISTS + SUBSTANTIVE | 318 lines; provisions throwaway user, mints invite code, navigates hosted flow, asserts landing URL shape + session cookie |
| `web/scripts/run-e2e.sh` (spike guard) | Env guard for spike envs | ✓ EXISTS + SUBSTANTIVE | 28 new lines guard ZITADEL_URL/CLIENT_ID/SECRET; fail-loud before spec runs |
| `app/services/zitadel.py` (ensure_human_user) | Search-then-create user method | ✗ MISSING | Method does not exist |
| `app/services/zitadel.py` (create_invite_code) | Invite code creation method | ✗ MISSING | Method does not exist |
| `tests/**/test_*zitadel*` (unit tests) | Retry exhaustion, retry success, idempotent re-entry | ✗ MISSING | No test files for new service methods |

**Artifacts:** 2/5 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| spike spec → ZITADEL API | `/v2/users/human` + `/v2/users/{id}/invite_code` | fetch in beforeAll | ✓ WIRED (in spec only) | Lines 150-211: creates user + mints invite code with correct shapes |
| `ensure_human_user` → ZITADEL search API | search-then-create idempotency | N/A | ✗ NOT WIRED | Method does not exist |
| `create_invite_code` → ZITADEL invite API | POST with returnCode | N/A | ✗ NOT WIRED | Method does not exist |
| Service methods → retry decorator | Bounded exponential retry | N/A | ✗ NOT WIRED | Methods don't exist; retry not applied |

**Wiring:** 1/4 connections verified (and that 1 is test-only, not production code)

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| PROV-01: `ensure_human_user` with search-then-create idempotency | ✗ BLOCKED | Method not implemented |
| PROV-02: `create_invite_code` with `returnCode: {}` | ✗ BLOCKED | Method not implemented |
| PROV-03: Bounded exponential retry on both methods | ✗ BLOCKED | Methods not implemented; no retry wiring |
| SEC-03: PAT scoped to ORG_USER_MANAGER + ORG_PROJECT_USER_GRANT_EDITOR | ? NEEDS HUMAN | No audit evidence in commits or docs |

**Coverage:** 0/4 requirements satisfied

## Anti-Patterns Found

No production code was modified in this phase, so anti-pattern scan applies only to the spike spec.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/invite-urltemplate-spike.spec.ts` | 100 | `// Populated by the T2 setup in the next commit.` | ℹ️ Info | Stale comment — T2 setup was delivered in same commit (011709de) |
| `web/e2e/invite-urltemplate-spike.spec.ts` | 114 | `// Spec-local trace/video/screenshot retention lands in T4.` | ⚠️ Warning | References T4 that may not have shipped — no trace config visible |

**Anti-patterns:** 2 found (0 blockers, 1 warning, 1 info)

## Test Quality Audit

No production test files exist for Phase 111 service methods. The spike E2E spec is the only test artifact.

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|----------------|---------|
| `invite-urltemplate-spike.spec.ts` | SC-1 (spike) | 1 | 0 | No | Behavioral (URL shape + cookie) | ✓ Well-structured — but unrun |

**Disabled tests on requirements:** 0
**Circular patterns detected:** 0
**Insufficient assertions:** N/A — no unit/integration tests exist for PROV-01/02/03

## Behavioral Verification

Skipped. No production code was modified — running pytest/vitest would verify the v1.18 baseline but cannot verify Phase 111 deliverables that don't exist. The spike E2E spec requires a live ZITADEL instance with service-account credentials, which is a human-verification item.

| Check | Result | Detail |
|-------|--------|--------|
| pytest (unit/integration) | SKIPPED | No Phase 111 production code to test |
| vitest (frontend) | SKIPPED | No Phase 111 frontend code to test |
| Spike E2E | ? NEEDS HUMAN | Requires live ZITADEL with ZITADEL_URL/CLIENT_ID/SECRET env vars |

## Human Verification Required

### 1. urlTemplate Spike Execution
**Test:** Run `cd web && ./scripts/run-e2e.sh invite-urltemplate-spike.spec.ts` with ZITADEL_URL, ZITADEL_SERVICE_CLIENT_ID, ZITADEL_SERVICE_CLIENT_SECRET exported
**Expected:** Test passes — ZITADEL creates user, mints invite code, browser lands on `/invites/<token>?zitadelCode=...&userID=...` with session cookie
**Why human:** Requires live ZITADEL instance and service-account credentials not available in CI

### 2. PAT Scope Audit
**Test:** Query ZITADEL admin API or console to verify service-account roles
**Expected:** PAT has exactly `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` on the CivicPulse org, NOT `IAM_OWNER`
**Why human:** Requires ZITADEL admin access to inspect role assignments

## Gaps Summary

### Critical Gaps (Block Progress)

1. **`ensure_human_user` not implemented**
   - Missing: `ZitadelService.ensure_human_user(email, given_name, family_name, org_id) -> (user_id, created)` with search-then-create idempotency
   - Impact: Blocks PROV-01 and downstream Phase 113 provisioning task
   - Fix: Implement in `app/services/zitadel.py` mirroring `ensure_project_grant` pattern

2. **`create_invite_code` not implemented**
   - Missing: `ZitadelService.create_invite_code(user_id, url_template) -> code` posting to v2 invite-code endpoint with `returnCode: {}`
   - Impact: Blocks PROV-02 and downstream Phase 113 email branching
   - Fix: Implement in `app/services/zitadel.py`

3. **Bounded retry not wired to new methods**
   - Missing: Both methods sharing exponential retry (3x, 1/2/4s) matching `bootstrap-zitadel.py:102-117` pattern
   - Impact: Blocks PROV-03
   - Fix: Apply existing retry pattern to both methods

4. **No unit or integration tests for service methods**
   - Missing: Tests covering retry exhaustion, retry success, idempotent re-entry
   - Impact: Blocks TEST-01/TEST-02 exit-gate criteria
   - Fix: Write pytest tests with mocked ZITADEL responses

5. **Spike not proven to have run**
   - Missing: No SUMMARY.md or test log showing the E2E spike passed against live ZITADEL
   - Impact: SC-1 (gating spike) unverified — if spike fails, milestone replans
   - Fix: Run spike against dev ZITADEL, record results

### Non-Critical Gaps

1. **PAT scope unverified (SEC-03)**
   - Issue: No evidence of scope audit
   - Impact: Security posture unconfirmed but doesn't block implementation
   - Recommendation: Verify during spike execution; narrow if over-privileged

## Recommended Fix Plans

Phase 111 has 6 plans (111-01 through 111-06) that address all gaps. The plans exist but have not been executed. Execution should proceed in plan order:

- **111-01-PLAN.md** (spike) — partially scaffolded, needs execution against live ZITADEL
- **111-02-PLAN.md** through **111-06-PLAN.md** — not started, deliver `ensure_human_user`, `create_invite_code`, retry wiring, unit tests, integration tests, PAT audit

No new fix plans needed — the existing plans cover all gaps.

## Verification Metadata

**Verification approach:** Goal-backward (derived from ROADMAP.md Success Criteria)
**Must-haves source:** ROADMAP.md Phase 111 Success Criteria (6 criteria)
**Automated checks:** 2 passed (spike spec exists + run-e2e guard), 4 failed (all service-layer deliverables missing)
**Human checks required:** 2 (spike execution, PAT scope audit)
**Total verification time:** ~3 min

---
*Verified: 2026-04-23T17:30:00Z*
*Verifier: Claude (subagent)*
