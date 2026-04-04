---
phase: 66
slug: import-wizard-flow-recovery-progress-accuracy
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
---

# Phase 66 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest 4.0.18` + React Testing Library |
| **Config file** | `web/package.json` |
| **Quick run command** | `npm --prefix web test -- --run src/hooks/useImports.test.ts src/routes/campaigns/$campaignId/voters/imports/new.test.tsx` |
| **Phase verification command** | `npm --prefix web test -- --run src/hooks/useImports.test.ts src/components/voters/ImportProgress.test.tsx src/routes/campaigns/$campaignId/voters/imports/new.test.tsx` |
| **Estimated runtime** | < 5 seconds |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Automated Command | Status |
|---------|------|-------------|-------------------|--------|
| 66-01-01 | 01 | PROG-04, PROG-05 | `npm --prefix web test -- --run src/hooks/useImports.test.ts src/routes/campaigns/$campaignId/voters/imports/new.test.tsx` | ✅ |
| 66-01-02 | 01 | PROG-04, PROG-05 | `npm --prefix web test -- --run src/routes/campaigns/$campaignId/voters/imports/new.test.tsx` | ✅ |
| 66-02-01 | 02 | PROG-04, PROG-05 | `rg -n "PROG-04|PROG-05" .planning/REQUIREMENTS.md .planning/milestones/v1.11-REQUIREMENTS.md` | ✅ |
| 66-02-02 | 02 | PROG-04, PROG-05 | `rg -n "INT-03|FLOW-01|PROG-04|PROG-05" .planning/v1.11-MILESTONE-AUDIT.md` | ✅ |

## Validation Sign-Off

- [x] All tasks have automated verification
- [x] Focused verification stays comfortably under 5 seconds
- [x] `nyquist_compliant: true` set in frontmatter
