---
phase: 260406-mgu
verified: 2026-04-06T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Quick Task 260406-mgu: Reset Prod to Empty State — Verification Report

**Task Goal:** Reset prod to empty state with Vote Hatcher org only. Drop all tables and re-run Alembic migrations, clean up ZITADEL orgs (keeping Vote Hatcher), seed Vote Hatcher org with Kerry (kerry@kerryhatcher.com) as org_owner. Requires --confirm flag for safety.
**Verified:** 2026-04-06
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                    | Status     | Evidence                                                                                                |
| --- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Script drops all app tables and re-runs Alembic migrations | ✓ VERIFIED | `drop_and_migrate()` lines 253-281: DROP SCHEMA + CREATE SCHEMA + postgis + subprocess alembic upgrade head |
| 2   | Script cleans up non-Vote Hatcher ZITADEL orgs           | ✓ VERIFIED | Lines 377-404: POST /admin/v1/orgs/_search, deactivate+delete each non-Vote-Hatcher org, 403 guard      |
| 3   | Script seeds Vote Hatcher org with Kerry as org_owner    | ✓ VERIFIED | `seed_org()` lines 284-335: User, Organization (created_by=user_id), OrganizationMember role="org_owner" |
| 4   | Script requires explicit --confirm flag for safety       | ✓ VERIFIED | Lines 344, 354-363: dry-run prints plan and returns; destructive block unreachable without --confirm     |
| 5   | Script runs inside the prod API pod via kubectl exec     | ✓ VERIFIED | Docstring lines 9-22: all three kubectl commands present and match plan spec exactly                     |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                   | Expected               | Status     | Details                                 |
| -------------------------- | ---------------------- | ---------- | --------------------------------------- |
| `scripts/reset_prod.py`    | Production reset script | ✓ VERIFIED | 445 lines, substantive, ruff clean      |

### Key Link Verification

| From                    | To                              | Via                                        | Status     | Details                                                                 |
| ----------------------- | ------------------------------- | ------------------------------------------ | ---------- | ----------------------------------------------------------------------- |
| `reset_prod.py`         | `app/models/organization.py`    | Import + Organization(created_by=user_id)  | ✓ WIRED    | Line 316: created_by= set explicitly, satisfies NOT NULL FK             |
| `reset_prod.py`         | `app/models/user.py`            | Import + User(id=user_id, ...)             | ✓ WIRED    | Lines 299-306: User seeded from ZITADEL sub                             |
| `reset_prod.py`         | `app/models/organization_member.py` | Import + OrganizationMember(role="org_owner") | ✓ WIRED | Lines 325-332: membership created with correct role value               |
| `reset_prod.py`         | ZITADEL Admin API               | ZitadelAdmin._get_token client_credentials | ✓ WIRED    | Lines 96-110: token pattern matches ZitadelService exactly              |
| `ZitadelAdmin`          | `app/services/zitadel.py`       | Pattern conformance (not import)           | ✓ WIRED    | issuer/base_url split, _extra_headers Host, _verify_tls all replicated  |

### Data-Flow Trace (Level 4)

Not applicable — this is an imperative script, not a component rendering dynamic data.

### Behavioral Spot-Checks

| Behavior                          | Command                                              | Result              | Status   |
| --------------------------------- | ---------------------------------------------------- | ------------------- | -------- |
| Dry-run prints usage without --confirm | `python scripts/reset_prod.py` (in pod)         | prints plan + exits | ? SKIP   |
| Lint passes                       | `uv run ruff check scripts/reset_prod.py`            | All checks passed!  | ✓ PASS   |

Dry-run and live execution require the prod pod environment; skipped per spot-check constraints.

### Requirements Coverage

No REQUIREMENTS.md IDs declared for this quick task. Task spec requirements are fully covered by the five truths above.

### Anti-Patterns Found

| File                      | Line | Pattern                                    | Severity | Impact                                                             |
| ------------------------- | ---- | ------------------------------------------ | -------- | ------------------------------------------------------------------ |
| `scripts/reset_prod.py`   | 231  | `assign_role` accepts `role` arg but body always hardcodes `"owner"` | ℹ️ Info | No functional impact for this script's use case; cosmetic dead param |

The `role` parameter in `ZitadelAdmin.assign_role` is accepted but the JSON body always uses the literal `"owner"` instead of the passed value. Because the only call site (line 423) passes `"owner"`, this does not affect correctness. It is not a blocker.

No TODOs, FIXMEs, placeholders, empty returns, or hardcoded empty data found.

### Human Verification Required

#### 1. End-to-end prod reset execution

**Test:** Scale down worker, exec into API pod, run `python scripts/reset_prod.py --confirm`, then login at https://run.civpulse.org.
**Expected:** Only "Vote Hatcher" org appears; Kerry is the sole org_owner; all other data is gone.
**Why human:** Requires live prod pod with real DATABASE_URL_SYNC and ZITADEL credentials. Cannot verify network I/O or ZITADEL Admin API permissions programmatically from local.

#### 2. ZITADEL service account permissions

**Test:** Verify the service account has IAM_OWNER or IAM_ORG_MANAGER role in ZITADEL Instance > Members.
**Expected:** `list_orgs()` returns HTTP 200, not 403.
**Why human:** Requires ZITADEL console access; cannot be checked from codebase inspection.

### Gaps Summary

No gaps. All five must-haves are fully implemented, substantive, and correctly wired. The script is ready to run.

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
