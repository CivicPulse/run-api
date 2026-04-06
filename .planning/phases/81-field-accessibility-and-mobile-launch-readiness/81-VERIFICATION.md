status: gaps_found

# Phase 81 Verification

## Result

Phase 81 implementation was rerun against production and still has launch-readiness gaps. The phase cannot be closed yet.

## Passed

- The documented Phase 14 accessible-name regressions were addressed on the affected voter, volunteer, survey, canvassing, and campaign-creation surfaces.
- Volunteer post-login routing now prefers a campaign with an actual field assignment and no longer depends on the first `/me/campaigns` row or on `highestRole === "volunteer"` alone.
- Field-mode `Back to Hub` controls and the resume toast action/cancel buttons were raised to the intended minimum touch-target height.
- Field tour startup now lazy-loads non-critical tour code instead of pulling it into the initial field-mode render path, and auto-start is suppressed for automated browsers while being deferred until the field screens are idle for real users.
- The authenticated desktop shell is now lazy-loaded behind the non-field route path, so field routes no longer pay the sidebar/org-switcher/user-menu code cost during initial bundle load.
- Follow-up local fixes were applied for the remaining rerun themes:
  - explicit `aria-label`s on Radix `SelectTrigger` controls that still lacked a programmatic name in production axe output
  - explicit accessible names on assignment and field progress bars
  - stronger contrast and non-opacity completion states in field canvassing cards and neutral badges
- Focused web verification passed:
  - `npm test -- --run src/routes/callback.test.tsx src/hooks/useTour.test.ts src/components/field/AssignmentCard.test.tsx src/components/field/FieldHeader.test.tsx src/routes/campaigns/new.test.tsx 'src/routes/field/$campaignId/phone-banking.test.tsx' 'src/routes/field/$campaignId/canvassing.test.tsx'`
- Frontend production build passed:
  - `npm run build`
- Local bundle output improved in a way that should help the field-hub cold path:
  - shared `index` chunk dropped from about `742.34 kB` minified (`221.78 kB` gzip) to `694.00 kB` minified (`209.67 kB` gzip)
  - authenticated desktop shell moved into a separate `AuthenticatedAppShell` chunk (`15.42 kB` minified)

## Gaps Found

- Production accessibility rerun still reports the original phase-81 blocker family on the affected surfaces:
  - `axe-05-voter-detail-tags`: `button-name`
  - `axe-06-canvassing`: `link-name`
  - `axe-08-surveys`: `button-name`, `link-name`
  - `axe-09-volunteers`: `button-name`
  - `axe-11-wizard-step-1`: `button-name`
- Additional production accessibility findings also remain on field/mobile surfaces:
  - `axe-15-field-hub`: `aria-progressbar-name`
  - `axe-16-field-canvassing`: `aria-allowed-attr`, `aria-progressbar-name`, `color-contrast`
- Production field-hub mobile performance still misses the launch budget:
  - `page-04-field-hub-rerun`: median `loadMs` `2944`, LCP `2488`, target `loadMs < 2000`

## Evidence

- `docs/production-shakedown/results/evidence/phase-14/axe-05-voter-detail-tags/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-06-canvassing/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-08-surveys/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-09-volunteers/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-11-wizard-step-1/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-15-field-hub/summary.json`
- `docs/production-shakedown/results/evidence/phase-14/axe-16-field-canvassing/summary.json`
- `docs/production-shakedown/results/evidence/phase-15/page-04-field-hub-rerun/runs.json`

## Exit Criteria To Close Phase

Phase 81 can close only after these local follow-up fixes are deployed and the production accessibility failures are cleared, and after the field-hub mobile load either meets budget or gets an explicit accepted-budget decision.
