---
phase: 59
slug: e2e-advanced-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @playwright/test 1.58.2 |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx playwright test <spec-file> --project=chromium` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test <modified-spec> --project=chromium`
- **After every plan wave:** Run `cd web && npx playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | E2E-04 | e2e | `cd web && npx playwright test voter-import.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | E2E-05 | e2e | `cd web && npx playwright test data-validation.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-01-03 | 01 | 1 | E2E-06 | e2e | `cd web && npx playwright test voter-filters.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 1 | E2E-12 | e2e | `cd web && npx playwright test turfs.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 1 | E2E-13 | e2e | `cd web && npx playwright test walk-lists.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-02-03 | 02 | 1 | E2E-14 | e2e | `cd web && npx playwright test call-lists-dnc.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-03-01 | 03 | 2 | E2E-15 | e2e | `cd web && npx playwright test phone-banking.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-03-02 | 03 | 2 | E2E-16 | e2e | `cd web && npx playwright test surveys.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-04-01 | 04 | 2 | E2E-17 | e2e | `cd web && npx playwright test volunteers.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-04-02 | 04 | 2 | E2E-18 | e2e | `cd web && npx playwright test volunteer-tags-availability.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 59-04-03 | 04 | 2 | E2E-19 | e2e | `cd web && npx playwright test shifts.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/fixtures/l2-test-voters.csv` — L2 fixture with 50+ rows matching 55-column format
- [ ] `web/e2e/fixtures/macon-bibb-turf.geojson` — GeoJSON polygon fixture for Macon-Bibb area
- [ ] Delete old superseded specs: `voter-import.spec.ts`, `phone-bank.spec.ts`, `volunteer-management.spec.ts`, `turf-creation.spec.ts`, `filter-chips.spec.ts`

*Existing Playwright infrastructure from Phase 57/58 covers auth, config, and CI sharding.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map canvas rendering | E2E-12 (TURF-03) | Leaflet rendering unreliable in headless | Verify turfs appear on map visually in headed mode |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
