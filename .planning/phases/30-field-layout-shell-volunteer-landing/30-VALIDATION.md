---
phase: 30
slug: field-layout-shell-volunteer-landing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
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
| **Full suite command** | `cd web && npx vitest run && npx playwright test && cd .. && uv run pytest tests/test_field_me.py` |
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
| 30-01-01 | 01 | 0 | NAV-01 | e2e stub | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 0 | NAV-02 | unit stub | `cd web && npx vitest run src/components/field/AssignmentCard.test.tsx` | ❌ W0 | ⬜ pending |
| 30-01-03 | 01 | 0 | NAV-03 | e2e stub | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 0 | NAV-04 | unit stub | `cd web && npx vitest run src/components/field/FieldHeader.test.tsx` | ❌ W0 | ⬜ pending |
| 30-01-05 | 01 | 0 | NAV-02 | unit stub | `cd web && npx vitest run src/hooks/useFieldMe.test.ts` | ❌ W0 | ⬜ pending |
| 30-01-06 | 01 | 0 | NAV-02 | unit | `uv run pytest tests/test_field_me.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase30-field-layout.spec.ts` — e2e stubs for NAV-01, NAV-02, NAV-03
- [ ] `web/src/components/field/FieldHeader.test.tsx` — covers NAV-03, NAV-04
- [ ] `web/src/components/field/AssignmentCard.test.tsx` — covers NAV-02
- [ ] `web/src/hooks/useFieldMe.test.ts` — covers hook behavior, error states
- [ ] `tests/test_field_me.py` — covers backend `/field/me` endpoint (pytest)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pull-to-refresh gesture | NAV-02 | Touch gesture interaction | Open /field/{id} on mobile, pull down, verify spinner and data refresh |
| Mobile-optimized feel | NAV-01 | Subjective visual quality | View /field/{id} on 375px viewport, verify native-app feel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
