---
phase: 60-e2e-field-mode-cross-cutting-validation
verified: 2026-03-29T22:30:00Z
status: gaps_found
score: 2/4 must-haves verified
re_verification: false
gaps:
  - truth: "Full E2E suite runs against local Docker Compose with zero failures"
    status: failed
    reason: "SUMMARY admits 209 failures across 430 tests from pre-existing specs not fixed in Phase 60. 35 spec files outside Phase 60 scope still use the broken waitForURL(/(campaigns|org)/) pattern that Phase 60 fixed only in its own 3 spec files."
    artifacts:
      - path: "web/e2e/voter-crud.spec.ts"
        issue: "Uses broken waitForURL(/(campaigns|org)/) at line 19 — same pattern fixed in Phase 60 specs but not here"
      - path: "web/e2e/org-management.spec.ts"
        issue: "Uses broken waitForURL pattern — not fixed"
      - path: "web/e2e/campaign-archive.spec.ts"
        issue: "Uses broken waitForURL pattern — not fixed"
    missing:
      - "Apply the navigateToSeedCampaign URL fix (function-based exclusion of /login paths) to all 35 spec files that still use the broken pattern"
      - "Re-run full suite to confirm zero failures before VAL-01 can be marked complete"

  - truth: "E2E-20: Automated tests verify field mode hub, canvassing wizard, phone banking, offline queue, and onboarding tour"
    status: partial
    reason: "Spec exists with all 16 test IDs present and is substantively implemented. However, tests FIELD-08, FIELD-09, and FIELD-10 (phone banking) contain conditional test.skip() calls with no BUG-XX reference — they silently skip when 'No voters available in calling session'. This indicates a potential data setup gap or app issue that is untracked and untested. REQUIREMENTS.md also still marks E2E-20 as unchecked (- [ ]) and Pending in the traceability table."
    artifacts:
      - path: "web/e2e/field-mode.volunteer.spec.ts"
        issue: "FIELD-08/09/10 use test.skip(true, 'No voters available...') without BUG-XX ID — the plan required all skips to reference a bug ID. These may be silently skipping critical phone banking tests."
    missing:
      - "Investigate why phone banking shows 'no voters to call' for the volunteer in beforeAll setup — verify assignCaller() is actually succeeding"
      - "If this is a real app issue, create a BUG-XX entry in 60-BUGS.md and add it to the test.skip() call"
      - "Update REQUIREMENTS.md E2E-20 checkbox from [ ] to [x] and Traceability table from Pending to Complete"

  - truth: "All test bugs (spec logic errors) are fixed and app bugs are tracked in 60-BUGS.md with test.skip() BUG-XX references"
    status: partial
    reason: "60-BUGS.md correctly documents zero app bugs and 7 test-bug fixes. However, 4 conditional test.skip() calls in field-mode.volunteer.spec.ts and 1 in cross-cutting.spec.ts do not reference a BUG-XX ID. The plan (D-08) explicitly required test.skip() to reference a bug ID. The cross-cutting.spec.ts rate limiting skip is acceptable (graceful skip for local env), but the 3 phone banking skips in field-mode need investigation."
    artifacts:
      - path: "web/e2e/field-mode.volunteer.spec.ts"
        issue: "Lines 708, 752, 796: test.skip(true, 'No voters available...') without BUG-XX reference"
    missing:
      - "Either confirm the phone banking empty state is expected (seed data issue, not an app bug) and document that clearly in the skip message, or add a BUG-XX to 60-BUGS.md and reference it in the skip"

human_verification:
  - test: "Run the Phase 60 spec files in isolation against local Docker Compose"
    expected: "field-mode.volunteer, cross-cutting, and navigation specs produce 0 failures (skips acceptable)"
    why_human: "Cannot run Playwright from verification context; need to confirm the 3 new specs themselves actually pass now that infrastructure bugs were fixed"
  - test: "Check if FIELD-08/09/10 phone banking tests skip or execute"
    expected: "If assignCaller() works correctly in beforeAll, the volunteer should have a calling assignment and tests should run, not skip"
    why_human: "Conditional skip logic can only be observed by running the tests; cannot determine outcome from static analysis alone"
---

# Phase 60: E2E Field Mode, Cross-Cutting & Validation — Verification Report

**Phase Goal:** All E2E tests pass at 100% against local Docker Compose, with field mode and cross-cutting UI behaviors fully covered and all discovered bugs fixed
**Verified:** 2026-03-29T22:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Derived from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Field mode spec exercises volunteer hub, canvassing wizard, phone banking mode, offline queue sync, and onboarding tour | PARTIAL | Spec exists at 1158 lines with all 16 test IDs (FIELD-01..10, OFFLINE-01..03, TOUR-01..03). But FIELD-08/09/10 have conditional skips without BUG-XX tracking. |
| 2 | Cross-cutting spec exercises navigation, empty states, loading skeletons, error boundaries, form guards, and toasts | VERIFIED | `cross-cutting.spec.ts` (385 lines) covers CROSS-01..03, UI-01..03. `navigation.spec.ts` (309 lines) covers NAV-01..03. All test IDs confirmed present. |
| 3 | Running the full E2E suite against local Docker Compose produces a 100% pass rate with zero failures | FAILED | 60-03-SUMMARY explicitly states: "The full suite has 209 failures across 430 tests." 35 spec files outside Phase 60 still use the broken `waitForURL(/(campaigns|org)/)` pattern. The fix was applied only to Phase 60's 3 new spec files. |
| 4 | All bugs discovered during the test-fix-retest cycle are fixed and verified by re-running the affected specs | PARTIAL | 60-BUGS.md exists and documents 0 app bugs + 7 test-bug fixes. However, 4 conditional test.skip() calls lack BUG-XX references as required by D-08. REQUIREMENTS.md E2E-20/E2E-21 are still `- [ ]` (unchecked). |

**Score:** 2/4 truths verified (Truth 2 verified; Truth 1 partial; Truth 3 failed; Truth 4 partial)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/e2e/field-mode.volunteer.spec.ts` | Field mode spec covering FIELD-01..10, OFFLINE-01..03, TOUR-01..03 | VERIFIED | Exists, 1158 lines, all test IDs confirmed, mobile viewport (390x844), hasTouch/isMobile, serial describes, setOffline(), waitForResponse(), localStorage manipulation |
| `web/e2e/cross-cutting.spec.ts` | Cross-cutting spec covering CROSS-01..03, UI-01..03 | VERIFIED | Exists, 385 lines, all test IDs confirmed, createEmptyCampaignViaApi helper, route interception for skeleton test |
| `web/e2e/navigation.spec.ts` | Navigation spec covering NAV-01..03 | VERIFIED | Exists, 309 lines, all test IDs confirmed, openSidebar helper, 7 sidebar links, org nav, goBack() |
| `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-BUGS.md` | Bug tracking with Summary table | VERIFIED | Exists with `## Summary` section; documents 0 app bugs, 5 infra issues, 7 test-bug fixes |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `field-mode.volunteer.spec.ts` | `playwright.config.ts` volunteer project | `.volunteer.spec.ts` suffix matches `/.*\.volunteer\.spec\.ts/` | VERIFIED | Config line 66 confirms pattern match |
| `field-mode.volunteer.spec.ts` | `/api/v1/campaigns/*/walk-lists/*/canvassers` | `assignCanvasser()` in beforeAll | VERIFIED | Line 151 contains the route pattern |
| `field-mode.volunteer.spec.ts` | `/api/v1/campaigns/*/phone-bank-sessions/*/callers` | `assignCaller()` in beforeAll | VERIFIED | Line 168 contains the route pattern |
| `cross-cutting.spec.ts` | `/api/v1/campaigns` (POST) | `createEmptyCampaignViaApi()` | VERIFIED | Lines 31-45 implement the helper |
| `cross-cutting.spec.ts` | `RouteErrorBoundary` "Something went wrong" | Navigate to `00000000-...` UUID | VERIFIED | Line 354+ implements UI-03 |
| `navigation.spec.ts` | `web/src/routes/campaigns/$campaignId/` | `getByRole('link')` iteration | VERIFIED | Lines 52+ implement sidebar link checks |
| `full suite` | zero failures | pre-existing spec fixes | NOT WIRED | 35 spec files still have broken `waitForURL(/(campaigns|org)/)` pattern; fix applied only to Phase 60's 3 files |

---

## Data-Flow Trace (Level 4)

Not applicable — these are Playwright E2E test spec files, not application components that render data from a store or API. The specs themselves call API endpoints; data flow is validated at runtime.

---

## Behavioral Spot-Checks

Step 7b: SKIPPED for pre-existing specs — cannot run Playwright against local environment from verification context without the Docker Compose stack running. The SUMMARY documents that the tests were run and the Phase 60 spec files had their failures fixed.

| Behavior | Evidence Source | Result | Status |
|----------|-----------------|--------|--------|
| field-mode.volunteer.spec.ts syntax validity | 1158-line file, no import errors detected by grep | TypeScript imports consistent | PASS (static) |
| cross-cutting.spec.ts syntax validity | 385-line file | TypeScript imports consistent | PASS (static) |
| navigation.spec.ts syntax validity | 309-line file | TypeScript imports consistent | PASS (static) |
| Full suite 100% pass rate | 60-03-SUMMARY admits 209 failures | Pre-existing failures in 35 other spec files | FAIL |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| E2E-20 | 60-01-PLAN.md | Tests verify field mode hub, canvassing, phone banking, offline queue, tour (FIELD-01..10, OFFLINE-01..03, TOUR-01..03) | PARTIAL | Spec exists with all 16 test IDs. FIELD-08/09/10 have untracked conditional skips. REQUIREMENTS.md still shows `- [ ]` unchecked. |
| E2E-21 | 60-02-PLAN.md | Tests verify navigation, empty states, loading skeletons, error boundaries, form guards, toasts (NAV-01..03, UI-01..03, CROSS-01..03) | VERIFIED | cross-cutting.spec.ts (6 tests) and navigation.spec.ts (3 tests) cover all 9 test cases. REQUIREMENTS.md still shows `- [ ]` unchecked — needs updating. |
| VAL-01 | 60-03-PLAN.md | All E2E tests pass at 100% against local Docker Compose | BLOCKED | 60-03-SUMMARY confirms 209 failures from pre-existing specs. Phase 60 fixed only its own 3 spec files. REQUIREMENTS.md marks this `[x]` complete, which contradicts the evidence. |
| VAL-02 | 60-03-PLAN.md | All bugs discovered during testing are fixed and verified | PARTIAL | 60-BUGS.md documents 0 app bugs. But 4 conditional test.skip() calls lack BUG-XX references. REQUIREMENTS.md marks this `[x]` complete. |

### Orphaned Requirements Check

REQUIREMENTS.md maps the following to Phase 60 that were not claimed in any plan's `requirements` field: none. All 4 IDs (E2E-20, E2E-21, VAL-01, VAL-02) appear in plan frontmatter.

However, the REQUIREMENTS.md traceability table shows an **internal inconsistency**: E2E-20 and E2E-21 are `Pending` while VAL-01 and VAL-02 are `Complete`. VAL-01 depends on E2E-20/E2E-21 being completed, so this cannot be correct.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/field-mode.volunteer.spec.ts` | 708, 752, 796 | `test.skip(true, "No voters available...")` without BUG-XX reference | Warning | Phone banking tests (FIELD-08/09/10) may silently skip on every run, providing no actual coverage of phone banking in field mode. D-08 explicitly required all skips to reference a BUG-XX ID. |
| `web/e2e/field-mode.volunteer.spec.ts` | 564 | `test.skip(true, "Walk list appears completed")` without BUG-XX | Info | FIELD-07 (inline survey) may consistently skip if walk list is already completed from prior test run. Not a hard bug but needs investigation. |
| 35 pre-existing spec files | varied | `waitForURL(/(campaigns|org)/)` — broken URL pattern not fixed | Blocker | These 35 specs are the source of the 209 failures admitted in 60-03-SUMMARY. VAL-01 cannot be satisfied until these are fixed. |

---

## Human Verification Required

### 1. Phase 60 Spec Pass Rate

**Test:** Run `cd web && npx playwright test field-mode.volunteer cross-cutting navigation --reporter=line` against the running Docker Compose stack.
**Expected:** All 25 tests pass or skip (with acceptable reasons). Zero failures.
**Why human:** Cannot run Playwright from verification context. The SUMMARY claims these were fixed, but the "No voters available" conditional skips in FIELD-08/09/10 raise doubt about whether the phone banking tests actually execute or always skip.

### 2. Phone Banking Assignment Verification

**Test:** Observe whether FIELD-08, FIELD-09, FIELD-10 actually run (green or red) versus skip.
**Expected:** The `assignCaller()` helper in `beforeAll` should successfully assign the volunteer to a phone bank session, making voters available. If the tests skip, the `assignCaller()` setup is not working.
**Why human:** The conditional skip logic cannot be evaluated statically. Only a live run reveals whether the beforeAll setup successfully provides phone banking voters.

### 3. REQUIREMENTS.md Update

**Test:** Review whether REQUIREMENTS.md checkbox state for E2E-20 and E2E-21 should be updated to `[x]`.
**Expected:** If the Phase 60 specs are accepted as passing (with understood skips), both E2E-20 and E2E-21 should be checked. VAL-01 should remain unchecked until the full suite 209-failure problem is resolved.
**Why human:** This is a project management decision requiring human judgment about what "complete" means given the partial state.

---

## Gaps Summary

### Gap 1: VAL-01 — Full Suite Pass Rate (Blocker)

This is the most significant gap. The phase goal explicitly states "All E2E tests pass at 100% against local Docker Compose." The 60-03-SUMMARY admits 209 failures across 430 tests. These failures come from 35 spec files written in previous phases (58/59) that use a broken `waitForURL(/(campaigns|org)/)` pattern. Phase 60 fixed this pattern in its own 3 new spec files but did not fix it in the pre-existing specs.

The plan for Plan 03 included a task to "run full suite and fix test bugs" — the fix was applied incompletely. The phase goal was not achieved because "all E2E tests" means the full suite, not just Phase 60's new specs.

### Gap 2: E2E-20 Phone Banking Coverage (Warning)

FIELD-08, FIELD-09, and FIELD-10 tests use conditional `test.skip()` without BUG-XX references when "No voters available in calling session." This means phone banking field mode may be receiving zero test coverage on every run. The root cause is unclear — it may be a data setup issue (assignCaller not working) or an app issue (phone bank session has no voters). Either way, it is untracked and untested per the plan's own requirements.

### Gap 3: REQUIREMENTS.md State Inconsistency (Warning)

The REQUIREMENTS.md marks E2E-20 and E2E-21 as `[ ]` Pending while marking VAL-01 and VAL-02 as `[x]` Complete. This is logically inconsistent since VAL-01 ("all tests pass") cannot be true if E2E-20 and E2E-21 (which define what tests must exist) are still pending. The REQUIREMENTS.md was not updated after Phase 60 execution.

---

_Verified: 2026-03-29T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
