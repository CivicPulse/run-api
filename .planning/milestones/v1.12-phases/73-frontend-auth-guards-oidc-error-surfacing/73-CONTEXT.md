# Phase 73: Frontend Auth Guards & OIDC Error Surfacing - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Unauthenticated users cannot reach protected content, sensitive routes enforce role gates, and OIDC errors surface to users instead of silently redirecting. Closes C7 (auth guard logic bug in `__root.tsx`), C8 (OIDC callback swallows error parameters), H23-H26 (missing role gates on `/campaigns/new`, settings routes, DNC list page, active calling page check-in) from CODEBASE-REVIEW-2026-04-04.md.

</domain>

<decisions>
## Implementation Decisions

### Auth Guard & Error UX
- **C7 fix**: Change condition in `web/src/routes/__root.tsx:243-254` to redirect unauthenticated users hitting non-public routes. Save intended URL via `/login?redirect=<original-path>` so user lands back where they were after login.
- **C8 fix**: Extend `validateSearch` in `web/src/routes/callback.tsx:84-87` to include `error` and `error_description`. Show a dedicated inline error state on the `/callback` page with "Back to login" CTA — not a toast, not a silent redirect.
- **H23-H25 role gates**: Wrap `/campaigns/new`, `/campaigns/$id/settings/*` (general, members, danger), and the DNC list page in existing `RequireOrgRole`/`RequireRole` components. Matches existing pattern — no new HOCs or route guards.
- **Loading behavior**: Unauthenticated users get **instant redirect** via `<Navigate>` during `isAuthenticated=false && !isLoading` — no flash of protected content, no loading spinner in that path.

### Server-Side Check-in & Testing
- **H26 (active calling page)**: Enforce check-in server-side by calling a `GET` status endpoint on the call page. If not checked in, redirect to check-in page. Add endpoint if missing (likely `app/api/v1/phone_banks.py` session GET route). Server enforcement is the source of truth; local `checkedIn` state becomes a UI-only hint.
- **Test strategy**: Playwright E2E tests are the primary coverage layer. One test per gated route (6-8 total): unauthenticated user, wrong role, correct role → assert redirect or render. Uses existing auth-state helpers in `web/playwright/`.

### Claude's Discretion
- Exact API path/shape for the check-status endpoint — Claude to choose based on existing session route conventions.
- Whether to add unit tests for `RequireRole`/`RequireOrgRole` components alongside E2E (currently untested) — at Claude's discretion if quick.
- Precise inline error state styling on `/callback` — follow existing error-state component patterns in the codebase (or shadcn Alert).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RequireRole` and `RequireOrgRole` components already exist (per CODEBASE-REVIEW) — simply wrap gated pages.
- `Navigate` from TanStack Router for redirects.
- Playwright auth fixtures in `web/playwright/` support multiple roles (owner/admin/manager/volunteer/viewer) per `playwright.config.ts`.
- `web/scripts/run-e2e.sh` wrapper logs test runs to `e2e-runs.jsonl` (per CLAUDE.md).

### Established Patterns
- Route-level auth handled in `web/src/routes/__root.tsx`.
- OIDC callback at `web/src/routes/callback.tsx` uses TanStack Router `validateSearch`.
- E2E tests use role-specific auth storage files.
- Responsive-first design (desktop-dense, mobile-field-friendly per CLAUDE.md).

### Integration Points
- `web/src/routes/__root.tsx:243-254` — auth guard logic bug.
- `web/src/routes/callback.tsx:84-87` — validateSearch needs error/error_description fields.
- `web/src/routes/campaigns/new.tsx:616` — needs `RequireOrgRole minimum="org_admin"`.
- `web/src/routes/campaigns/$campaignId/settings/{general,members,danger}.tsx` — needs role gates.
- `web/src/routes/.../phone-banking/dnc/index.tsx:42-163` — needs `RequireRole minimum="manager"`.
- `web/src/routes/.../sessions/$sessionId/call.tsx` — check-in enforcement.

</code_context>

<specifics>
## Specific Ideas

- Follow exact fix snippets from CODEBASE-REVIEW C7 and C8.
- E2E tests should use `web/scripts/run-e2e.sh` per project convention.
- OIDC error UX: display `error_description` prominently (users see friendly text from IdP), `error` code as smaller secondary text.
- Redirect-after-login must be safe against open redirects — only accept same-origin paths.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Frontend performance optimizations, additional role definitions, and OIDC provider migration are out of scope.

</deferred>
