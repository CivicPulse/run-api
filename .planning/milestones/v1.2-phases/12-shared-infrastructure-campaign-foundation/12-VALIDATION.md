---
phase: 12
slug: shared-infrastructure-campaign-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
updated: 2026-03-12
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + Testing Library React 16.3.2 (unit) · Playwright (e2e) |
| **Config file** | `web/vitest.config.ts` (unit) · `web/playwright.debug.config.ts` (e2e) |
| **Quick run command (unit)** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command (unit)** | `cd web && npx vitest run --coverage` |
| **E2E run command** | `cd web && npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` |
| **Estimated runtime** | ~30s (unit) · ~2 min (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

### Unit Tests (Vitest)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 12-01-01 | 01 | 1 | INFR-01 | unit | `cd web && npx vitest run src/hooks/usePermissions.test.ts -x` | ✅ green |
| 12-01-02 | 01 | 1 | INFR-01 | unit | `cd web && npx vitest run src/components/shared/RequireRole.test.tsx -x` | ✅ green |
| 12-01-03 | 01 | 1 | INFR-02 | unit | `cd web && npx vitest run src/hooks/useFormGuard.test.ts -x` | ✅ green |
| 12-01-04 | 01 | 1 | INFR-03 | unit | `cd web && npx vitest run src/components/shared/DataTable.test.tsx -x` | ✅ green |
| 12-02-05 | 02 | 2 | CAMP-06 | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | ✅ green |
| 12-02-06 | 02 | 2 | CAMP-08 | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | ✅ green |
| 12-03-01 | 03 | 3 | CAMP-03/04 | unit | `cd web && npx vitest run src/hooks/useInvites.test.ts -x` | ✅ green |
| 12-03-02 | 03 | 3 | CAMP-05/07 | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | ✅ green |

### E2E Tests (Playwright)

| Task ID | Requirement | Test Description | Automated Command | Status |
|---------|-------------|-----------------|-------------------|--------|
| e2e-INFR-01 | INFR-01 | Gear icon visible in sidebar, navigates to settings | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-01 | CAMP-01 | General tab form loads, edit saves with toast | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-INFR-02 | INFR-02 | Dirty form blocks navigation, Keep editing stays on page | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-05 | CAMP-05 | Members table with Name/Email/Role/Joined columns and role badges | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-03 | CAMP-03 | Invite dialog opens with email input and role selector | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-04 | CAMP-04 | Pending Invites section heading visible, table or empty state | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-06 | CAMP-06 | Kebab menu opens role change dialog with Save button | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-07 | CAMP-07 | Kebab menu shows Remove member; confirmation dialog appears | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-02 | CAMP-02 | Delete dialog disabled until campaign name typed, then enabled | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |
| e2e-CAMP-08 | CAMP-08 | Transfer ownership dialog opens with admin selector | `npx playwright test e2e/phase12-settings-verify.spec.ts --config playwright.debug.config.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/hooks/usePermissions.test.ts` — 28 tests for INFR-01 (role extraction + hasRole)
- [x] `web/src/components/shared/RequireRole.test.tsx` — 8 tests for INFR-01 (conditional rendering)
- [x] `web/src/hooks/useFormGuard.test.ts` — 11 tests for INFR-02 (navigation blocking)
- [x] `web/src/components/shared/DataTable.test.tsx` — 12 tests for INFR-03 (table rendering, sorting, empty state)
- [x] `web/src/hooks/useMembers.test.ts` — tests for CAMP-05/06/07 (member hooks)
- [x] `web/src/hooks/useInvites.test.ts` — tests for CAMP-03/04 (invite hooks)
- [x] E2E tests for all 10 behavioral requirements: `web/e2e/phase12-settings-verify.spec.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unsaved changes warning on browser close | INFR-02 | `beforeunload` event cannot be programmatically tested | 1. Modify form field 2. Close tab 3. Verify browser prompt appears |

Note: CAMP-02 (delete type-to-confirm dialog flow) and CAMP-08 (transfer ownership dialog) are now fully covered by automated e2e tests. The previous "manual-only" classification is superseded.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 30s (unit) / ~2min (e2e)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete — 2026-03-12
