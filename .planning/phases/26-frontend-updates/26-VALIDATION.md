---
phase: 26
slug: frontend-updates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (unit), Playwright 1.58.2 (e2e) |
| **Config file** | web/vitest.config.ts (unit), web/playwright.config.ts (e2e) |
| **Quick run command** | `cd web && npx tsc --noEmit && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx tsc --noEmit && npx vitest run --reporter=verbose && npx playwright test` |
| **Estimated runtime** | ~30 seconds (unit), ~120 seconds (full with e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx tsc --noEmit && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | FRNT-05 | compiler | `cd web && npx tsc --noEmit` | N/A | ⬜ pending |
| 26-01-02 | 01 | 1 | FRNT-05 | compiler | `cd web && npx tsc --noEmit` | N/A | ⬜ pending |
| 26-02-01 | 02 | 1 | FRNT-01 | e2e | `cd web && npx playwright test e2e/phase26-voter-detail.spec.ts` | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 1 | FRNT-01 | e2e | `cd web && npx playwright test e2e/phase26-voter-detail.spec.ts` | ❌ W0 | ⬜ pending |
| 26-03-01 | 03 | 2 | FRNT-02 | unit | `cd web && npx vitest run src/components/voters/VoterFilterBuilder.test.tsx` | ✅ (needs update) | ⬜ pending |
| 26-03-02 | 03 | 2 | FRNT-02 | unit | `cd web && npx vitest run src/components/voters/VoterFilterBuilder.test.tsx` | ✅ (needs update) | ⬜ pending |
| 26-04-01 | 04 | 2 | FRNT-03 | unit | `cd web && npx vitest run src/components/voters/VoterEditSheet.test.tsx` | ❌ W0 | ⬜ pending |
| 26-05-01 | 05 | 2 | FRNT-04 | unit | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | ✅ (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `cd web && npx shadcn@latest add accordion slider collapsible` — install shadcn wrapper components
- [ ] `web/src/components/voters/VoterFilterBuilder.test.tsx` — update existing tests for accordion structure
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` — update for grouped dropdown and expanded fields

*Existing infrastructure covers compiler checks and e2e framework.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Propensity badge color thresholds visually correct | FRNT-01 | Color perception is visual | Load voter with scores 80, 50, 20 — verify green, yellow, red badges |
| Dual-handle slider drag UX | FRNT-02 | Touch/drag interaction | Drag slider thumbs, verify range updates filter |
| Accordion open/close animation | FRNT-02 | Visual animation quality | Open/close sections, verify smooth transition |
| Collapsible mailing address in edit sheet | FRNT-03 | Visual interaction | Toggle mailing address section, verify data persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
