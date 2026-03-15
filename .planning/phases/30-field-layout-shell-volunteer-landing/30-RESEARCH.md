# Phase 30: Field Layout Shell & Volunteer Landing - Research

**Researched:** 2026-03-15
**Domain:** TanStack Router layout branching, mobile-optimized React UI, FastAPI volunteer assignment endpoint
**Confidence:** HIGH

## Summary

Phase 30 introduces a second layout tree (`/field/{campaignId}/...`) that runs alongside the existing admin sidebar layout. The core challenge is architectural: modifying `__root.tsx` to detect `/field` routes and render a distinct mobile-optimized shell, while keeping the admin layout untouched. The backend needs a single aggregation endpoint (`GET /api/v1/campaigns/{id}/field/me`) that queries `WalkListCanvasser` and `SessionCaller` tables to return the volunteer's active assignments with progress counts.

The existing codebase provides strong foundations: TanStack Router file-based routing handles the route tree naturally via `web/src/routes/field/$campaignId/` directory, React Query hooks follow an established pattern (`useWalkLists`, `useCallLists`), shadcn/ui has all needed primitives (Card, Progress, Avatar, Skeleton, DropdownMenu), and the auth store + permissions hook already expose role information for the auto-redirect logic.

**Primary recommendation:** Implement the field layout as a third branch in `RootLayout` (after public and before admin), create the `/field/me` aggregation endpoint using existing SQLAlchemy models, and add the volunteer-only auto-redirect in the OIDC callback handler.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single large tappable card per assignment type showing: assignment type icon, name, progress count (e.g., "12 of 47 doors"), and visual progress bar
- If volunteer has both canvassing AND phone banking assignments, show two stacked cards (one per type)
- At most one canvassing + one phone banking assignment shown (most recent active only)
- Empty state: friendly message "No assignment yet -- check with your campaign coordinator" (no self-service shift signup)
- Personalized first-name greeting above assignment card(s): "Hey Sarah!" style
- Header contains four elements: back arrow (left), screen title (center), help button (right), user avatar (far right)
- On the landing hub: no back arrow (hub is top level); title slot shows campaign name
- On sub-screens: back arrow returns to hub; title shows screen name
- Help button renders as visible but disabled/greyed-out "?" icon until Phase 34
- Avatar menu shows volunteer name/email and sign out button (mirrors existing UserMenu dropdown pattern)
- URL structure: `/field/{campaignId}` (hub), `/field/{campaignId}/canvassing`, `/field/{campaignId}/phone-banking`
- Separate `/field/` route tree with own layout component -- no admin chrome
- Entry via direct link (coordinator shares URL) -- always works for any authenticated campaign member
- Auto-redirect: users with only "volunteer" role redirect to `/field/{campaignId}` on login
- Any authenticated campaign member can access /field routes (admins/managers can preview)
- New `GET /api/v1/campaigns/{id}/field/me` endpoint returns volunteer's active assignments
- Response includes: at most one canvassing assignment (walk_list_id, name, total, completed) and at most one phone banking assignment (session_id, name, total, completed)
- Response also includes volunteer_name and campaign_name (one API call hydrates entire landing page)
- Landing page fetches on load + pull-to-refresh gesture -- no background polling
- Campaign name displayed in hub header title slot
- Loading: skeleton card placeholder shaped like the assignment card (shimmer effect)
- Error: "Couldn't load your assignments. Check your connection and try again." with Retry button
- No stale data caching in Phase 30

### Claude's Discretion
- Exact Tailwind styling and spacing for cards, header, and layout
- Skeleton animation implementation details
- Pull-to-refresh gesture library or implementation approach
- How to detect "volunteer-only" role for auto-redirect logic

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | Volunteer sees a dedicated field mode layout with no sidebar or admin navigation | RootLayout third branch in `__root.tsx` detecting `/field` prefix; separate FieldLayout component with own header |
| NAV-02 | Volunteer sees an assignment-aware landing page that routes to canvassing or phone banking | `GET /field/me` endpoint + `useFieldMe` hook + AssignmentCard components with router Links |
| NAV-03 | Volunteer can navigate back to the landing hub from any field screen | FieldHeader component with conditional back arrow based on route depth |
| NAV-04 | Volunteer sees a persistent help button to replay the guided tour | Help "?" button in FieldHeader, rendered disabled until Phase 34 wires driver.js |

</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-router | ^1.159.5 | File-based routing, layout routes | Already in use; `routes/field/$campaignId/` directory creates the route tree |
| @tanstack/react-query | ^5.90.21 | Data fetching, cache, refetch | Already in use; `useFieldMe` follows existing hook pattern |
| shadcn/ui (radix-ui) | ^1.4.3 | Card, Progress, Avatar, Skeleton, DropdownMenu | Already in use; all needed primitives available |
| lucide-react | ^0.563.0 | Icons (ArrowLeft, HelpCircle, Map, Phone) | Already in use |
| ky | ^1.14.3 | HTTP client with auth interceptor | Already in use via `api` singleton |
| zustand | ^5.0.11 | Auth state, role detection | Already in use via `useAuthStore` |
| FastAPI | (backend) | New field router endpoint | Already in use; follows existing router pattern |
| SQLAlchemy async | (backend) | Query WalkListCanvasser, SessionCaller | Already in use; existing models cover assignment data |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | ^4.1.18 | Mobile-first responsive styling | Field layout uses `min-h-svh`, touch-target sizing, flex layouts |
| sonner | ^2.0.7 | Toast notifications | Error retry feedback |

### No New Dependencies Needed
Pull-to-refresh can be implemented with native touch events and existing UI primitives. No library needed for the simple gesture in this phase. The `touchstart`/`touchmove`/`touchend` pattern with a threshold and visual indicator is straightforward and avoids adding a dependency for a single interaction.

## Architecture Patterns

### Recommended Project Structure
```
web/src/routes/field/
  $campaignId.tsx            # FieldLayout (header + outlet) - layout route
  $campaignId/
    index.tsx                # FieldHub (landing page with assignment cards)
    canvassing.tsx           # Placeholder for Phase 31
    phone-banking.tsx        # Placeholder for Phase 32

web/src/components/field/
  FieldHeader.tsx            # Back arrow + title + help + avatar
  AssignmentCard.tsx         # Tappable card with icon, name, progress
  AssignmentCardSkeleton.tsx # Shimmer loading placeholder
  FieldEmptyState.tsx        # No-assignment message

web/src/hooks/
  useFieldMe.ts             # React Query hook for GET /field/me

web/src/types/
  field.ts                  # FieldMeResponse type

app/api/v1/
  field.py                  # FastAPI router for /campaigns/{id}/field/me

app/schemas/
  field.py                  # Pydantic response schemas

app/services/
  field.py                  # Service layer for assignment aggregation queries
```

### Pattern 1: Layout Route Branching in __root.tsx
**What:** Add a third condition in `RootLayout` to detect `/field` prefix before the admin sidebar branch
**When to use:** When the same app needs completely different shells for different user experiences

Current flow in `__root.tsx`:
```typescript
// Current: public → admin
if (!isAuthenticated || isPublicRoute) return <PublicLayout />
return <AdminSidebarLayout />

// New: public → field → admin
const isFieldRoute = location.pathname.startsWith("/field")
if (!isAuthenticated || isPublicRoute) return <PublicLayout />
if (isFieldRoute) return <FieldShell />  // NEW: no sidebar, mobile-optimized
return <AdminSidebarLayout />
```

The field shell renders just:
```typescript
<div className="min-h-svh bg-background text-foreground">
  <Outlet />
  <Toaster />
</div>
```

The actual FieldHeader lives in the `field/$campaignId.tsx` layout route, not in `__root.tsx`. This keeps `__root.tsx` minimal and lets the field layout route own its own header/navigation.

### Pattern 2: File-Based Layout Route for Field
**What:** `web/src/routes/field/$campaignId.tsx` acts as a layout route that renders FieldHeader + Outlet
**When to use:** TanStack Router convention -- any `$param.tsx` file with `<Outlet />` wraps child routes

```typescript
// web/src/routes/field/$campaignId.tsx
function FieldLayout() {
  const { campaignId } = Route.useParams()
  const location = useRouterState({ select: (s) => s.location })
  const isHub = location.pathname === `/field/${campaignId}`

  return (
    <div className="flex min-h-svh flex-col">
      <FieldHeader campaignId={campaignId} isHub={isHub} />
      <main className="flex-1 px-4 pb-4">
        <Outlet />
      </main>
    </div>
  )
}
```

### Pattern 3: Volunteer Auto-Redirect on Login
**What:** After OIDC callback, detect if user has only "volunteer" role and redirect to `/field/{campaignId}` instead of `/`
**When to use:** In `callback.tsx` after `handleCallback()` resolves

Implementation approach for detecting "volunteer-only" role:
1. After `handleCallback()` succeeds, the OIDC user object is in the store
2. Extract roles from JWT claims using same logic as `usePermissions.ts`
3. If highest role is "volunteer", fetch `GET /api/v1/me/campaigns` to get the campaignId
4. Redirect to `/field/{campaignId}` instead of `/`
5. If role is manager/admin/owner, redirect to `/` as before

```typescript
// In callback.tsx after handleCallback()
const user = useAuthStore.getState().user
const role = extractRoleFromClaims(user)
if (role === "volunteer") {
  const campaigns = await api.get("api/v1/me/campaigns").json<UserCampaign[]>()
  if (campaigns.length > 0) {
    navigate({ to: `/field/${campaigns[0].campaign_id}` })
    return
  }
}
navigate({ to: "/" })
```

### Pattern 4: Single Aggregation Endpoint
**What:** `GET /api/v1/campaigns/{campaign_id}/field/me` returns everything the landing page needs in one call
**When to use:** Mobile-first design minimizes round trips

Backend query strategy:
1. Get `user.id` from JWT (via `get_current_user` dependency)
2. Query `WalkListCanvasser` joined with `WalkList` where `user_id = current_user.id` and campaign matches, ordered by `assigned_at DESC`, limit 1
3. Query `SessionCaller` joined with `PhoneBankSession` where `user_id = current_user.id` and session status = "active", ordered by `created_at DESC`, limit 1
4. Query `Campaign.name` for the campaign name
5. Get volunteer display name from `current_user.display_name` (already in JWT)
6. Return aggregated response

### Anti-Patterns to Avoid
- **Nesting field routes under /campaigns:** The field route tree MUST be at `/field/{campaignId}`, NOT `/campaigns/{campaignId}/field`. This avoids inheriting the CampaignLayout with its admin tab navigation.
- **Fetching assignments client-side from multiple endpoints:** Do NOT make separate calls to walk-lists and phone-bank-sessions. The `/field/me` endpoint aggregates server-side.
- **Putting FieldHeader in __root.tsx:** Keep `__root.tsx` minimal. The field header belongs in the `field/$campaignId.tsx` layout route.
- **Using useIsMobile() for layout decisions:** The field layout is ALWAYS mobile-optimized, even on desktop. Do not conditionally render based on viewport.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom div animation | shadcn `<Progress>` (already exists at `web/src/components/ui/progress.tsx`) | Accessible, styled, uses Radix primitive |
| Skeleton loading | Custom pulse CSS | shadcn `<Skeleton>` (already exists at `web/src/components/ui/skeleton.tsx`) | `animate-pulse` already configured |
| Avatar + dropdown | Custom popover | Existing `UserMenu` pattern from `__root.tsx` | Copy and adapt; same Avatar + DropdownMenu primitives |
| Touch target sizing | Manual pixel counting | Tailwind `min-h-11 min-w-11` (44px at default 16px base) | WCAG 2.5.5 compliance; consistent with A11Y-02 |
| Pull-to-refresh | Full gesture library | Native touchstart/touchmove/touchend + state | Simple threshold detection (60px pull), rotate indicator icon; no library needed for this |

## Common Pitfalls

### Pitfall 1: TanStack Router Layout Route File Naming
**What goes wrong:** Creating `field.tsx` instead of `field/$campaignId.tsx` breaks the route tree nesting
**Why it happens:** TanStack Router file-based routing requires the layout file to match the path segment pattern
**How to avoid:** The layout route file must be `web/src/routes/field/$campaignId.tsx` (with `<Outlet />`), and child routes go in `web/src/routes/field/$campaignId/index.tsx`, `canvassing.tsx`, etc.
**Warning signs:** Child routes render but without the FieldHeader wrapping them

### Pitfall 2: OIDC Callback Race Condition with API Calls
**What goes wrong:** Trying to fetch `/me/campaigns` in the callback before the auth token is properly stored
**Why it happens:** The `handleCallback()` sets state asynchronously; the `ky` interceptor reads from store
**How to avoid:** Ensure `handleCallback()` has completed and the store is updated before making the API call. Use `await` properly and read from the store after the state transition.
**Warning signs:** 401 errors during callback redirect

### Pitfall 3: RLS Context Not Set for Field Endpoint
**What goes wrong:** The `/field/me` endpoint returns empty results even when assignments exist
**Why it happens:** Every campaign-scoped query needs `set_campaign_context()` called first for RLS
**How to avoid:** Call `await set_campaign_context(db, str(campaign_id))` at the start of the endpoint handler, same as all other campaign endpoints
**Warning signs:** Empty query results, no SQL errors

### Pitfall 4: Field Route Not Detected Before Auth Check
**What goes wrong:** Unauthenticated users hitting `/field/...` see a flash of admin layout before redirect
**Why it happens:** The `/field` prefix check must come AFTER the auth check in `__root.tsx`, not before
**How to avoid:** Keep the order: (1) not initialized? loading spinner, (2) not authenticated or public? public layout, (3) field route? field shell, (4) else admin layout
**Warning signs:** Brief sidebar flash on field routes

### Pitfall 5: Progress Count Query Performance
**What goes wrong:** Counting completed entries with a full table scan on large walk lists
**Why it happens:** `WalkList.visited_entries` is a denormalized counter that may be stale
**How to avoid:** Use the denormalized `total_entries` and `visited_entries` columns on `WalkList` model (already maintained by the canvass service). Don't recount from `WalkListEntry` table.
**Warning signs:** Slow /field/me response on campaigns with large walk lists

## Code Examples

### FieldHeader Component
```typescript
// web/src/components/field/FieldHeader.tsx
import { ArrowLeft, HelpCircle } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/authStore"

interface FieldHeaderProps {
  campaignId: string
  title: string
  showBack?: boolean
}

export function FieldHeader({ campaignId, title, showBack = false }: FieldHeaderProps) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const displayName = user?.profile?.name || user?.profile?.email || "User"
  const initials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
      {showBack ? (
        <Link to={`/field/${campaignId}`} className="min-h-11 min-w-11 flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <div className="w-11" /> {/* spacer when no back arrow */}
      )}

      <h1 className="flex-1 text-center text-sm font-semibold truncate">{title}</h1>

      <Button variant="ghost" size="icon" disabled className="min-h-11 min-w-11">
        <HelpCircle className="h-5 w-5 text-muted-foreground/50" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="p-2">
            <p className="text-sm font-medium">{displayName}</p>
            {user?.profile?.email && (
              <p className="text-xs text-muted-foreground">{user.profile.email}</p>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
```

### useFieldMe Hook
```typescript
// web/src/hooks/useFieldMe.ts
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { FieldMeResponse } from "@/types/field"

export function useFieldMe(campaignId: string) {
  return useQuery({
    queryKey: ["field-me", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/field/me`).json<FieldMeResponse>(),
    enabled: !!campaignId,
    staleTime: 0, // Always refetch on mount (no caching in Phase 30)
  })
}
```

### Backend Field Endpoint
```python
# app/api/v1/field.py
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser, get_current_user
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.models.campaign import Campaign
from app.models.walk_list import WalkList, WalkListCanvasser
from app.models.phone_bank import PhoneBankSession, SessionCaller
from app.schemas.field import FieldMeResponse, CanvassingAssignment, PhoneBankingAssignment

router = APIRouter()

@router.get("/campaigns/{campaign_id}/field/me", response_model=FieldMeResponse)
async def get_field_me(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await set_campaign_context(db, str(campaign_id))

    # Campaign name
    campaign = await db.scalar(select(Campaign).where(Campaign.id == campaign_id))

    # Most recent canvassing assignment
    canvassing_row = await db.execute(
        select(WalkList)
        .join(WalkListCanvasser, WalkListCanvasser.walk_list_id == WalkList.id)
        .where(WalkListCanvasser.user_id == user.id, WalkList.campaign_id == campaign_id)
        .order_by(WalkListCanvasser.assigned_at.desc())
        .limit(1)
    )
    walk_list = canvassing_row.scalar_one_or_none()

    # Most recent active phone banking assignment
    phone_row = await db.execute(
        select(PhoneBankSession)
        .join(SessionCaller, SessionCaller.session_id == PhoneBankSession.id)
        .where(
            SessionCaller.user_id == user.id,
            PhoneBankSession.campaign_id == campaign_id,
            PhoneBankSession.status == "active",
        )
        .order_by(SessionCaller.created_at.desc())
        .limit(1)
    )
    session = phone_row.scalar_one_or_none()

    return FieldMeResponse(
        volunteer_name=user.display_name or user.email or "Volunteer",
        campaign_name=campaign.name if campaign else "Campaign",
        canvassing=CanvassingAssignment(...) if walk_list else None,
        phone_banking=PhoneBankingAssignment(...) if session else None,
    )
```

### FieldMeResponse Type (Frontend)
```typescript
// web/src/types/field.ts
export interface CanvassingAssignment {
  walk_list_id: string
  name: string
  total: number
  completed: number
}

export interface PhoneBankingAssignment {
  session_id: string
  name: string
  total: number
  completed: number
}

export interface FieldMeResponse {
  volunteer_name: string
  campaign_name: string
  canvassing: CanvassingAssignment | null
  phone_banking: PhoneBankingAssignment | null
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Router v6 layout routes | TanStack Router file-based layouts | Already in project | File naming convention determines nesting |
| Separate mobile app / responsive toggle | Dedicated route tree with mobile-first layout | Decided in CONTEXT.md | Field layout is always mobile-optimized, never shows desktop admin chrome |
| Multiple API calls for landing page | Single aggregation endpoint | Decided in CONTEXT.md | One round-trip hydrates the entire hub |

## Open Questions

1. **Phone banking progress counts**
   - What we know: `PhoneBankSession` doesn't have denormalized `total`/`completed` counters like `WalkList` does
   - What's unclear: Need to check if call list entries have a status field for counting, or if `CallRecord` count is needed
   - Recommendation: Check `CallList` model for `total_entries` and count `CallRecord` rows for completed. May need a subquery or denormalized field.

2. **Multi-campaign volunteers**
   - What we know: A volunteer could be a member of multiple campaigns. The auto-redirect uses `campaigns[0]`.
   - What's unclear: Which campaign to default to if volunteer has multiple active assignments
   - Recommendation: Use most recently joined campaign (first in API response, which is sorted by join date). This is sufficient for v1.4; multi-campaign selection is a v1.5 concern.

3. **Pull-to-refresh visual indicator**
   - What we know: Native touch events handle the gesture detection
   - What's unclear: Best visual treatment for the pull indicator
   - Recommendation: Simple approach -- show a small spinner/arrow icon that rotates as user pulls down past threshold, then trigger `queryClient.invalidateQueries(["field-me"])`. No library needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (unit) + Playwright 1.58.x (e2e) |
| Config file | `web/vitest.config.ts` (unit), `web/playwright.config.ts` (e2e) |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Field layout has no sidebar/admin nav | e2e | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | No - Wave 0 |
| NAV-02 | Assignment cards shown on landing | unit + e2e | `cd web && npx vitest run src/components/field/AssignmentCard.test.tsx` | No - Wave 0 |
| NAV-03 | Back arrow navigates to hub | e2e | `cd web && npx playwright test e2e/phase30-field-layout.spec.ts` | No - Wave 0 |
| NAV-04 | Help button visible but disabled | unit | `cd web && npx vitest run src/components/field/FieldHeader.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/components/field/FieldHeader.test.tsx` -- covers NAV-03, NAV-04
- [ ] `web/src/components/field/AssignmentCard.test.tsx` -- covers NAV-02
- [ ] `web/src/hooks/useFieldMe.test.ts` -- covers hook behavior, error states
- [ ] `web/e2e/phase30-field-layout.spec.ts` -- covers NAV-01, NAV-02, NAV-03 end-to-end
- [ ] `tests/test_field_me.py` -- covers backend endpoint (pytest)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `__root.tsx`, `callback.tsx`, `authStore.ts`, `usePermissions.ts` -- layout branching pattern, auth flow, role detection
- Codebase inspection: `walk_list.py`, `phone_bank.py` models -- assignment data schema (WalkListCanvasser, SessionCaller)
- Codebase inspection: `useWalkLists.ts` -- React Query hook pattern for the project
- Codebase inspection: `security.py` -- `get_current_user` dependency, `CampaignRole` hierarchy, `AuthenticatedUser` model
- Codebase inspection: `campaigns/$campaignId.tsx` -- layout route pattern with Outlet

### Secondary (MEDIUM confidence)
- TanStack Router file-based routing conventions (project already uses them successfully across 50+ route files)
- shadcn/ui primitives (Card, Progress, Skeleton, Avatar, DropdownMenu) verified present in `web/src/components/ui/`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use; zero new dependencies
- Architecture: HIGH -- layout branching pattern clearly visible in `__root.tsx`; file-based routing well-established
- Pitfalls: HIGH -- identified from direct codebase inspection (RLS, callback race, route naming)
- Backend endpoint: MEDIUM -- phone banking progress counts need verification against CallList/CallRecord models

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- all dependencies locked in package.json)
