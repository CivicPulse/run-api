---
phase: 30
slug: field-layout-shell-volunteer-landing
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
validated: 2026-03-16
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit) + Playwright 1.58.x (e2e) + pytest 7.x (backend) |
| **Config file** | `web/vitest.config.ts` (unit), `web/playwright.config.ts` (e2e), `pytest.ini` (backend) |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run && npx playwright test e2e/phase30-field-layout.spec.ts && cd .. && uv run pytest tests/test_field_me.py` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 0 | NAV-01 | e2e | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | ✅ | ✅ green |
| 30-01-02 | 01 | 0 | NAV-02 | unit | `cd web && npx vitest run src/components/field/AssignmentCard.test.tsx` | ✅ | ✅ green |
| 30-01-03 | 01 | 0 | NAV-03 | e2e | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | ✅ | ✅ green |
| 30-01-04 | 01 | 0 | NAV-04 | unit | `cd web && npx vitest run src/components/field/FieldHeader.test.tsx` | ✅ | ✅ green |
| 30-01-05 | 01 | 0 | NAV-02 | unit | `cd web && npx vitest run src/hooks/useFieldMe.test.ts` | ✅ | ✅ green |
| 30-01-06 | 01 | 0 | NAV-02 | unit | `uv run pytest tests/test_field_me.py` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/e2e/phase30-field-layout.spec.ts` — 9 e2e tests for NAV-01 (5) and NAV-03 (4)
- [x] `web/src/components/field/FieldHeader.test.tsx` — 12 unit tests for NAV-03 (back arrow), NAV-04 (help button), avatar menu
- [x] `web/src/components/field/AssignmentCard.test.tsx` — 9 unit tests for NAV-02 (card rendering, navigation, progress)
- [x] `web/src/hooks/useFieldMe.test.ts` — 6 unit tests for hook behavior, error states, cache
- [x] `tests/test_field_me.py` — 5 unit tests for backend `/field/me` endpoint (pytest)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pull-to-refresh gesture | NAV-02 | Touch gesture interaction | Open /field/{id} on mobile, pull down, verify spinner and data refresh |
| Mobile-optimized feel | NAV-01 | Subjective visual quality | View /field/{id} on 375px viewport, verify native-app feel |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-16

| Metric | Count |
|--------|-------|
| Gaps found | 5 |
| Resolved | 5 |
| Escalated | 0 |
