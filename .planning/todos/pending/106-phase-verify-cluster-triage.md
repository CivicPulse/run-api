# Deferred: Phase-Verify Cluster + Misc Playwright Triage

**Source:** Phase 106 baseline — `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md` §Playwright
**Source decision:** `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` §D-15 (Scope Decision 2026-04-10)
**Deferred from:** v1.18 Milestone, Phase 106 (Test Baseline Trustworthiness)
**Target milestone:** v1.19 (or a future "test infra hardening" phase)
**Requirement tie-in:** extends TEST-04 coverage (Phase 106 closes TEST-04 for the IN-scope surface only)

## Why deferred

The phase 106 baseline capture (commits `9199a81` initial + `0df3298` Playwright re-capture) revealed **152 real Playwright hard fails across 49 spec files** after an environment unblock. Per user decision D-15, Phase 106 was narrowed to the highest-signal clusters for v1.18 Field UX Polish:

- pytest (2 fails, in scope)
- vitest (65 fails, in scope)
- Playwright rbac cluster (44 fails, in scope — cluster fix expected)
- Playwright pitfall-5 deletes (~11 fails, in scope — delete-with-reference to phases 107/109)

The remaining ~97 Playwright hard fails cover older milestone phases (12-35) or isolated scattered failures that are NOT on the v1.18 Field UX critical path. They are deferred here so they don't burn the Phase 106 budget on work that doesn't move v1.18 forward.

**Before the v1.18 milestone closes, every failing test listed below MUST be marked with a D-10-compliant justified `test.skip` referencing this todo file**, so the Phase 106-05 exit gate can run cleanly without these tests breaking the green bar. The skip marker template is:

```ts
test.skip(
  "<test name>",
  "Deferred to v1.19 — pre-existing failure, phase-verify cluster, see .planning/todos/pending/106-phase-verify-cluster-triage.md"
)
```

(For `test.describe.skip` blocks and `test.skip(true, ...)` runtime skips, use the same justification string.)

## Phase-verify cluster (primary defer target — 51 failing tests across 9 specs)

These specs cover behaviors from older phases (phase 12 through phase 35) that predate v1.18. Many test UI patterns that have since evolved; some may reference removed features. All are candidates for a dedicated "old-phase verify cleanup" effort in v1.19.

| Spec | Failing tests | Phase covered | Recommended approach |
|------|---------------|---------------|----------------------|
| e2e/phase13-voter-verify.spec.ts | 11 | Phase 13 (voter features) | Audit vs current voter UI; many likely obsolete |
| e2e/phase12-settings-verify.spec.ts | 10 | Phase 12 (campaign settings) | Audit vs current settings UI |
| e2e/phase21-integration-polish.spec.ts | 6 | Phase 21 polish | Likely salvageable, has 1 D-11 known-skip at line 409 |
| e2e/phase29-verify.spec.ts | 6 | Phase 29 | Audit |
| e2e/phase14-import-verify.spec.ts | 5 | Phase 14 (import) | Audit vs current import wizard |
| e2e/phase27-filter-wiring.spec.ts | 5 | Phase 27 (voter filters) | Likely mechanical selector updates |
| e2e/phase32-verify.spec.ts | 4 | Phase 32 (phone banking field mode) | **Also a pitfall-5 candidate** — phase 107 CANV touches phone banking. May migrate to delete. |
| e2e/phase20-caller-picker-verify.spec.ts | 3 | Phase 20 (caller picker) | Audit |
| e2e/phase35-touch-targets.spec.ts | 1 | Phase 35 (WCAG touch targets) | Likely mechanical |

**Subtotal:** 51 failing tests in the phase-verify cluster.

## Miscellaneous deferred specs (~46 failing tests across ~40 specs)

Failing specs that are neither in the rbac cluster, nor pitfall-5 candidates, nor historical hit-list items from RESEARCH.md, nor in the phase-verify cluster above. Mostly 1-2 fails each with no obvious cluster pattern. Deferred to be handled as a flat list in v1.19.

| Count | Spec | Notes |
|-------|------|-------|
| 5 | e2e/uat-tooltip-popovers.spec.ts | UAT tooltip popovers |
| 3 | e2e/voter-isolation.spec.ts | Voter tenant isolation |
| 3 | e2e/volunteer-signup.spec.ts | Volunteer signup |
| 2 | e2e/auth-guard-redirect.spec.ts | Auth guard redirects |
| 1 | e2e/a11y-phone-bank.spec.ts | A11Y phone bank flow |
| 1 | e2e/call-lists-dnc.spec.ts | Call lists + DNC |
| 1 | e2e/call-page-checkin.spec.ts | Call page check-in enforcement |
| 1 | e2e/campaign-archive.spec.ts | Campaign archive flow |
| 1 | e2e/connected-journey.spec.ts | Connected user journey |
| 1 | e2e/data-validation.spec.ts | Form validation |
| 1 | e2e/navigation.spec.ts | Navigation |
| 1 | e2e/org-management.spec.ts | Org management |
| 1 | e2e/phone-banking.spec.ts | Phone banking |
| 1 | e2e/role-gated.volunteer.spec.ts | Role-gated volunteer |
| 1 | e2e/turfs.spec.ts | Turfs |
| 1 | e2e/uat-overlap-highlight.spec.ts | UAT overlap highlight |
| 1 | e2e/uat-volunteer-manager.spec.ts | UAT volunteer manager |
| 1 | e2e/voter-import.spec.ts | Voter import |
| 1 | e2e/volunteers.spec.ts | Volunteers |

Plus any historical hit-list specs with 1 fail each that the user later decides to defer rather than fix:
- e2e/shifts.spec.ts, e2e/surveys.spec.ts, e2e/voter-tags.spec.ts,
  e2e/voter-filters.spec.ts, e2e/voter-contacts.spec.ts,
  e2e/volunteer-tags-availability.spec.ts, e2e/voter-lists.spec.ts,
  e2e/voter-notes.spec.ts, e2e/campaign-settings.spec.ts,
  e2e/voter-crud.spec.ts

Whether these go here or get triaged in 106-04 is at the executor's discretion under the D-01 15-minute time box.

**Subtotal:** ~29 mandatory-defer + ~11 optional-defer ≈ 40-46 misc tests.

## Total deferred scope

| Cluster | Tests |
|---------|-------|
| Phase-verify cluster (9 specs) | 51 |
| Miscellaneous (mandatory defer) | ~29 |
| Historical hit-list (optional defer) | ~11 |
| **TOTAL deferred ceiling** | **~91** |

The in-scope ceiling is therefore **~219 - ~91 = ~128 triage items** for plans 106-02/03/04 (plus the cluster-collapse math: rbac 44 → likely 1-2 fixes, vitest shifts 34 → 1 fix, pitfall-5 11 → 3 delete commits).

## Reopen criteria

This todo should be reopened when ANY of these happen:

1. **v1.19 planning kickoff** — treat as a discoverable backlog item during milestone scoping.
2. **A phase in v1.18 or later trips over a deferred spec** — e.g. if phase 108 SELECT work makes `phase29-verify.spec.ts` suddenly relevant again, that phase's scope should absorb the fix instead of leaving it deferred.
3. **Test infra hardening phase** — if a dedicated "fix all pre-existing test debt" phase is proposed.
4. **CI pipeline surfaces these as new failures** — shouldn't happen because they're justified-skipped, but if the skip marker is accidentally removed, this todo is the authority for restoring it.

## Cross-references

- `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md` — the source of truth for the 152 Playwright fails and which cluster each belongs to.
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` §D-15 — the locked-in scope decision that created this deferral.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/playwright-baseline-v2.txt` — raw log from the post-env-unblock Playwright run (gitignored). Run `grep '✘' <file> | grep <spec-name>` for the exact failing test names per spec.
- Phase 106-01 SUMMARY: `.planning/phases/106-test-baseline-trustworthiness/106-01-SUMMARY.md`

---

*Created: 2026-04-10*
*Author: phase 106-01 executor*
*Status: PENDING — awaits v1.19 kickoff or reopen trigger*
