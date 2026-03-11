---
phase: 14
slug: voter-import-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose src/hooks/useImports.test.ts` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/hooks/useImports.test.ts`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 0 | IMPT-01..07 | unit stubs | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | IMPT-01 | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | IMPT-02, IMPT-03 | unit (component) | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | ❌ W0 | ⬜ pending |
| 14-02-03 | 02 | 1 | IMPT-04 | unit (component) | `cd web && npx vitest run src/components/voters/MappingPreview.test.tsx` | ❌ W0 | ⬜ pending |
| 14-02-04 | 02 | 1 | IMPT-05, IMPT-07 | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | IMPT-06 | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useImports.test.ts` — stubs for IMPT-01, IMPT-02, IMPT-05, IMPT-06, IMPT-07
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` — stubs for IMPT-03
- [ ] `web/src/components/voters/MappingPreview.test.tsx` — stubs for IMPT-04
- [ ] (Optional) Install shadcn Progress component: `cd web && npx shadcn@latest add progress`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop file zone accepts file | IMPT-01 | Browser drag events not reliably testable in JSDOM | Drag a CSV onto the upload zone; confirm upload starts |
| XHR progress bar advances during upload | IMPT-01 | XHR upload.onprogress requires real network | Upload a large CSV; confirm progress bar moves |
| Resume wizard from URL params in browser | IMPT-07 | Full router integration with real navigation | Start import, navigate away, paste `?jobId=X&step=2` URL, confirm correct step loads |
| Admin-only guard blocks non-admin user | all | Role-based UI gating requires auth context | Log in as non-admin; confirm import routes show permission denied |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
