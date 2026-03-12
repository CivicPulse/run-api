---
phase: 20
slug: caller-picker-ux
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
audited: 2026-03-12
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | PHON-03a | unit | `cd web && npx vitest run ...index.test.tsx -t "combobox"` | ✅ | ✅ green |
| 20-01-02 | 01 | 1 | PHON-03b | unit | `cd web && npx vitest run ...index.test.tsx -t "Add Caller"` | ✅ | ✅ green |
| 20-01-03 | 01 | 1 | PHON-03c | unit | `cd web && npx vitest run ...index.test.tsx -t "already-assigned"` | ✅ | ✅ green |
| 20-01-04 | 01 | 1 | PHON-03d | unit | `cd web && npx vitest run ...index.test.tsx -t "display name"` | ✅ | ✅ green |
| 20-01-05 | 01 | 1 | PHON-03e | unit | `cd web && npx vitest run ...index.test.tsx -t "progress.*display name"` | ✅ | ✅ green |
| 20-01-06 | 01 | 1 | PHON-03f | unit | `cd web && npx vitest run ...index.test.tsx -t "fallback"` | ✅ | ✅ green |
| 20-01-07 | 01 | 1 | PHON-03g | unit | `cd web && npx vitest run ...index.test.tsx -t "all.*assigned"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combobox styling matches campaign members list | PHON-03a | Visual consistency | Open AddCallerDialog, compare picker option styling with Settings > Members |
| Role badge renders correctly across viewport sizes | PHON-03d/e | Visual rendering | Resize browser, check callers table name + badge layout |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-12

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 7 requirements have automated test coverage across 18 passing test cases in `index.test.tsx`. No gaps detected during audit.
