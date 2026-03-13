---
phase: 22
slug: final-integration-fixes
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
validated: 2026-03-13
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react (happy-dom) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose {testfile}` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run {changed-test-file} -x`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 0 | PHON-05 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/call-lists/\$callListId.test.tsx -x` | ✅ | ✅ green |
| 22-01-02 | 01 | 0 | INFR-01, CALL-07 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | ✅ | ✅ green |
| 22-01-03 | 01 | 1 | PHON-05 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/call-lists/\$callListId.test.tsx -x` | ✅ | ✅ green |
| 22-01-04 | 01 | 1 | INFR-01, CALL-07 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Role badge visual styling matches Phase 20 | PHON-05 | Visual consistency check | Compare claimed_by column badges with session detail caller badges |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-13

---

## Validation Audit 2026-03-13

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 11 tests across 2 test files pass green. No validation gaps detected.
