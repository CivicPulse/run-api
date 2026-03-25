---
phase: 44
slug: ui-ux-polish-frontend-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc) for type-checking |
| **Config file** | `web/tsconfig.json` |
| **Quick run command** | `cd web && npx tsc --noEmit 2>&1 \| head -20` |
| **Full suite command** | `cd web && npx tsc --noEmit` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit 2>&1 | head -20`
- **After every plan wave:** Run `cd web && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | OBS-05 | type-check | `cd web && npx tsc --noEmit` | N/A | pending |
| 44-02-01 | 02 | 1 | UX-01 | type-check | `cd web && npx tsc --noEmit` | N/A | pending |
| 44-02-02 | 02 | 1 | UX-02 | type-check | `cd web && npx tsc --noEmit` | N/A | pending |
| 44-03-01 | 03 | 2 | OBS-06, OBS-07 | type-check + grep | `cd web && npx tsc --noEmit` | N/A | pending |
| 44-04-01 | 04 | 2 | UX-03, UX-04 | type-check + grep | `cd web && npx tsc --noEmit` | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar slides over content (not push) on desktop | UX-01 | Visual layout behavior | Open app, toggle sidebar, verify content doesn't shift |
| Volunteer form shows correct mode based on radio toggle | UX-02 | ZITADEL invite flow | Create volunteer with both "Add record" and "Invite" options |
| Empty states show contextual messages | OBS-06 | Content quality | Check each list page with no data |
| Loading skeletons match content layout | OBS-07 | Visual match | Load each page and verify skeleton shape matches content |
| Tooltips appear at decision points | UX-03, UX-04 | Interaction quality | Hover/click info icons at each annotated decision point |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
