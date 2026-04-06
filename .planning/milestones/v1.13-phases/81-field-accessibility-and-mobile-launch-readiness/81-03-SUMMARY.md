# 81-03 Summary

## Completed

- Moved field tour startup work off the cold path by lazy-loading the tour step definitions and `driver.js` dependencies only when the tour is actually started.
- Kept the tour behavior intact for auto-start and help-button replay flows while reducing non-critical field-mode startup work.
- Split the authenticated desktop shell out of [`__root.tsx`](../../../../web/src/routes/__root.tsx) into a lazy-loaded [`AuthenticatedAppShell.tsx`](../../../../web/src/components/layout/AuthenticatedAppShell.tsx) chunk so field routes no longer pull sidebar, org switcher, and user-menu code into the shared entry bundle.
- Reduced the shared `index` bundle produced by `npm run build` from roughly `742.34 kB` minified (`221.78 kB` gzip) to `694.00 kB` minified (`209.67 kB` gzip), while moving the admin shell into its own `AuthenticatedAppShell` chunk (`15.42 kB` minified).

## Verification

- `useTour` tests were updated for the lazy-loaded implementation and passed in the focused phase 81 suite.
- `npm run build` passed after the root-shell split and emitted a separate `AuthenticatedAppShell` chunk instead of keeping that code in the shared entry bundle.

## Remaining Follow-Up

- Re-run the field-hub mobile performance harness to confirm whether the lazy-load reduction is enough to clear the launch budget.
