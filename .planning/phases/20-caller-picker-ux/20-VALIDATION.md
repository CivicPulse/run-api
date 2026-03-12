---
phase: 20
slug: caller-picker-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
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
| 20-01-01 | 01 | 1 | PHON-03a | unit | `cd web && npx vitest run ...index.test.tsx -t "combobox"` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | PHON-03b | unit | `cd web && npx vitest run ...index.test.tsx -t "Add Caller"` | ✅ (needs update) | ⬜ pending |
| 20-01-03 | 01 | 1 | PHON-03c | unit | `cd web && npx vitest run ...index.test.tsx -t "already-assigned"` | ❌ W0 | ⬜ pending |
| 20-01-04 | 01 | 1 | PHON-03d | unit | `cd web && npx vitest run ...index.test.tsx -t "display name"` | ❌ W0 | ⬜ pending |
| 20-01-05 | 01 | 1 | PHON-03e | unit | `cd web && npx vitest run ...index.test.tsx -t "progress.*display name"` | ❌ W0 | ⬜ pending |
| 20-01-06 | 01 | 1 | PHON-03f | unit | `cd web && npx vitest run ...index.test.tsx -t "fallback"` | ❌ W0 | ⬜ pending |
| 20-01-07 | 01 | 1 | PHON-03g | unit | `cd web && npx vitest run ...index.test.tsx -t "all.*assigned"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update existing test mock setup to include `useMembers` mock in `index.test.tsx`
- [ ] Add `CampaignMember` test factory helpers (similar to existing `makeCaller`, `makeSession`)
- [ ] Update existing "Add Caller" test to use combobox interaction pattern instead of text input
- [ ] Add new test cases for: already-assigned filtering, name display in tables, fallback behavior, empty state

*Existing `index.test.tsx` covers basic session CRUD — needs mock expansion for member picker tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combobox styling matches campaign members list | PHON-03a | Visual consistency | Open AddCallerDialog, compare picker option styling with Settings > Members |
| Role badge renders correctly across viewport sizes | PHON-03d/e | Visual rendering | Resize browser, check callers table name + badge layout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
