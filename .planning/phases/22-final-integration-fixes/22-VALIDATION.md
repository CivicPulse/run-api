---
phase: 22
slug: final-integration-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
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
| 22-01-01 | 01 | 0 | PHON-05 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/call-lists/\$callListId.test.tsx -x` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 0 | INFR-01, CALL-07 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | ✅ (needs update) | ⬜ pending |
| 22-01-03 | 01 | 1 | PHON-05 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/call-lists/\$callListId.test.tsx -x` | ❌ W0 | ⬜ pending |
| 22-01-04 | 01 | 1 | INFR-01, CALL-07 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | ✅ (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx` — new file: membersById name resolution, role badge, truncated UUID fallback, unclaimed dash display
- [ ] Update `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` — add RequireRole mock (pattern from sessions/$sessionId/index.test.tsx lines 35-53), add tests for: buttons hidden for viewer, buttons visible for manager, Remove column absent for viewer, Remove column present for manager

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Role badge visual styling matches Phase 20 | PHON-05 | Visual consistency check | Compare claimed_by column badges with session detail caller badges |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
