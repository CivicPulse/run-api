---
phase: 12
slug: shared-infrastructure-campaign-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + Testing Library React 16.3.2 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | INFR-01 | unit | `cd web && npx vitest run src/hooks/usePermissions.test.ts -x` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | INFR-01 | unit | `cd web && npx vitest run src/components/shared/RequireRole.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | INFR-02 | unit | `cd web && npx vitest run src/hooks/useFormGuard.test.ts -x` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | INFR-03 | unit | `cd web && npx vitest run src/components/shared/DataTable.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | CAMP-01 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/general.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | CAMP-02 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/danger.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | CAMP-03 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/members.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 2 | CAMP-05 | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/members.test.tsx -x` | ❌ W0 | ⬜ pending |
| 12-02-05 | 02 | 2 | CAMP-06 | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | ❌ W0 | ⬜ pending |
| 12-02-06 | 02 | 2 | CAMP-08 | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/usePermissions.test.ts` — stubs for INFR-01 (role extraction + hasRole)
- [ ] `web/src/components/shared/RequireRole.test.tsx` — stubs for INFR-01 (conditional rendering)
- [ ] `web/src/hooks/useFormGuard.test.ts` — stubs for INFR-02 (navigation blocking)
- [ ] `web/src/components/shared/DataTable.test.tsx` — stubs for INFR-03 (table rendering, sorting, empty state)
- [ ] `web/src/hooks/useMembers.test.ts` — stubs for CAMP-05/06/07/08 (member hooks)
- [ ] `web/src/hooks/useInvites.test.ts` — stubs for CAMP-03/04 (invite hooks)
- [ ] Test utilities: mock for `useAuthStore` with configurable role claims

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unsaved changes warning on browser close | INFR-02 | `beforeunload` event cannot be programmatically tested | 1. Modify form field 2. Close tab 3. Verify browser prompt appears |
| Campaign delete confirmation UX flow | CAMP-02 | Multi-step modal interaction with typed confirmation | 1. Click delete 2. Verify modal shows campaign name 3. Type name to confirm 4. Verify deletion |
| Ownership transfer confirmation | CAMP-08 | Complex confirmation flow with role change side effects | 1. Click transfer 2. Select new owner 3. Confirm 4. Verify role changes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
