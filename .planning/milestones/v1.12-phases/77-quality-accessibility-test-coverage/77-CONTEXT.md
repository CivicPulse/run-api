# Phase 77: Quality, Accessibility & Test Coverage - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Field users get self-hosted assets, screen readers get proper labels, auth/logout paths are correct, and critical auth/data hooks have unit test coverage. Closes QUAL-01..08 from CODEBASE-REVIEW-2026-04-04.md. Frontend-only, scoped to named files/components.

</domain>

<decisions>
## Implementation Decisions

### Asset Hosting & A11y
- **QUAL-01 Leaflet self-hosting**: Copy `marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png` to `web/public/leaflet/`. Reference with absolute URL `/leaflet/marker-icon.png`. No unpkg CDN fetches.
- **QUAL-02 Label associations**: Use React `useId()` to generate unique IDs. Explicit `<label htmlFor={id}>` + `<input id={id}>` in DoorKnockDialog, WalkListGenerateDialog, and InlineSurvey radio items.
- **Scope**: Only the 3 dialogs named in success criteria — not a broad a11y audit.

### Test Coverage & Auth Fixes
- **QUAL-03/04 authStore.logout() order**: Call `removeUser()` and reset store state BEFORE `signoutRedirect()`. Ensures cleanup runs even if redirect fails.
- **QUAL-05 useOrgCampaigns catch narrowing**: Catch only `PermissionError` and 404. Let other errors propagate to Query boundary for proper error UI.
- **QUAL-06/07/08 Test file org**: One test file per source file — `authStore.test.ts`, `client.test.ts`, `useOrgPermissions.test.ts`, `callback.test.tsx` alongside sources. Matches existing Vitest convention.
- **authStore test scope**: Token storage, OIDC events, switchOrg, logout — 4 test groups per criteria.

### Claude's Discretion
- Exact `PermissionError` class location — Claude to locate; create if not already defined.
- OIDC callback test scenarios (error/null-user/no-campaigns) — Claude to enumerate concrete paths based on current callback.tsx flow.
- Whether to add visual regression tests for leaflet markers — at Claude's discretion; trivial snapshot if useful.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useId()` React hook for stable unique IDs across SSR.
- Vitest + React Testing Library already configured (per Phase 75 test patterns).
- `PermissionError` type likely defined somewhere in `web/src/api/` or `web/src/types/`.

### Established Patterns
- Test files co-located with sources using `.test.ts`/`.test.tsx` suffix.
- Mocks via `vi.mock()` at top of file.
- Store tests reset state in `beforeEach`.

### Integration Points
- `web/src/components/canvassing/DoorKnockDialog.tsx` — radio items need label ids
- `web/src/components/canvassing/WalkListGenerateDialog.tsx` — radio items
- `web/src/components/surveys/InlineSurvey.tsx` — radio items
- `web/src/stores/authStore.ts` — logout() ordering
- `web/src/hooks/useOrg.ts` — useOrgCampaigns catch block
- `web/src/api/client.ts` — needs unit test file
- `web/src/routes/callback.tsx` — needs test file (already tested E2E in Phase 73)
- Leaflet import site(s) — to be located in Phase 77 research

</code_context>

<specifics>
## Specific Ideas

- Follow exact fix snippets from CODEBASE-REVIEW H26, H27, H28 (auth/logout, useOrgCampaigns).
- authStore test must mock `oidc-client-ts` `UserManager` — follow existing mock patterns if any exist.
- callback.tsx test should cover: success path, error params (from Phase 73), null user, no-campaigns-found.
- Label association tests verify `screen.getByLabelText(...)` works correctly.

</specifics>

<deferred>
## Deferred Ideas

- Broader a11y sweep — out of scope.
- Visual regression testing infrastructure — deferred.
- Test coverage for other hooks/components — focused on criteria only.

</deferred>
