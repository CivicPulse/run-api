# Phase 44: UI/UX Polish & Frontend Hardening - Research

**Researched:** 2026-03-24
**Domain:** React frontend UX patterns (error boundaries, empty states, loading skeletons, sidebar layout, tooltips)
**Confidence:** HIGH

## Summary

This phase is entirely frontend polish -- no new pages, no new API endpoints. The codebase already has strong foundations for every requirement: `EmptyState` component used across 20+ locations, `Skeleton` component from shadcn/ui, `TooltipIcon` popover pattern, and shadcn's sidebar with `collapsible="offcanvas"` already set. The primary work is (1) adding TanStack Router `errorComponent` to route definitions, (2) auditing all list/data pages for consistent empty state + skeleton usage, (3) modifying sidebar behavior for slide-over on desktop, (4) adding a radio toggle to volunteer creation, and (5) placing `TooltipIcon` at five specified decision points.

TanStack Router natively supports route-level error boundaries via the `errorComponent` option on `createRoute`/`createFileRoute`. The component receives `{ error, reset, info }` props. A `defaultErrorComponent` can be set on `createRouter` in `main.tsx` as the top-level fallback. No third-party error boundary library is needed.

**Primary recommendation:** Use TanStack Router's built-in `errorComponent` for route-level error boundaries, promote `TooltipIcon` to `components/shared/`, and audit all data pages for consistent `Skeleton`-based loading and contextual `EmptyState` messaging.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Keep two-group sidebar structure (Campaign, Organization) -- do not flatten
- **D-02:** Sidebar should slide over (overlay) content on all screen sizes; on desktop use offcanvas toggle (visible/hidden), not persistent
- **D-03:** When sidebar hidden on desktop, content uses full viewport width. No icon rail
- **D-04:** Radio toggle at top of volunteer creation form: "Add volunteer record" vs "Invite to app"
- **D-05:** Tracked-only path: existing form fields (name, phone, email, skills). No ZITADEL integration
- **D-06:** Invite path: same base fields + sends invite email via ZITADEL. Show info banner explaining email invitation
- **D-07:** This distinction replaces current single-form approach for managers. Self-registration path unchanged
- **D-08:** Route-level error boundaries wrapping each major section: campaigns, voters, volunteers, org, phone banking, canvassing
- **D-09:** Top-level app error boundary as last-resort fallback
- **D-10:** Error boundary fallback UI: friendly message, retry button, link to dashboard. Use Card component styling
- **D-11:** Do NOT add feature-level (component-level) error boundaries -- route-level is sufficient
- **D-12:** Use existing `EmptyState` component from `components/shared/EmptyState.tsx` for all list pages
- **D-13:** Every list page must show meaningful empty state with icon, title, description, and optional CTA
- **D-14:** DataTable already handles empty state rendering -- ensure message text is contextual per page
- **D-15:** Standardize on Skeleton components for all data-loading pages. Replace Loader2 spinners with inline skeletons
- **D-16:** Card-shaped skeletons for card pages, row skeletons for table pages. Use shadcn `Skeleton` component
- **D-17:** Tooltips at: turf creation (turf size), role assignment (permissions), import column mapping, campaign type, org settings (ZITADEL org ID)
- **D-18:** Use existing TooltipIcon pattern from `components/field/TooltipIcon.tsx`. Promote to `components/shared/`
- **D-19:** Tooltips informational only -- no multi-step guides or tours

### Claude's Discretion
- Exact empty state copy/messaging per page
- Specific skeleton layout dimensions per page
- Which additional form fields could benefit from help text beyond the required decision points
- Error boundary component naming and file organization

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Sidebar slides over content (not push) and consolidates navigation into single side menu | Sidebar already uses `collapsible="offcanvas"`. Current `SidebarProvider` `defaultOpen=true` needs to change to `false` for desktop hide-by-default. The `sidebar-gap` div already sets `w-0` for offcanvas collapsed state |
| UX-02 | Volunteer invite flow clearly distinguishes tracked-only from ZITADEL-invited users | Current form at `volunteers/register/index.tsx` has single path. Add radio toggle + conditional info banner + ZITADEL invite mutation |
| UX-03 | Contextual tooltips guide new users through key features | `TooltipIcon` component exists at `components/field/TooltipIcon.tsx` using Popover+HelpCircle pattern. Promote to shared and place at 5 decision points |
| UX-04 | Inline hints at decision points (turf sizing, role assignment, import column mapping) | Same `TooltipIcon` pattern; specific placement locations identified in D-17 |
| OBS-05 | All pages have error boundaries with user-friendly error messages | TanStack Router supports `errorComponent` per route and `defaultErrorComponent` on router. No error boundaries exist currently |
| OBS-06 | All list pages show meaningful empty state messages | `EmptyState` component exists and is used in ~20 locations. Audit needed for completeness and contextual messaging |
| OBS-07 | All data-loading pages show loading skeletons or spinners | `DataTable` already renders 5 skeleton rows when `isLoading=true`. Several pages still use `Loader2` spinner (6 locations in admin routes). Replace with layout-matching skeletons |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-router | ^1.159.5 | Routing + error boundaries | Already installed; `errorComponent` is the built-in error boundary mechanism |
| @tanstack/react-query | ^5.90.21 | Data fetching + loading states | Already installed; `isLoading`/`isPending` states drive skeleton rendering |
| radix-ui | ^1.4.3 | Popover, Tooltip primitives | Already installed; powers TooltipIcon pattern |
| lucide-react | ^0.563.0 | Icons (HelpCircle, etc.) | Already installed; consistent icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | ^3.8.4 | UI component library (Skeleton, Card, Sidebar) | All UI components -- already integrated |
| sonner | ^2.0.7 | Toast notifications | Error notification fallback for non-boundary errors |
| react-hook-form + zod | ^7.71.1 / ^4.3.6 | Form management | Volunteer registration form modification |

### Alternatives Considered
None -- all required libraries are already installed. No new dependencies needed for this phase.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  components/
    shared/
      EmptyState.tsx           # existing -- no changes needed
      TooltipIcon.tsx          # PROMOTED from components/field/
      RouteErrorBoundary.tsx   # NEW -- reusable error boundary component
      DataTable.tsx            # existing -- already has empty/loading
    field/
      TooltipIcon.tsx          # DEPRECATED -- re-export from shared for compat
  routes/
    __root.tsx                 # ADD defaultErrorComponent to createRootRoute
    campaigns/
      $campaignId.tsx          # ADD errorComponent
      $campaignId/
        voters.tsx             # ADD errorComponent
        canvassing.tsx         # ADD errorComponent
        phone-banking.tsx      # ADD errorComponent (layout route, currently exists)
        volunteers.tsx         # ADD errorComponent
        settings.tsx           # ADD errorComponent
    org/
      members.tsx              # ADD errorComponent
      settings.tsx             # ADD errorComponent
  main.tsx                     # ADD defaultErrorComponent to createRouter
```

### Pattern 1: TanStack Router errorComponent
**What:** Each route file exports `errorComponent` in the route options. The component receives `{ error, reset, info }` props and renders a Card-based fallback UI.
**When to use:** Every layout route and section entry route.
**Example:**
```typescript
// Source: TanStack Router docs (https://deepwiki.com/TanStack/router/4.6-error-handling)
import { createFileRoute } from "@tanstack/react-router"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"

export const Route = createFileRoute("/campaigns/$campaignId/voters")({
  component: VotersLayout,
  errorComponent: RouteErrorBoundary,
})
```

```typescript
// RouteErrorBoundary.tsx
import { useRouter } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface RouteErrorProps {
  error: Error
  reset: () => void
}

export function RouteErrorBoundary({ error, reset }: RouteErrorProps) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-2" />
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={reset} variant="default">Try Again</Button>
            <Button onClick={() => router.navigate({ to: "/" })} variant="outline">
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Pattern 2: defaultErrorComponent on Router
**What:** Set a global fallback in `main.tsx` via `createRouter({ routeTree, defaultErrorComponent })`.
**When to use:** Once, as the top-level app error boundary (D-09).
**Example:**
```typescript
// main.tsx
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"

const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteErrorBoundary,
})
```

### Pattern 3: Sidebar Offcanvas (Desktop Hidden by Default)
**What:** Change `SidebarProvider` `defaultOpen` to `false` so sidebar starts hidden on desktop. The existing `collapsible="offcanvas"` in the `Sidebar` component already handles the slide-over behavior -- the gap div sets `w-0` and the sidebar container animates via `left` CSS transition.
**When to use:** `__root.tsx` RootLayout.
**Example:**
```typescript
// __root.tsx - change from:
<SidebarProvider>
// to:
<SidebarProvider defaultOpen={false}>
```

### Pattern 4: Volunteer Invite Toggle
**What:** Add a radio group at the top of the manager view in volunteer registration. The radio controls which form sections and submit behavior are active.
**When to use:** `volunteers/register/index.tsx`, only visible to managers (wrapped in `RequireRole`).
**Example:**
```typescript
// Inside the form, before essential fields, wrapped in RequireRole
<RequireRole minimum="manager">
  <RadioGroup value={mode} onValueChange={setMode}>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="record" id="record" />
      <Label htmlFor="record">Add volunteer record</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="invite" id="invite" />
      <Label htmlFor="invite">Invite to app</Label>
    </div>
  </RadioGroup>
</RequireRole>

{mode === "invite" && (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      This volunteer will receive an email invitation to access the app.
    </AlertDescription>
  </Alert>
)}
```

### Pattern 5: Skeleton Loading Replacement
**What:** Replace `Loader2` spinner patterns with layout-matching `Skeleton` components.
**When to use:** Any page currently using centered `Loader2` for data loading.
**Example:**
```typescript
// Before (current pattern in ~6 admin route files):
if (isLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// After (skeleton matching content layout):
if (isLoading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />           {/* title */}
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-lg" />  {/* card */}
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Component-level error boundaries:** D-11 explicitly says route-level only. Do not wrap individual components.
- **Generic empty state text:** D-14 requires contextual messaging per page. Never use "No data" or "No results" without context.
- **Loader2 spinner for page-level loading:** D-15 says replace with skeletons. Loader2 is acceptable only for inline button loading states (submit buttons).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error boundaries | Custom React ErrorBoundary class | TanStack Router `errorComponent` | Router auto-resets on navigation, handles loader errors natively |
| Tooltip/popover help | Custom tooltip component | Existing `TooltipIcon` (Popover + HelpCircle) | Already established pattern, accessible, mobile-friendly |
| Empty state rendering | Custom per-page empty divs | `EmptyState` component + `DataTable` `emptyTitle`/`emptyIcon` props | Consistent styling, icon + title + description + CTA pattern |
| Loading skeletons | Custom loading components | shadcn `Skeleton` with layout-matching dimensions | animate-pulse, consistent with design system |
| Radio toggle | Custom toggle buttons | shadcn `RadioGroup` + `RadioGroupItem` | Accessible, keyboard navigable, consistent styling |

## Common Pitfalls

### Pitfall 1: Sidebar defaultOpen Cookie Conflict
**What goes wrong:** Changing `defaultOpen` to `false` in SidebarProvider may conflict with the existing cookie `sidebar_state` that stores the user's preference.
**Why it happens:** SidebarProvider reads from cookie on mount. If user previously had sidebar open, cookie overrides `defaultOpen`.
**How to avoid:** The `defaultOpen` prop is only used when no controlled `open` prop is provided AND no cookie exists. Since the sidebar stores state in a cookie (`sidebar_state`), existing users will keep their preference. New users get `defaultOpen={false}`. This is the correct behavior -- no special handling needed.
**Warning signs:** Sidebar opens on page load despite setting `defaultOpen={false}`.

### Pitfall 2: Error Boundary Not Catching Render Errors
**What goes wrong:** `errorComponent` on layout routes may not catch errors from child routes' render phase if the error bubbles past the boundary.
**Why it happens:** TanStack Router's error boundaries catch errors in the route's own component and loader, but child route errors are caught by the child's own boundary (or the default).
**How to avoid:** Set `defaultErrorComponent` on the router as the catch-all. Each section layout route (voters, canvassing, etc.) gets its own `errorComponent` for section-level recovery. This creates the layered boundary structure D-08 and D-09 require.
**Warning signs:** Errors show the default TanStack error UI instead of custom Card component.

### Pitfall 3: Skeleton Layout Shift
**What goes wrong:** Skeletons that don't match final content dimensions cause layout shift when data loads.
**Why it happens:** Skeleton height/width doesn't match the rendered content.
**How to avoid:** Match skeleton dimensions to actual content. For tables, DataTable already handles this (5 skeleton rows matching column count). For card pages, use the same grid layout as the loaded state.
**Warning signs:** Content jumps/shifts when loading completes.

### Pitfall 4: TooltipIcon Import Path After Promotion
**What goes wrong:** Existing imports from `@/components/field/TooltipIcon` break after moving to `@/components/shared/TooltipIcon`.
**Why it happens:** Moving without updating imports or providing a re-export.
**How to avoid:** Either (a) update all existing imports (grep shows only `components/field/TooltipIcon.tsx` uses it currently, likely only in field routes), or (b) leave a re-export at the old path. Option (a) is cleaner since the component has limited usage.
**Warning signs:** Build errors referencing old import path.

### Pitfall 5: ZITADEL Invite API Not Ready
**What goes wrong:** The volunteer invite toggle (D-06) requires sending an invite email via ZITADEL, but the API endpoint for this may not exist yet.
**Why it happens:** The current volunteer creation API creates a database record only; ZITADEL user creation and invite email sending is a separate flow.
**How to avoid:** Check if an invite API endpoint exists. If not, the invite toggle UI can be built with the invite path showing a "Coming soon" or calling whatever ZITADEL invite endpoint is available. The tracked-only path is the existing behavior and requires no API changes.
**Warning signs:** Form submits but no invite email is sent.

## Code Examples

### Current EmptyState Usage (established pattern)
```typescript
// Source: web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx
<DataTable
  columns={columns}
  data={sessions ?? []}
  isLoading={isLoading}
  emptyIcon={Phone}
  emptyTitle="No sessions yet"
  emptyDescription="Create a phone bank session to get started."
  emptyAction={
    <Button onClick={() => setCreateOpen(true)}>Create Session</Button>
  }
/>
```

### Current TooltipIcon Pattern
```typescript
// Source: web/src/components/field/TooltipIcon.tsx
<TooltipIcon
  content="Brief explanation of what this field means"
  side="top"
/>
```

### DataTable Skeleton Loading (already built)
```typescript
// Source: web/src/components/shared/DataTable.tsx lines 121-131
{isLoading ? (
  Array.from({ length: 5 }).map((_, rowIdx) => (
    <TableRow key={`skeleton-${rowIdx}`}>
      {columns.map((_, colIdx) => (
        <TableCell key={`skeleton-${rowIdx}-${colIdx}`} className="py-3">
          <Skeleton className="h-5 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ))
) : /* ... */}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React class ErrorBoundary | TanStack Router `errorComponent` | TanStack Router v1.x | No need for class components; auto-reset on navigation |
| Spinner-based loading | Skeleton-based loading | Industry standard ~2022+ | Reduces perceived loading time, prevents layout shift |
| Native `title` tooltips | Popover-based help icons | shadcn/radix pattern | Mobile-friendly, styled consistently, no hover-only limitation |

## Open Questions

1. **ZITADEL Invite Endpoint**
   - What we know: D-06 requires sending an invite email via ZITADEL when "Invite to app" mode is selected
   - What's unclear: Whether a ZITADEL invite API endpoint is already wired up in the backend. The existing volunteer creation flow only creates a database record.
   - Recommendation: Check if `/api/v1/campaigns/{id}/invites` endpoint handles ZITADEL user creation. If not, the invite toggle can still be built with the UI distinction, and the actual ZITADEL integration can be deferred if the endpoint is missing. The "tracked-only" path is the existing behavior.

2. **Pages Needing Empty State Audit**
   - What we know: Most list pages already use `emptyTitle`/`emptyIcon` on DataTable or `EmptyState` directly. Grep shows ~20+ usage sites.
   - What's unclear: Whether every single list page has contextual (not generic) messaging.
   - Recommendation: Audit during planning. The complete list of list pages is: voters, call lists, walk lists, turfs, surveys, DNC, phone bank sessions, shifts, volunteer roster, volunteer tags, voter tags, voter lists, voter imports, org members.

3. **Loader2 Replacement Scope**
   - What we know: 6 admin route files use `Loader2` for page-level loading: `$campaignId.tsx`, `settings/general.tsx`, `settings/danger.tsx`, `volunteers/shifts/index.tsx`, `org/settings.tsx`, `campaigns/new.tsx`
   - What's unclear: Whether `campaigns/new.tsx` and `org/settings.tsx` Loader2 usage is for button submit state (acceptable) vs page loading (should be skeleton)
   - Recommendation: Button-level `Loader2` (inside submit buttons) is acceptable per D-15. Only replace page-level loading spinners.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 with happy-dom |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-05 | Route error boundaries render fallback UI | unit | `cd web && npx vitest run src/components/shared/RouteErrorBoundary.test.tsx -x` | Wave 0 |
| OBS-06 | Empty state shows contextual message per page | manual | Visual audit -- existing DataTable tests cover EmptyState rendering | Partial (existing tests mock EmptyState) |
| OBS-07 | Skeleton loading replaces Loader2 spinners | manual | Visual audit -- unit tests for individual pages already exist | Partial |
| UX-01 | Sidebar slides over, not pushes | manual | Visual/behavioral -- CSS-driven via existing shadcn sidebar | N/A |
| UX-02 | Volunteer form shows radio toggle for managers | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/volunteers/register/index.test.tsx -x` | Wave 0 |
| UX-03 | Tooltips appear at key decision points | manual | Visual audit | N/A |
| UX-04 | Inline hints at decision points | manual | Visual audit (same as UX-03 implementation) | N/A |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/components/shared/RouteErrorBoundary.test.tsx` -- covers OBS-05 (error boundary renders Card UI with retry button)
- [ ] No new test infrastructure needed -- vitest + happy-dom already configured

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` for Python operations (not relevant for this frontend-only phase)
- **Frontend stack:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Linting:** `uv run ruff check .` / `uv run ruff format .` for Python (not relevant here)
- **Context7 MCP:** Use for looking up library documentation
- **Commits:** Always use Conventional Commits

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `web/src/components/shared/EmptyState.tsx`, `DataTable.tsx`, `web/src/components/field/TooltipIcon.tsx`, `web/src/components/ui/sidebar.tsx`, `web/src/routes/__root.tsx`
- [TanStack Router Error Handling](https://deepwiki.com/TanStack/router/4.6-error-handling) - errorComponent API, props (error, reset, info), defaultErrorComponent on router
- [TanStack Router Error Boundaries docs](https://tanstack.com/start/latest/docs/framework/react/guide/error-boundaries) - official docs reference

### Secondary (MEDIUM confidence)
- [TanStack Router errorComponent API](https://tanstack.com/router/v1/docs/framework/react/api/router/errorComponentComponent) - API reference
- [GitHub Issue #1181](https://github.com/TanStack/router/issues/1181) - global error handling patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, versions verified from package.json
- Architecture: HIGH - patterns verified from existing codebase + TanStack Router docs
- Pitfalls: HIGH - derived from actual codebase analysis (cookie behavior, import paths, API gaps)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no fast-moving dependencies)
