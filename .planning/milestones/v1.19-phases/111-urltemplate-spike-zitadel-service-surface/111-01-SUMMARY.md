---
phase: 111-urltemplate-spike-zitadel-service-surface
plan: "01"
subsystem: auth
tags: [zitadel, playwright, e2e, spike, urltemplate, invite-code]

requires:
  - phase: none
    provides: first phase of v1.19 milestone

provides:
  - urlTemplate deep-link spike verdict (FAIL)
  - Playwright E2E spike spec for invite flow verification
  - run-e2e.sh ZITADEL env guard for spike specs
  - Spike-failure diagnostic artifacts and root-cause analysis

affects: [111-02 through 111-06 (blocked), milestone replan]

tech-stack:
  added: []
  patterns:
    - "Playwright E2E spike pattern: provision throwaway ZITADEL user in beforeAll, drive hosted UI, cleanup in afterAll"
    - "run-e2e.sh env guard pattern: spec-scoped env validation before launch"

key-files:
  created:
    - web/e2e/invite-urltemplate-spike.spec.ts
    - .planning/phases/111-urltemplate-spike-zitadel-service-surface/111-SPIKE-VERDICT.md
    - .planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/
  modified:
    - web/scripts/run-e2e.sh
    - .env.example

key-decisions:
  - "urlTemplate deep-link spike FAILED: ZITADEL v4.10.1 bundles only legacy Go-templates login UI; v2 TypeScript login app (which honors urlTemplate) is a separate undeployed Next.js app"
  - "Phase 111 plans 02-06 are BLOCKED pending milestone replan to Option C non-ROPC or alternative"
  - "ZITADEL API surface (user creation, invite-code, service-account auth) works correctly; failure is strictly at post-password-set redirect boundary in the legacy UI"

patterns-established:
  - "E2E spike env guard: narrowly scoped to specific spec files in run-e2e.sh"

requirements-completed: []

duration: 27min
completed: 2026-04-23
---

# Phase 111 Plan 01: urlTemplate Deep-Link Spike Summary

**ZITADEL urlTemplate deep-link spike FAILED: v4.10.1 legacy login UI ignores urlTemplate on post-password-set redirect; milestone requires replan to Option C non-ROPC or alternative**

## Performance

- **Duration:** ~27 min (13:10-13:37 UTC, across commits + second run)
- **Started:** 2026-04-23T17:10:17Z
- **Completed:** 2026-04-23T17:37:16Z
- **Tasks:** 6 (T0-T5)
- **Files modified:** 8

## Outcome: FAIL

The gating spike proved that ZITADEL's `urlTemplate` parameter is **stored by the API** but **not honored by the runtime login UI** on our v4.10.1 instance. The v2 TypeScript login app (`zitadel/typescript`) — which is the component that reads `urlTemplate` and redirects accordingly — is a separate Next.js application that must be deployed alongside the ZITADEL server. It is not bundled.

**What worked:** Service-account auth, user creation, invite-code generation with `urlTemplate` + `returnCode: {}`, and user cleanup all succeeded. The API surface is sound.

**What failed:** After the invitee set their password on the ZITADEL hosted form, the browser was redirected to `/ui/console/` then bounced to `/ui/login/login?authRequestID=...` instead of our app's `/invites/<token>` URL. The stored `urlTemplate` had no effect.

Per D-SPIKE-03: Phase 111 exits `status: blocked (spike failed)`. Plans 02-06 do not execute.

## Accomplishments

- Proved ZITADEL API surface is functional (user creation, invite codes, service-account auth)
- Identified root cause: v2 login app not deployed, legacy UI ignores urlTemplate
- Produced comprehensive diagnostic artifacts (trace, screenshots, probe results)
- Delivered reusable Playwright spike spec pattern for future ZITADEL flow verification

## Task Commits

1. **T0: Pre-flight env guard** - `968afcca` (feat)
2. **T1: Scaffold spike spec + getZitadelToken** - `ce2a2719` (feat)
3. **T2: beforeAll provisioning** - `011709de` (feat)
4. **T3: urlTemplate deep-link assertions** - `6e26a3d6` (feat)
5. **T4: afterAll cleanup + trace retention** - `e817f43e` (feat)
6. **T5: Spike execution + verdict** - `b01e0551`, `fa815233` (fix, docs)

Deviation fixes:
- `cdbec6a3` fix: switch to legacy /ui/login/user/init URL
- `bb28c905` fix: correct to /ui/login/user/invite path
- `84e119be` fix: clean storageState for fresh browser context

## Files Created/Modified

- `web/e2e/invite-urltemplate-spike.spec.ts` - Playwright E2E spike: provisions throwaway ZITADEL invitee, drives hosted password-set flow, asserts landing URL contract
- `web/scripts/run-e2e.sh` - Added Phase 111 spike env guard (ZITADEL_URL, SERVICE_CLIENT_ID/SECRET)
- `.env.example` - Documented spike-required ZITADEL service-account envs
- `.planning/.../111-SPIKE-VERDICT.md` - FAIL verdict with root cause and replan options
- `.planning/.../artifacts/spike-failure-*/` - Trace, screenshots, diagnostic findings, run output

## Decisions Made

- **urlTemplate is non-functional on ZITADEL v4.10.1** — The API accepts and stores the template but the legacy Go-templates login UI at `/ui/login/*` never reads it during the post-password-set redirect. Only the separately-deployed v2 TypeScript login app (`/ui/v2/login/*`) honors it — and that app returns 404 on our instance.
- **Phase 111 blocked** — Plans 02-06 (service surface, scope audit) are gated on the spike and do not execute. Shipping the service surface would be wasted work if the milestone switches to Option C.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Blocking] ZITADEL v2 login verify page returns 404**
- **Found during:** T3/T5 (spike execution)
- **Issue:** `/ui/v2/login/verify?userId=...&code=...&invite=true` returns HTTP 404 — v2 login app not deployed
- **Fix:** Attempted legacy paths `/ui/login/user/init` then `/ui/login/user/invite` (both rendered the form but still didn't honor urlTemplate on redirect)
- **Files modified:** `web/e2e/invite-urltemplate-spike.spec.ts`
- **Verification:** Confirmed via HTTP probes that all `/ui/v2/*` paths return 404
- **Committed in:** `cdbec6a3`, `bb28c905`

**2. [Rule 1 - Blocking] Stale session cookies interfere with invite form**
- **Found during:** T5 (spike execution)
- **Issue:** Playwright auth-setup state files injected session cookies causing ZITADEL to show "Welcome Back" login instead of the invite init form
- **Fix:** Added `storageState: { cookies: [], origins: [] }` to ensure clean browser context
- **Committed in:** `84e119be`, `b01e0551`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were necessary to drive the spike to a conclusive verdict. The spike ran to completion and produced a definitive FAIL — the deviations did not change the outcome.

## Issues Encountered

**Spike FAILED — this is the expected gating outcome.** The spike was designed to catch exactly this scenario. See `111-SPIKE-VERDICT.md` for full evidence and root-cause analysis.

Three replan options identified in the verdict:
1. **Option C non-ROPC** (original fallback) — app-owned setup flow, no ZITADEL hosted UI dependency
2. **Option B + v2 login app deploy** — stand up `zitadel/typescript` alongside ZITADEL server
3. **Downgrade scope** — app-side bounce page that posts to legacy init endpoint

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**BLOCKED.** Phase 111 plans 02-06 do not execute. The milestone requires a replan.

Run `/gsd-replan-milestone v1.19 --reason option-c-non-ropc` to reroute, or review the three options in `111-SPIKE-VERDICT.md` first.

---
*Phase: 111-urltemplate-spike-zitadel-service-surface*
*Completed: 2026-04-23*
