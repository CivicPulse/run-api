# Phase 73: Frontend Auth Guards & OIDC Error Surfacing - Research

**Researched:** 2026-04-04
**Domain:** Frontend auth (TanStack Router + oidc-client-ts), Playwright E2E
**Confidence:** HIGH

## Summary

This phase is tightly scoped to existing code. CODEBASE-REVIEW C7 / C8 already contain the fix snippets; the planner's job is file+line-accurate task decomposition. All components named in CONTEXT.md exist, the check-in infrastructure already exists server-side, and the E2E RBAC pattern is well-established (multi-role setup projects with `.<role>.spec.ts` suffixes).

The one net-new server surface is a GET caller-status endpoint to replace the local `checkedIn` React state hint. The existing `list_callers` endpoint (returns all assigned callers for a session) can be reused client-side without adding anything new if preferred — pick based on payload size concern.

**Primary recommendation:** Follow the CODEBASE-REVIEW snippets verbatim for C7/C8, wrap the 5 identified routes in existing `RequireRole`/`RequireOrgRole` with a `<Navigate to="/" />` fallback, add one new GET endpoint for caller check-in status, and add one supplemental E2E spec file per affected role.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **C7 fix**: Change condition in `web/src/routes/__root.tsx:243-254` to redirect unauthenticated users hitting non-public routes. Save intended URL via `/login?redirect=<original-path>`.
- **C8 fix**: Extend `validateSearch` in `web/src/routes/callback.tsx:84-87` to include `error` and `error_description`. Show dedicated inline error state on `/callback` with "Back to login" CTA — not a toast, not a silent redirect.
- **H23-H25 role gates**: Wrap `/campaigns/new`, `/campaigns/$id/settings/*` (general, members, danger), and the DNC list page in existing `RequireOrgRole`/`RequireRole`. No new HOCs/route guards.
- **Loading behavior**: Unauthenticated users get instant `<Navigate>` during `isAuthenticated=false && !isLoading` — no flash, no loading spinner in that path.
- **H26 (active calling page)**: Enforce check-in server-side via GET status endpoint. Server is source of truth; local `checkedIn` state becomes UI-only hint.
- **Test strategy**: Playwright E2E primary. 6-8 tests total — unauthenticated / wrong role / correct role per gated route. Uses existing auth-state helpers.

### Claude's Discretion

- Exact API path/shape for check-status endpoint.
- Whether to add unit tests for `RequireRole`/`RequireOrgRole` (currently untested).
- Precise inline error state styling on `/callback` (follow existing patterns or shadcn Alert).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Frontend perf opts, additional role defs, and OIDC provider migration are out of scope.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| C7 | Auth guard condition bug in __root.tsx | File/line verified: `__root.tsx:243-254` (condition `!isAuthenticated \|\| isPublicRoute` renders protected content unwrapped when `!isAuthenticated && !isPublicRoute`). Fix snippet in CODEBASE-REVIEW. |
| C8 | OIDC callback swallows error params | File/line verified: `callback.tsx:84-87` validateSearch only extracts code/state. Fix snippet in CODEBASE-REVIEW. |
| H23 | /campaigns/new has no auth guard | File/line verified: `campaigns/new.tsx:616` route definition has no guard. |
| H24 | Settings routes accessible to all members | Verified: `settings/general.tsx`, `settings/members.tsx`, `settings/danger.tsx` have no page-level guards (internal `RequireRole` wraps only sub-sections). `settings/index.tsx` is a redirect-only stub. |
| H25 | DNC list shows phone numbers to all roles | File/line verified: `phone-banking/dnc/index.tsx:33-42` route def has no guard; inner `isManager` flag (line 56) only gates add/delete, not read access. |
| H26 | Calling page bypasses check-in | Verified: `sessions/$sessionId/call.tsx` has NO `checkedIn` guard at all (the state only lives in peer `sessions/$sessionId/index.tsx:299`). Direct URL navigation completely bypasses. |

---

## File-Line Inventory (Load-Bearing)

### C7 — Auth Guard Fix Site

**File:** `web/src/routes/__root.tsx`

| Line | Current | Required |
|------|---------|----------|
| 56 | `const PUBLIC_ROUTES = ["/login", "/callback"]` | unchanged |
| 219-221 | `isAuthenticated`, `isInitialized`, `initialize` from store | unchanged |
| 222 | `const location = useRouterState({ select: (s) => s.location })` | unchanged |
| 230 | `const isCallbackRoute = location.pathname === "/callback"` | unchanged |
| 232-241 | loading spinner when `!isInitialized && !isCallbackRoute` | unchanged |
| 243-244 | `const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r))` | unchanged |
| **245** | **`if (!isAuthenticated \|\| isPublicRoute) {`** — BUG | **Split into two branches:** (1) `if (!isAuthenticated && !isPublicRoute) return <Navigate to="/login" search={{ redirect: location.pathname + location.search }} />` (2) `if (isPublicRoute) return <public shell>` |
| 246-254 | public shell with `<Outlet />` | keep for public-route branch |

**Import needed:** `Navigate` from `@tanstack/react-router` (currently not imported — only `Link`, `Outlet`, `useNavigate`, `useRouterState`, `createRootRoute`).

**Edge case:** `isInitialized=false` is already handled (line 232-241) EXCEPT on `/callback`. That guard already runs before line 245, so by the time we reach the auth-check `isInitialized === true` on all non-callback routes. No isLoading race.

### C8 — Callback validateSearch Fix Site

**File:** `web/src/routes/callback.tsx`

| Line | Current | Required |
|------|---------|----------|
| 24 | `const { code, state } = Route.useSearch()` | Add: `, error, error_description` |
| 26-71 | useEffect: unconditional `handleCallback(url)` | Gate with `if (error \|\| error_description) return` early-return in effect; OR skip effect entirely when error present |
| 73-79 | returns "Completing sign in..." spinner | Branch on `error \|\| error_description` → render destructive Alert + "Back to login" Button per UI-SPEC section 1 |
| **84-87** | `validateSearch: (search) => ({ code: (search.code as string) ?? "", state: (search.state as string) ?? "" })` | **Add `error` and `error_description` fields** (same `?? ""` shape) |

**Components needed (all exist):** `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert`, `Button` from `@/components/ui/button`, `AlertCircle` icon from `lucide-react`.

**Module-level guard gotcha:** `callbackProcessed` flag at line 15 must NOT fire when error is present (otherwise navigating back and retrying would skip processing). Safest: gate the flag-set inside the same early-return check.

### H23 — /campaigns/new Guard

**File:** `web/src/routes/campaigns/new.tsx`

| Line | Current | Required |
|------|---------|----------|
| 616-618 | `export const Route = createFileRoute("/campaigns/new")({ component: NewCampaignPage })` | Wrap `<NewCampaignPage />` in `<RequireOrgRole minimum="org_admin" fallback={<Navigate to="/" />}>` — either via a thin wrapper component or by changing `component` to an inline wrapper function |

### H24 — Settings Route Guards

**Files:** `web/src/routes/campaigns/$campaignId/settings/{general,members,danger}.tsx`

- `settings/index.tsx` is already a `beforeLoad` redirect stub — no guard needed there.
- `settings/general.tsx` — currently no page-level guard. Needs `RequireRole minimum="admin"` wrap (admin can rename).
- `settings/members.tsx` — already imports `RequireRole` and wraps sub-sections; needs page-level `minimum="admin"` wrap.
- `settings/danger.tsx` — already imports `RequireRole` for inner actions; needs page-level `minimum="owner"` wrap (danger zone = transfer/delete).

**Pattern match:** the existing internal `RequireRole` usage shows the team already uses this component; page-level wrap is consistent.

### H25 — DNC List Guard

**File:** `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx`

| Line | Current | Required |
|------|---------|----------|
| 10 | `import { RequireRole }` already imported | unchanged |
| 33-35 | `createFileRoute(...)({ component: DNCListPage })` | Wrap `DNCListPage` in `RequireRole minimum="manager" fallback={<Navigate to="/" />}` |
| 55-56 | `const { hasRole } = usePermissions(); const isManager = hasRole("manager")` | Keep (still drives add/delete button visibility) |

### H26 — Calling Page Server-Side Check-in Enforcement

**File (frontend):** `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx`

- **Current state:** No `checkedIn` guard exists on this route at all. State machine starts at `phase: "idle"` with a "Start Calling" button that calls `claimEntry.mutateAsync()` directly.
- **Critical:** The `call.tsx` route does NOT use `useCallingSession` hook (that hook is only used by the field-mode route `web/src/routes/field/$campaignId/phone-banking.tsx:61`). So adding server check enforcement requires new code in `call.tsx` specifically.
- **Recommended approach:** Add a `beforeLoad` or a gating `useQuery` at top of `ActiveCallingPage` (line 247) that checks caller status; when not checked in, either `throw redirect({...})` or render a redirect to `../` (the session detail page where the check-in UI lives at `sessions/$sessionId/index.tsx:529`).

**File (backend) — NEW endpoint needed:** `app/api/v1/phone_banks.py`

Existing routes in phone_banks.py:
- `POST .../sessions/{id}/check-in` (line 324-351) — returns `SessionCallerResponse`
- `POST .../sessions/{id}/check-out` (line 354-381)
- `GET .../sessions/{id}/callers` (line 303-321) — returns list of ALL callers

**Option A (recommended):** Add `GET .../sessions/{session_id}/callers/me` returning `SessionCallerResponse | null` (or 404 if not a caller). Cleanest shape; tiny payload.

**Option B:** Reuse `GET .../callers` from client and filter for current user by `user_id`. No backend change. Trade-off: always returns full list.

Either approach works. `SessionCaller.check_in_at: datetime | None` (`app/models/phone_bank.py:68`) is the source of truth. `check_in_at IS NOT NULL AND check_out_at IS NULL` = currently checked in.

---

## Component API Verification

### `RequireRole` (`web/src/components/shared/RequireRole.tsx`)

```tsx
interface RequireRoleProps {
  minimum: CampaignRole  // "viewer" | "volunteer" | "manager" | "admin" | "owner" (ordered)
  children: React.ReactNode
  fallback?: React.ReactNode  // defaults to null
}
```

**Current behavior:** Returns `<>{children}</>` if `hasRole(minimum)` else `<>{fallback}</>`. Driven by `usePermissions()` hook.

### `RequireOrgRole` (`web/src/components/shared/RequireOrgRole.tsx`)

```tsx
interface RequireOrgRoleProps {
  minimum: OrgRole  // imported from useOrgPermissions
  children: React.ReactNode
  fallback?: React.ReactNode  // defaults to null
}
```

**Current callers (pattern examples):** `__root.tsx:124` wraps sidebar links, `__root.tsx:147` wraps footer settings link. All existing call sites omit `fallback` (default null). Phase 73 introduces the first `<Navigate>`-as-fallback usage.

**Edge case — isLoading:** Both components synchronously read from Zustand stores (`usePermissions`/`useOrgPermissions`). There is no async loading state inside the component. If org permissions haven't been fetched yet, `hasRole`/`hasOrgRole` will return false → redirect fires. Planner must verify `useOrgPermissions` has a safe initial state (either "still loading — don't render" or "no roles — deny") to avoid a false redirect on initial mount before permissions load. **This is a latent bug surface the planner should flag.**

---

## Login Redirect Handling

**File:** `web/src/routes/login.tsx`

- **Current state:** No `?redirect=` handling at all. 31 lines total. `useEffect` at line 15-20 unconditionally calls `login()` once. Route declaration at line 31 has no `validateSearch`.
- **Required additions:**
  1. Add `validateSearch` to extract `redirect` param.
  2. Store `redirect` before calling `login()` — options:
     - a) `sessionStorage.setItem("post_login_redirect", redirect)` and read in `callback.tsx` after `navigate({ to: "/" })` logic.
     - b) Pass through OIDC `state` via `signinRedirect({ state: { redirect } })` — requires authStore `login()` signature change (currently no params, line 79-82).
  3. Validate redirect is same-origin path (see Open Redirect Safety below).

**authStore.login():** `web/src/stores/authStore.ts:79-82`
```ts
login: async () => {
  const mgr = await ensureUserManager()
  await mgr.signinRedirect()  // no args
}
```

Needs signature extended to accept `redirect?: string` and pass through to `signinRedirect({ state: { redirect } })`, OR keep store untouched and use sessionStorage approach.

---

## Open Redirect Safety

**Same-origin validation pattern:**

```ts
function isSafeRedirect(path: string | null): path is string {
  if (!path) return false
  // Must start with single "/" and not "//" (protocol-relative URL attack)
  if (!path.startsWith("/") || path.startsWith("//")) return false
  // Must not contain ":" before any "/" (data:, javascript:, etc.)
  try {
    const resolved = new URL(path, window.location.origin)
    return resolved.origin === window.location.origin
  } catch { return false }
}
```

**Forbidden patterns to reject:** `//evil.com/x`, `https://evil.com`, `javascript:alert(1)`, `data:text/html,...`, empty string, non-string values.

**Default fallback when unsafe:** navigate to `/`.

---

## E2E Test Infrastructure

### Existing Auth Setup

**File:** `web/playwright.config.ts`

- 5 auth setup projects registered: `setup-owner`, `setup-admin`, `setup-manager`, `setup-volunteer`, `setup-viewer` (lines 59-95).
- Setup files: `web/e2e/auth-{owner,admin,manager,volunteer,viewer}.setup.ts`.
- Each creates a `.auth-state-{role}.json` storage state.
- Test files use suffix convention: `.admin.spec.ts`, `.volunteer.spec.ts`, `.viewer.spec.ts`, `.manager.spec.ts`, unsuffixed `.spec.ts` runs as owner/default.
- Fixtures: `web/e2e/fixtures.ts` provides `campaignId` fixture and typed `test`/`expect`.
- Helpers: `web/e2e/auth-flow.ts` (has `loginViaZitadel(page, role)`), `web/e2e/auth-shared.ts` (has `waitForZitadelLogin`, `waitForPostLoginApp`).

### Existing RBAC Test Patterns

| File | Role | Asserts |
|------|------|---------|
| `rbac.spec.ts` | owner (default) | All capabilities visible, danger zone visible but not clicked |
| `rbac.admin.spec.ts` | admin | Manager capabilities + settings, no danger zone |
| `rbac.manager.spec.ts` | manager | Operational UI visible, no settings |
| `rbac.volunteer.spec.ts` | volunteer | Field-mode visible, mutation buttons hidden |
| `rbac.viewer.spec.ts` | viewer | Read-only, all mutations hidden |
| `role-gated.admin.spec.ts` | admin (org_admin) | Org settings, sidebar gates |
| `role-gated.volunteer.spec.ts` | volunteer | Volunteer-specific gates |

**Common assertion style:** `expect(locator).toBeVisible()` / `expect(locator).not.toBeVisible()`. Rarely uses page-redirect assertions.

### New Tests Needed (Phase 73)

**Approach:** Supplement existing rbac specs with new test blocks for the 5 newly-gated routes, OR add a new focused spec file.

**Recommended new files (6-8 tests total per CONTEXT.md):**

1. `web/e2e/auth-guard-redirect.spec.ts` — unauthenticated redirect (needs fresh-context, pattern from `login.spec.ts:7-10`). Tests: `/campaigns/new` → redirects to `/login?redirect=/campaigns/new`; after login returns to original URL.

2. `web/e2e/oidc-error.spec.ts` — OIDC error callback. Navigate directly to `/callback?error=access_denied&error_description=User+cancelled`. Assert Alert visible, "Back to login" button visible, clicking returns to `/login`. No ZITADEL round-trip needed.

3. **Additions to existing `rbac.*.spec.ts` files** for the 5 newly-gated routes:
   - `rbac.volunteer.spec.ts`: add assertions that visiting `/campaigns/new`, `/campaigns/{id}/settings/*`, `/campaigns/{id}/phone-banking/dnc` redirects to `/`.
   - `rbac.viewer.spec.ts`: same.
   - `rbac.manager.spec.ts`: DNC list IS visible; settings + /campaigns/new redirect.
   - `rbac.admin.spec.ts`: settings visible; /campaigns/new visible (org_admin required — verify admin has it via seed data).

4. Optional: `phase73-server-check-in.spec.ts` (volunteer) — direct-URL navigate to `/campaigns/{id}/phone-banking/sessions/{sid}/call` without check-in; assert redirect to session detail page.

### E2E Wrapper Convention

Per CLAUDE.md: always use `web/scripts/run-e2e.sh` which logs to `web/e2e-runs.jsonl`. Tests invoked as: `cd web && ./scripts/run-e2e.sh auth-guard-redirect.spec.ts`.

---

## Architecture Patterns (from existing code)

### Route Guards in This Codebase

Three styles are used — Phase 73 should follow style 3 for page-level consistency:

1. **Inline `useRole` checks with conditional rendering** (e.g., `dnc/index.tsx:55-56`) — used for button-level gating.
2. **`RequireRole`/`RequireOrgRole` wrapping sub-trees in JSX** (e.g., `__root.tsx:124,147`) — used in sidebar.
3. **`<Navigate>` redirect when wrapping page components** — NEW with Phase 73.
4. **`beforeLoad` with `throw redirect(...)`** (e.g., `settings/index.tsx:4-8`) — used for canonical URL redirects.

### Navigate vs beforeLoad Decision

Per UI-SPEC section 3: either option is acceptable. **Recommendation for planner:** Use Option B (`<Navigate>` as `fallback` prop) because:
- All existing `RequireRole`/`RequireOrgRole` consumers already use the component-wrapping pattern — consistent.
- `beforeLoad` would require restructuring the `Route` declaration and wiring role checks outside the React tree where `usePermissions` can't be called.
- Trade-off: page component does mount briefly before redirect. Visually identical at network speeds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Same-origin redirect validation | Regex / string-starts-with only | `new URL(path, origin)` + origin check | Catches `//evil.com`, protocol-relative URLs, and malformed input |
| New "Unauthorized" page | Custom 403 route | Silent `<Navigate to="/" />` per UI-SPEC | Spec explicitly forbids 403 page; keeps UX clean |
| Local `checkedIn` session storage for server check | Sync to Zustand + localStorage | Server GET endpoint (H26) | Client state is untrusted per security model |
| Custom Alert styling | Bespoke error card | `<Alert variant="destructive">` (shadcn, exists in `components/ui/alert.tsx`) | Already in UI-SPEC, matches design tokens |

---

## Common Pitfalls

### Pitfall 1: StrictMode Double-Render of `<Navigate>`
**What goes wrong:** Navigate fires twice in dev mode, once post-hydration. Usually harmless but can cause React dev warnings.
**How to avoid:** TanStack Router's `<Navigate>` component is idempotent — safe. No special handling needed.

### Pitfall 2: `callbackProcessed` Flag Prevents Retry After Error
**What goes wrong:** Module-level flag at `callback.tsx:15` is set BEFORE the OIDC params are examined. If user lands on `/callback?error=...`, flag would still set and retry would skip.
**How to avoid:** Gate the `callbackProcessed = true` assignment inside the non-error branch only, OR check for `error/error_description` before the flag logic.

### Pitfall 3: `useOrgPermissions` Initial-Render False Negative
**What goes wrong:** If `hasOrgRole()` returns false during initial permission-fetch, the page-level `RequireOrgRole` fires `<Navigate>` before permissions load → infinite redirect loop or unexpected home-redirect.
**How to avoid:** Verify `useOrgPermissions` has an "isLoading" signal or defaults to true during load. If not, introduce an `isLoading` fallback in the guard wrappers. **Planner must inspect `useOrgPermissions` hook implementation to confirm safety.**

### Pitfall 4: Same-Origin Check Bypass via URL-Parsing Edge Cases
**What goes wrong:** `path.startsWith("/")` alone accepts `//evil.com` (protocol-relative URL) which browsers treat as cross-origin.
**How to avoid:** Explicit `!path.startsWith("//")` check, and use `new URL(path, origin).origin === origin` as the authoritative check.

### Pitfall 5: Login Page `loginInitiated` Flag With New `redirect` Param
**What goes wrong:** `login.tsx:9` has a module-level `loginInitiated` flag with no reset. If user hits `/login` a second time with a new `?redirect=` param, login may not re-fire.
**How to avoid:** Because a full page redirect to ZITADEL reloads the module, the flag naturally resets. But if the `redirect` param is captured INSIDE the effect and the effect doesn't re-run (because `loginInitiated` blocks it), the param must be stored to sessionStorage BEFORE the flag is set, or via a different mechanism.

---

## Code Examples (Verified Patterns from Existing Code)

### Navigate Component (TanStack Router)

Pattern to use (not currently imported in `__root.tsx`):
```tsx
import { Navigate } from "@tanstack/react-router"

<Navigate to="/login" search={{ redirect: location.pathname + location.search }} />
```

### shadcn Alert Destructive Variant

Source: `web/src/components/ui/alert.tsx` (exists). Usage:
```tsx
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Sign-in failed</AlertTitle>
  <AlertDescription>{error_description}</AlertDescription>
</Alert>
```

### Existing beforeLoad Redirect Pattern

Source: `web/src/routes/campaigns/$campaignId/settings/index.tsx:4-8`:
```tsx
export const Route = createFileRoute("/campaigns/$campaignId/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/campaigns/$campaignId/settings/general",
      params: { campaignId: params.campaignId },
    })
  },
})
```

---

## Project Constraints (from CLAUDE.md)

- **Python:** `uv run` prefix mandatory; no system python.
- **Linting:** `uv run ruff check .` and `uv run ruff format .` before commit (backend only — N/A for most of this phase).
- **E2E tests:** MUST use `web/scripts/run-e2e.sh` wrapper (logs to `e2e-runs.jsonl`).
- **Branches:** commit to feature branch (current: `gsd/v1.12-hardening-remediation`).
- **Conventional Commits** required.
- **UI changes:** visually verify via Playwright MCP / screenshots to `screenshots/` (gitignored) — applies to OIDC error state.
- **Accessibility target:** WCAG 2.1 AAA (contrast ratios 7:1 / 4.5:1 enforced).

---

## Open Questions

1. **Which check-in status endpoint shape?** (Claude's discretion per CONTEXT.md)
   - Recommendation: New `GET /campaigns/{id}/phone-bank-sessions/{sid}/callers/me` returning `SessionCallerResponse` with 404 if not assigned. Cleaner than filtering the full caller list client-side.

2. **Does `useOrgPermissions` have a safe isLoading state?**
   - Not verified in this research pass. Planner MUST confirm before wrapping pages, or the guards will fire false-positive redirects.

3. **Should the `redirect` param flow through OIDC `state` or via sessionStorage?**
   - CONTEXT.md doesn't specify. Recommend sessionStorage — simpler, doesn't require modifying `authStore.login()` signature or ZITADEL state handling.

4. **Is `admin` seed user also `org_admin`?** (Affects H23 test — `/campaigns/new` requires `org_admin`, not `admin` campaign role.)
   - `rbac.admin.spec.ts:13` comment says "admin1@localhost has org_admin role for RBAC-08 tests". CONFIRMED admin test user has org_admin.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (E2E), Vitest (unit) |
| Config file | `web/playwright.config.ts`, `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run <file>` for unit |
| Full suite command | `cd web && ./scripts/run-e2e.sh` for E2E, `cd web && npx vitest run` for unit |
| Phase gate | All new E2E specs green before merge |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| C7 | Unauthenticated → /login?redirect= | E2E | `./scripts/run-e2e.sh auth-guard-redirect.spec.ts` | ❌ new file |
| C7 | After login, returns to `redirect` path | E2E | same | ❌ new file |
| C8 | /callback?error=... shows Alert + CTA | E2E | `./scripts/run-e2e.sh oidc-error.spec.ts` | ❌ new file |
| C8 | Direct navigate to callback w/o error still works | E2E | existing `login.spec.ts` | ✅ regression |
| H23 | /campaigns/new gate for org_admin | E2E | extend `rbac.volunteer.spec.ts`, `rbac.viewer.spec.ts`, `rbac.manager.spec.ts` | ✅ add blocks |
| H24 | settings/* gate for admin+ | E2E | extend `rbac.manager.spec.ts`, `rbac.volunteer.spec.ts` | ✅ add blocks |
| H24 | settings/danger gate for owner | E2E | extend `rbac.admin.spec.ts` | ✅ add blocks |
| H25 | DNC gate for manager+ | E2E | extend `rbac.volunteer.spec.ts`, `rbac.viewer.spec.ts` | ✅ add blocks |
| H26 | Call page redirects if not checked in | E2E | `phase73-server-check-in.spec.ts` | ❌ new file |
| H26 | Check-in status endpoint returns correct state | unit | `uv run pytest tests/api/test_phone_banks.py -k check_in_status -x` | ❌ new test |

### Sampling Rate

- **Per task commit:** run only the touched spec file via run-e2e.sh.
- **Per wave merge:** full rbac.*.spec.ts + new phase 73 specs.
- **Phase gate:** `./scripts/run-e2e.sh` full suite green.

### Wave 0 Gaps

- [ ] `web/e2e/auth-guard-redirect.spec.ts` — covers C7
- [ ] `web/e2e/oidc-error.spec.ts` — covers C8
- [ ] `web/e2e/phase73-server-check-in.spec.ts` — covers H26 (optional; may be absorbed into existing phone-banking.spec.ts)
- [ ] `tests/api/test_phone_banks.py::test_check_in_status_*` — backend endpoint unit test (if Option A endpoint chosen)

---

## Environment Availability

No external services beyond existing dev stack (Playwright, Vitest, pytest, ZITADEL on :8080). All required tooling already installed per existing E2E suite.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `web/src/routes/__root.tsx`, `callback.tsx`, `login.tsx`, `campaigns/new.tsx`, `settings/{general,danger,members,index}.tsx`, `phone-banking/dnc/index.tsx`, `phone-banking/sessions/$sessionId/call.tsx`, `hooks/useCallingSession.ts`, `hooks/usePhoneBankSessions.ts`, `stores/authStore.ts`
- Backend: `app/api/v1/phone_banks.py` (check-in/check-out/list_callers endpoints), `app/models/phone_bank.py` (SessionCaller model)
- Components: `components/shared/RequireRole.tsx`, `RequireOrgRole.tsx`
- Tests: `web/e2e/auth-shared.ts`, `auth-flow.ts`, `rbac.*.spec.ts`, `role-gated.*.spec.ts`, `login.spec.ts`, `web/playwright.config.ts`
- `.planning/CODEBASE-REVIEW-2026-04-04.md` (C7, C8, H23-H26 sections)
- `CLAUDE.md` (project conventions)

### Secondary (MEDIUM confidence)
- Assumption that `useOrgPermissions` has safe isLoading handling — NOT verified in this pass, flagged as Open Question #2

---

## Metadata

**Confidence breakdown:**
- C7/C8 fix sites: HIGH — verified line-for-line
- H23-H26 wrap sites: HIGH — all target files read
- Component APIs: HIGH — source read
- E2E patterns: HIGH — 4+ existing spec files reviewed
- Backend check-in endpoint shape: MEDIUM — recommended new endpoint; Option B fallback exists
- `useOrgPermissions` loading safety: LOW — not inspected, flagged for planner

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days; fix-focused phase with stable target code)
