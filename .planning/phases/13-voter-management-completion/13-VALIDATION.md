---
phase: 13
slug: voter-management-completion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + happy-dom + @testing-library/react |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose` |
| **Full suite command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage` |
| **Estimated runtime** | ~30 seconds (quick), ~60 seconds (coverage) |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose`
- **After every plan wave:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green (95% coverage thresholds)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 0 | VOTR-01, VOTR-02 | unit | `npm run test -- --run src/hooks/useVoterContacts.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 0 | VOTR-03, VOTR-04, VOTR-11 | unit | `npm run test -- --run src/hooks/useVoters.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 0 | VOTR-05, VOTR-06 | unit | `npm run test -- --run src/hooks/useVoterTags.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-04 | 01 | 0 | VOTR-07, VOTR-08, VOTR-09 | unit | `npm run test -- --run src/hooks/useVoterLists.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-05 | 01 | 0 | VOTR-10 | unit | `npm run test -- --run src/components/voters/VoterFilterBuilder.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useVoterContacts.test.ts` — stubs for VOTR-01, VOTR-02 (set-primary URL fix)
- [ ] `web/src/hooks/useVoters.test.ts` — stubs for VOTR-03, VOTR-04, VOTR-11
- [ ] `web/src/hooks/useVoterTags.test.ts` — stubs for VOTR-05, VOTR-06
- [ ] `web/src/hooks/useVoterLists.test.ts` — stubs for VOTR-07, VOTR-08, VOTR-09
- [ ] `web/src/components/voters/VoterFilterBuilder.test.tsx` — stubs for VOTR-10

*All test files are new — Wave 0 must create them before implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Voter detail tabs render with correct data | VOTR-01 | Visual layout verification | Open voter detail page, verify Contacts/Tags/Lists/Notes tabs display |
| Dynamic list auto-populates via filter_query | VOTR-08 | End-to-end filter execution | Create dynamic list, set filter criteria, verify members populate |
| Advanced search composable filter UI | VOTR-10 | UX interaction flow | Open voters page, use filter builder, verify results update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
