# Phase 30: Field Layout Shell & Volunteer Landing - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Volunteers can enter field mode and see their active assignment without encountering any admin UI. This phase delivers: a mobile-optimized `/field` route tree with its own layout (no sidebar, no admin navigation), an assignment-aware landing hub, persistent back/help/avatar controls, and a new API endpoint for volunteer assignment detection. Canvassing wizard, phone banking flow, offline support, and onboarding tour are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Landing page content
- Single large tappable card per assignment type showing: assignment type icon, name, progress count (e.g., "12 of 47 doors"), and visual progress bar
- If volunteer has both canvassing AND phone banking assignments, show two stacked cards (one per type)
- At most one canvassing + one phone banking assignment shown (most recent active only)
- Empty state: friendly message "No assignment yet — check with your campaign coordinator" (no self-service shift signup)
- Personalized first-name greeting above assignment card(s): "Hey Sarah!" style

### Field header & navigation
- Header contains four elements: back arrow (left), screen title (center), help button (right), user avatar (far right)
- On the landing hub: no back arrow (hub is top level); title slot shows campaign name (e.g., "Johnson for Mayor")
- On sub-screens (canvassing, phone banking): back arrow returns to hub; title shows screen name (e.g., "Canvassing")
- Help button renders as visible but disabled/greyed-out "?" icon until Phase 34 wires it to tour replay
- Avatar menu shows volunteer name/email and sign out button (mirrors existing UserMenu dropdown pattern)

### Entry point & routing
- URL structure: `/field/{campaignId}` (hub), `/field/{campaignId}/canvassing`, `/field/{campaignId}/phone-banking`
- Separate `/field/` route tree with own layout component — no admin chrome (SidebarProvider, AppSidebar)
- Entry via direct link (coordinator shares URL) — always works for any authenticated campaign member
- Auto-redirect: users with only "volunteer" role redirect to `/field/{campaignId}` on login (always, regardless of assignment status)
- Any authenticated campaign member can access /field routes (admins/managers can preview volunteer experience)

### Assignment detection
- New `GET /api/v1/campaigns/{id}/field/me` endpoint returns volunteer's active assignments
- Response includes: at most one canvassing assignment (walk_list_id, name, total, completed) and at most one phone banking assignment (session_id, name, total, completed)
- Response also includes volunteer_name and campaign_name (one API call hydrates entire landing page)
- Landing page fetches on load + pull-to-refresh gesture — no background polling

### Campaign branding
- Campaign name displayed in hub header title slot — CivicPulse branding is invisible in field mode
- Volunteers identify which campaign they're working for via the header

### Loading & error states
- Loading: skeleton card placeholder shaped like the assignment card (shimmer effect)
- Error: "Couldn't load your assignments. Check your connection and try again." with Retry button
- No stale data caching in Phase 30 (offline support is Phase 33)

### Claude's Discretion
- Exact Tailwind styling and spacing for cards, header, and layout
- Skeleton animation implementation details
- Pull-to-refresh gesture library or implementation approach
- How to detect "volunteer-only" role for auto-redirect logic

</decisions>

<specifics>
## Specific Ideas

- Assignment card should feel like a single, prominent, tappable surface — "Tap to start" call-to-action
- Greeting should feel warm and personal ("Hey Sarah!") not formal ("Welcome, Sarah Johnson")
- Field layout should feel like a native mobile app, not a stripped-down desktop site
- The hub header with campaign name makes volunteers feel connected to the campaign, not to the platform

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EmptyState` component (`web/src/components/EmptyState.tsx`): Can be adapted for no-assignment state
- `UserMenu` component (in `__root.tsx`): Avatar + dropdown pattern to reuse in field header
- shadcn/ui primitives: Card, Button, Avatar, Skeleton, DropdownMenu all available
- `useAuthStore` (Zustand): Provides user profile, auth state, and logout function

### Established Patterns
- `__root.tsx` already branches layout for public vs authenticated routes — field routes add a third branch
- TanStack Router file-based routing: `web/src/routes/field/$campaignId/` directory creates the route tree
- React Query hooks pattern: `useFieldMe(campaignId)` follows existing `useWalkLists`, `useCallLists` pattern
- `ky` HTTP client with auth interceptor: field/me endpoint uses same `api.get()` pattern

### Integration Points
- `__root.tsx` RootLayout: needs to detect `/field` prefix and render field layout instead of sidebar layout
- `app/api/v1/router.py`: new field router included for `/field/me` endpoint
- `app/core/security.py`: existing `get_current_user` dependency provides volunteer identity for `/field/me`
- Login callback: auto-redirect logic hooks into post-auth flow in `callback.tsx` or `authStore.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 30-field-layout-shell-volunteer-landing*
*Context gathered: 2026-03-15*
