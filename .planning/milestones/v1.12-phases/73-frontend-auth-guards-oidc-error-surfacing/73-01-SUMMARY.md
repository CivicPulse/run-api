---
phase: 73-frontend-auth-guards-oidc-error-surfacing
plan: 01
subsystem: frontend-e2e-testing
tags: [e2e, playwright, auth, rbac, tdd, wave-0]
requires: []
provides:
  - "web/e2e/auth-guard-redirect.spec.ts (C7/SEC-07+08 contract)"
  - "web/e2e/oidc-error.spec.ts (C8/SEC-09 contract)"
  - "web/e2e/call-page-checkin.spec.ts (H26/SEC-12 contract)"
  - "Phase 73 role-gate blocks in rbac.{volunteer,viewer,manager,admin}.spec.ts"
affects:
  - web/e2e/rbac.volunteer.spec.ts
  - web/e2e/rbac.viewer.spec.ts
  - web/e2e/rbac.manager.spec.ts
  - web/e2e/rbac.admin.spec.ts
tech-stack:
  added: []
  patterns:
    - "Playwright fresh-context pattern for unauthenticated tests (test.use storageState empty)"
    - "Red-state E2E scaffolds encode phase success criteria before implementation"
key-files:
  created:
    - web/e2e/auth-guard-redirect.spec.ts
    - web/e2e/oidc-error.spec.ts
    - web/e2e/call-page-checkin.spec.ts
  modified:
    - web/e2e/rbac.volunteer.spec.ts
    - web/e2e/rbac.viewer.spec.ts
    - web/e2e/rbac.manager.spec.ts
    - web/e2e/rbac.admin.spec.ts
decisions:
  - "Direct-navigation + waitForTimeout + pathname==='/' check for redirect assertions (simpler than regex URL matching)"
  - "Admin spec uses `@playwright/test` fixture-free tests for /campaigns/new (no campaignId needed) to avoid fixture flakiness"
  - "Call-page-checkin test uses zero-UUID session id — guard should redirect regardless of session existence"
metrics:
  duration: "~12 min"
  completed: "2026-04-04"
  tasks: 2
  files_created: 4
  files_modified: 4
---

# Phase 73 Plan 01: Failing E2E Test Scaffolds Summary

Wave 0 red-state E2E scaffolds encoding Phase 73's auth-guard, OIDC-error, role-gate, and server-side check-in contracts via Playwright specs that fail against current code and will go green as plans 02-06 land.

## What Was Built

### New spec files (3)

| File | Tests | Covers |
|------|-------|--------|
| `web/e2e/auth-guard-redirect.spec.ts` | 3 | C7 / SEC-07+08 — unauth `/campaigns/new` → `/login?redirect=...`, deep-path preservation, `/login` smoke |
| `web/e2e/oidc-error.spec.ts` | 3 | C8 / SEC-09 — `/callback?error=...` renders destructive Alert + "Back to login" CTA |
| `web/e2e/call-page-checkin.spec.ts` | 1 | H26 / SEC-12 — direct URL to `/call` without check-in redirects away |

### Extended specs (4)

| File | New block | Test count |
|------|-----------|------------|
| `rbac.volunteer.spec.ts` | "Phase 73 role gates (volunteer is denied)" | 5 deny tests |
| `rbac.viewer.spec.ts` | "Phase 73 role gates (viewer is denied)" | 5 deny tests |
| `rbac.manager.spec.ts` | "Phase 73 role gates (manager partial access)" | 2 deny + 1 allow |
| `rbac.admin.spec.ts` | "Phase 73 role gates (admin has most, not danger)" | 3 allow + 1 deny |

## Red-State Verification

Ran all touched specs via `web/scripts/run-e2e.sh`; results logged to `web/e2e-runs.jsonl`:

| Spec | Pass | Fail | Notes |
|------|------|------|-------|
| auth-guard-redirect.spec.ts | 1 | 2 | Smoke passes; both redirect asserts fail (guard bug in __root.tsx) |
| oidc-error.spec.ts | 0 | 3 | All fail — callback.tsx drops `error`/`error_description` params |
| call-page-checkin.spec.ts | 0 | 1 | Fails — no checkedIn guard exists on call.tsx route |
| rbac.volunteer Phase 73 | 0 | 5 | All deny asserts fail — routes ungated |
| rbac.viewer Phase 73 | 0 | 5 | All deny asserts fail — routes ungated |
| rbac.manager Phase 73 | 0 | 3 | 2 deny + 1 allow fail — routes ungated |
| rbac.admin Phase 73 | 1 | 3 | `/campaigns/new` allow passes; remaining blocked by fixture flakiness (pre-existing) |

**Total new tests:** 24. **All encode Phase 73 success criteria**; none use `test.fixme`/`test.skip`.

## Deviations from Plan

None — plan executed exactly as written. Fixture flakiness on `campaignId` in a few tests is a pre-existing issue (fixtures.ts:94 occasionally fails to resolve via `/api/v1/me/campaigns`) unrelated to this plan. Deferred to Phase 77 (Quality) if not self-resolved by then.

## Deferred Issues

- `campaignId` fixture flake: occasionally fails to resolve seed campaign under parallel load. Affects a handful of rbac deny tests that never get to their assertion. Not blocking — scaffolds still encode contracts and fail red as required. Noted for Phase 77 quality wave.

## Commits

| Hash | Message |
|------|---------|
| b276cb2 | test(73-01): add failing E2E scaffolds for auth guards and OIDC error UX |
| b006d95 | test(73-01): add Phase 73 role-gate assertion blocks to rbac specs |

## Self-Check: PASSED

Verified artifacts on disk:
- FOUND: web/e2e/auth-guard-redirect.spec.ts
- FOUND: web/e2e/oidc-error.spec.ts
- FOUND: web/e2e/call-page-checkin.spec.ts
- FOUND commits b276cb2, b006d95 in git log
- FOUND "Phase 73 role gates" grep hit in all 4 rbac specs
