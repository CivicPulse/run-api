---
phase: 61
slug: ai-production-testing-instructions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (documentation phase — no code tests) |
| **Config file** | none |
| **Quick run command** | `test -f docs/production-testing-runbook.md && echo "exists"` |
| **Full suite command** | `grep -c "^### " docs/production-testing-runbook.md` (section count) |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Verify file exists and has expected sections
- **After every plan wave:** Count sections, verify smoke/extended tiers present
- **Before `/gsd:verify-work`:** Full document review against PROD-01 criteria
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | PROD-01 | file-check | `test -f docs/production-testing-runbook.md` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | PROD-01 | content-check | `grep "## Configuration" docs/production-testing-runbook.md` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 1 | PROD-01 | content-check | `grep "## Smoke Suite" docs/production-testing-runbook.md` | ❌ W0 | ⬜ pending |
| 61-01-04 | 01 | 1 | PROD-01 | content-check | `grep "## Extended Suite" docs/production-testing-runbook.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. This is a documentation-only phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Document completeness | PROD-01 | Content quality requires human review | Review all sections for clarity, accuracy, and completeness |
| Placeholder variables documented | PROD-01 | Semantic check | Verify ${PROD_URL} and other vars are listed in Configuration section |
| Health check section present | PROD-01 | Content accuracy | Verify deployment health checks match K8s probes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
