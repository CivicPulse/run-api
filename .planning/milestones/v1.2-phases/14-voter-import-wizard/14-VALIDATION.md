---
phase: 14
slug: voter-import-wizard
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
validated: 2026-03-12
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
| **E2E Framework** | Playwright |
| **E2E run command** | `cd web && npx playwright test e2e/phase14-import-verify.spec.ts` |

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
| 14-01-01 | 01 | 0 | IMPT-01..07 | unit stubs | `cd web && npx vitest run src/hooks/useImports.test.ts` | ✅ | ✅ green |
| 14-02-01 | 02 | 1 | IMPT-01 | unit (XHR mock) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ✅ | ✅ green |
| 14-02-02 | 02 | 1 | IMPT-02, IMPT-03 | unit (component + hook) | `cd web && npx vitest run src/hooks/useImports.test.ts src/components/voters/ColumnMappingTable.test.tsx` | ✅ | ✅ green |
| 14-02-03 | 02 | 1 | IMPT-04 | unit (component) | `cd web && npx vitest run src/components/voters/MappingPreview.test.tsx` | ✅ | ✅ green |
| 14-02-04 | 02 | 1 | IMPT-05, IMPT-07 | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ✅ | ✅ green |
| 14-03-01 | 03 | 2 | IMPT-06 | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ✅ | ✅ green |
| 14-e2e | all | — | IMPT-01..07 | e2e (smoke) | `cd web && npx playwright test e2e/phase14-import-verify.spec.ts` | ✅ | ✅ green (requires live server) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/hooks/useImports.test.ts` — stubs for IMPT-01, IMPT-02, IMPT-05, IMPT-06, IMPT-07 → all promoted to passing tests
- [x] `web/src/components/voters/ColumnMappingTable.test.tsx` — stubs for IMPT-03 → 7 passing tests
- [x] `web/src/components/voters/MappingPreview.test.tsx` — stubs for IMPT-04 → 4 passing tests
- [x] (Optional) Install shadcn Progress component: `cd web && npx shadcn@latest add progress` → installed

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-12

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

### Audit Details

| Gap | Requirement | Resolution |
|-----|-------------|------------|
| 4 XHR unit test todos | IMPT-01 | Promoted to real tests via MockXHR class |
| 1 detect columns todo | IMPT-02 | Promoted to real test via vi.mock + renderHook |
| No Playwright e2e tests | IMPT-01..07 | Created phase14-import-verify.spec.ts (5 smoke tests) |

**Pre-audit:** 27 passing, 5 todo, 0 e2e
**Post-audit:** 32 passing, 0 todo, 5 e2e smoke tests
