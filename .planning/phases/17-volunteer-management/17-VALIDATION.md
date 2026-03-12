---
phase: 17
slug: volunteer-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 0 | VLTR-01,02,03,05 | unit | `cd web && npx vitest run src/hooks/useVolunteers.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 0 | VLTR-07 | unit | `cd web && npx vitest run src/hooks/useVolunteerTags.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 0 | VLTR-06 | unit | `cd web && npx vitest run src/hooks/useVolunteerAvailability.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 0 | VLTR-09 | unit | `cd web && npx vitest run src/hooks/useVolunteerHours.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | VLTR-01 | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/roster/index.test.tsx -x` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 1 | VLTR-02 | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/register/index.test.tsx -x` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 1 | VLTR-03 | unit | `cd web && npx vitest run src/components/volunteers/VolunteerEditSheet.test.tsx -x` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 2 | VLTR-04,08 | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/\\$volunteerId/index.test.tsx -x` | ❌ W0 | ⬜ pending |
| 17-06-01 | 06 | 2 | VLTR-05 | unit | `cd web && npx vitest run src/hooks/useVolunteers.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-07-01 | 07 | 2 | VLTR-06,09 | unit | `cd web && npx vitest run src/hooks/useVolunteerAvailability.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useVolunteers.test.ts` — stubs for VLTR-01, VLTR-02, VLTR-03, VLTR-05
- [ ] `web/src/hooks/useVolunteerTags.test.ts` — stubs for VLTR-07
- [ ] `web/src/hooks/useVolunteerAvailability.test.ts` — stubs for VLTR-06
- [ ] `web/src/hooks/useVolunteerHours.test.ts` — stubs for VLTR-09

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar nav visual layout | VLTR-01 | Visual layout match to phone-banking pattern | Compare sidebar nav against phone-banking.tsx in browser |
| Skills badge pill truncation ("2 + N more") | VLTR-01 | Visual truncation behavior | Assign >2 skills, verify "... +N more" rendering |
| Timezone-correct availability display | VLTR-06 | Timezone interaction with native inputs | Add availability in non-UTC timezone, verify correct display |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
