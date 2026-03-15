# Architecture Patterns: v1.4 Volunteer Field Mode

**Domain:** Mobile-first volunteer experience for canvassing and phone banking
**Researched:** 2026-03-15
**Confidence:** HIGH (based on thorough codebase analysis of existing routes, hooks, layouts, and backend APIs)

## Recommended Architecture

### Strategy: New Route Subtree with Shared Layout Bypass

Field mode is a **parallel route subtree** (`/campaigns/$campaignId/field/...`) that bypasses the existing sidebar-heavy admin layout. It does NOT wrap existing routes, and it does NOT modify existing admin pages.

**Why a new subtree, not wrappers on existing routes:**

1. The existing admin pages (`canvassing/`, `phone-banking/`, `volunteers/`) have layout files that render side navigation, breadcrumbs, and data tables designed for managers at desktops. The `phone-banking.tsx` layout renders a 4-tab side nav (Sessions, Call Lists, DNC, My Sessions) that is irrelevant for a volunteer in the field. The `volunteers.tsx` layout has a 4-item side nav (Roster, Tags, Register, Shifts). Wrapping these with mobile-responsive logic would mean conditionally hiding most of each page.

2. TanStack Router's file-based routing makes layout inheritance automatic. A new `field.tsx` layout file creates clean separation -- the field layout renders a mobile-optimized shell while the admin layouts remain untouched.

3. The existing hooks (`useWalkLists`, `useWalkListEntries`, `useClaimEntry`, `useRecordCall`, `useRecordDoorKnock`, `useSurveyScript`) and all 20+ API endpoints require zero changes. Field mode routes import the same hooks with different UI.

### Route Structure

```
web/src/routes/
  __root.tsx                    # MODIFY: add field mode bypass (3 lines)
  campaigns/$campaignId/
    field.tsx                   # NEW: field mode layout (no sidebar, mobile shell)
    field/
      index.tsx                 # NEW: volunteer landing (routes to active assignment)
      canvassing/
        $walkListId.tsx         # NEW: linear canvassing wizard
      phone-banking/
        $sessionId.tsx          # NEW: tap-to-call phone banking mode
    canvassing.tsx              # UNCHANGED
    canvassing/...              # UNCHANGED
    phone-banking.tsx           # UNCHANGED
    phone-banking/...           # UNCHANGED
    volunteers.tsx              # UNCHANGED
    volunteers/...              # UNCHANGED
```

### Component Boundaries

| Component | Responsibility | New/Existing | Communicates With |
|-----------|---------------|--------------|-------------------|
| `field.tsx` (layout) | Mobile shell: no sidebar, sticky top bar, back nav, progress | **NEW** | `__root.tsx` (inherits auth), Outlet |
| `field/index.tsx` | Volunteer landing: shows active assignment, routes to canvassing or calling | **NEW** | `useShifts`, `useWalkLists`, `usePhoneBankSessions` |
| `field/canvassing/$walkListId.tsx` | Linear wizard: next address, knock, outcome, survey, next | **NEW** | `useWalkListEntries`, `useRecordDoorKnock`, `useSurveyScript` |
| `field/phone-banking/$sessionId.tsx` | Phone mode: claim, tap-to-call, outcome, survey, next | **NEW** | `useClaimEntry`, `useRecordCall`, `useSurveyScript` |
| `components/field/FieldShell.tsx` | Shared chrome: top bar, back button, campaign name, progress | **NEW** | Used by field.tsx layout |
| `components/field/WizardStepper.tsx` | Step indicator for canvassing flow | **NEW** | Receives step/total props |
| `components/field/OutcomeGrid.tsx` | Large touch-target outcome buttons | **NEW** | Imports `OUTCOME_GROUPS` and `RESULT_CODES` constants |
| `components/field/InlineSurvey.tsx` | Survey questions inline (not Card-wrapped) | **NEW** | `useSurveyScript`, `useRecordResponses` |
| `components/field/VoterCard.tsx` | Compact voter info for mobile | **NEW** | Receives voter data props |
| `components/field/AddressCard.tsx` | Address display with external maps link | **NEW** | Receives address props |
| `components/field/TourOverlay.tsx` | Step-by-step onboarding overlay | **NEW** | localStorage for completion state |
| `components/field/FieldProgress.tsx` | Walk list / call list progress indicator | **NEW** | Receives progress counts |
| All hooks in `web/src/hooks/` | Data fetching and mutations | **EXISTING** (zero changes) | API client via ky |
| All backend services | Business logic | **EXISTING** (zero changes) | PostgreSQL |
| All API endpoints | REST endpoints | **EXISTING** (zero changes) | Services |

### Integration with `__root.tsx` Layout

The root layout (lines 193-248) has conditional rendering:

```typescript
// Current logic:
const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r))
if (!isAuthenticated || isPublicRoute) {
  // Renders bare shell (no sidebar)
}
// Otherwise: SidebarProvider > AppSidebar > SidebarInset > header > main > Outlet
```

**Recommended change -- add field mode to the bypass condition:**

```typescript
const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r))
const isFieldMode = location.pathname.includes("/field")

if (!isAuthenticated || isPublicRoute) {
  return <div className="min-h-svh bg-background text-foreground"><Outlet /><Toaster /></div>
}
if (isFieldMode) {
  return <div className="min-h-svh bg-background text-foreground"><Outlet /><Toaster /></div>
}
// ... existing sidebar layout unchanged
```

This is 3 lines added. The field.tsx layout then renders its own mobile-optimized shell inside this bare wrapper. No sidebar DOM is rendered for field routes.

**Also add to AppSidebar:** A "Field Mode" link in the sidebar nav so admin users can access it:

```typescript
const navItems = [
  // ... existing items ...
  { to: `/campaigns/${campaignId}/field`, label: "Field Mode", icon: Smartphone },
]
```

### Data Flow

**No new backend APIs needed.** Every field mode screen reuses existing endpoints:

```
Volunteer Landing Page:
  GET /shifts                         -> useShifts (existing)
  GET /walk-lists                     -> useWalkLists (existing)
  GET /phone-bank-sessions            -> usePhoneBankSessions (existing)
  GET /walk-lists/{id}/canvassers     -> useListCanvassers (existing, filter for current user)

Canvassing Wizard:
  GET /walk-lists/{id}                -> useWalkList (existing)
  GET /walk-lists/{id}/entries        -> useWalkListEntries (existing)
  POST /walk-lists/{id}/door-knocks   -> useRecordDoorKnock (existing)
  PATCH /walk-lists/{id}/entries/{eid} -> useUpdateEntryStatus (existing)
  GET /surveys/{id}/questions         -> useSurveyScript (existing)
  POST /surveys/{id}/responses        -> useRecordResponses (existing)

Phone Banking Mode:
  GET /phone-bank-sessions/{id}       -> usePhoneBankSession (existing)
  GET /call-lists/{id}                -> useCallList (existing)
  POST /call-lists/{id}/claim         -> useClaimEntry (existing)
  POST /phone-bank-sessions/{id}/calls -> useRecordCall (existing)
  POST /phone-bank-sessions/{id}/release -> useSelfReleaseEntry (existing)
  GET /surveys/{id}/questions         -> useSurveyScript (existing)
```

**One potential new convenience API** (optional, nice-to-have):

```
GET /campaigns/{id}/my-assignments
  Returns: { walk_lists: [...], phone_bank_sessions: [...] }
```

This aggregates walk lists where the current user is an assigned canvasser (`WalkListCanvasser.user_id`) and sessions where the current user is an assigned caller (`SessionCaller.user_id`). The backend models already have these `user_id` columns. Without this, the landing page fetches all walk lists + all sessions and filters client-side, which works for small campaigns but is wasteful for large ones.

## Patterns to Follow

### Pattern 1: State Machine for Wizard Flow

**What:** Use a discriminated union type for wizard state, matching the proven pattern in `call.tsx` (lines 26-33).

**When:** Canvassing wizard and phone banking field mode.

**Why:** The existing `ActiveCallingPage` already proves this works. States: idle -> claiming -> claimed -> recording -> recorded -> next.

```typescript
// Canvassing wizard state machine
type CanvassingState =
  | { step: "navigating"; entry: WalkListEntry; entryIndex: number }
  | { step: "at-door"; entry: WalkListEntry; entryIndex: number }
  | { step: "recording"; entry: WalkListEntry; entryIndex: number }
  | { step: "surveying"; entry: WalkListEntry; entryIndex: number; resultCode: string }
  | { step: "complete" }
```

### Pattern 2: Hook Reuse Without Modification

**What:** Import existing hooks directly into field mode routes. Do not create wrapper hooks.

**When:** Every field mode page.

```typescript
// field/canvassing/$walkListId.tsx
import { useWalkList, useWalkListEntries, useRecordDoorKnock } from "@/hooks/useWalkLists"
import { useSurveyScript, useRecordResponses } from "@/hooks/useSurveys"
// Same hooks, different UI
```

### Pattern 3: New Components, Shared Constants

**What:** Create new UI components in `components/field/` that import shared constants from existing code.

**Why:** The existing `OutcomePanel` in `call.tsx` renders small desktop buttons. Field mode needs large `min-h-12` touch targets. The existing `DoorKnockDialog` uses a Select dropdown and a Dialog wrapper. Field mode needs inline full-screen outcome buttons. Adding `isMobile` props to these components would create dual-responsibility components.

```typescript
// components/field/OutcomeGrid.tsx -- NEW component
import { OUTCOME_GROUPS } from "@/types/phone-bank-session"
// Renders same data with large touch targets, no dialog wrapper

// components/field/InlineSurvey.tsx -- NEW component
import { useSurveyScript, useRecordResponses } from "@/hooks/useSurveys"
// Same hook, inline rendering instead of Card wrapper
```

**Constants shared between admin and field mode:**
- `OUTCOME_GROUPS` from `@/types/phone-bank-session` (used by `OutcomePanel` and new `OutcomeGrid`)
- `RESULT_CODES` from `DoorKnockDialog` (extract to `@/types/canvassing` or `@/constants/outcomes`)
- All TypeScript types (`WalkListEntry`, `CallListEntry`, `SurveyQuestion`, etc.)

### Pattern 4: localStorage for Tour State

**What:** Store onboarding tour completion in localStorage, keyed by campaign + user.

**When:** Tour/onboarding feature.

```typescript
const TOUR_KEY = `field-tour-${campaignId}-${userId}`
const [tourComplete, setTourComplete] = useState(
  () => localStorage.getItem(TOUR_KEY) === "done"
)
```

No backend storage needed. Tour state is per-device. Re-showing the tour on a new device is acceptable.

### Pattern 5: tel: Links for Tap-to-Call

**What:** Use `<a href="tel:+1XXXXXXXXXX">` for phone banking instead of building telephony.

**When:** Phone banking field mode.

**Why:** The existing `ActiveCallingPage` displays phone numbers as buttons for selection. Field mode converts these to actual `tel:` links that open the native dialer on mobile.

```typescript
<a
  href={`tel:${selectedPhone}`}
  className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground min-h-14 px-6 text-lg font-mono"
>
  Call {selectedPhone}
</a>
```

### Pattern 6: Progressive Disclosure via Existing Primitives

**What:** Use existing shadcn `Accordion` (already in codebase at `components/ui/accordion.tsx`) for collapsible wizard steps.

**When:** Canvassing wizard showing completed vs. current step.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding `isMobile` Props to Existing Components

**What:** Modifying `DoorKnockDialog`, `SurveyWidget`, `OutcomePanel` to accept field mode variants.

**Why bad:** Creates dual-responsibility components. Testing surface doubles. Every future change must consider two rendering modes. The existing admin pages are stable and complete -- v1.2 shipped 11 phases of UI.

**Instead:** Create new components in `components/field/` that compose the same hooks and types.

### Anti-Pattern 2: Rewriting Existing Routes for Both Modes

**What:** Making `/campaigns/$campaignId/canvassing/walk-lists/$walkListId` render differently based on `?mode=field` or `useIsMobile()`.

**Why bad:** The existing walk list detail page has a full entries table, canvasser management section, delete button, and back navigation to the canvassing index. The field mode has a single-entry wizard with large buttons. These are fundamentally different UIs that share a data source, not variants of the same UI.

**Instead:** Separate route subtrees with separate layouts.

### Anti-Pattern 3: Building a Custom Tour Library

**What:** Implementing step-by-step tour from scratch with portal management, scroll positioning, backdrop overlay.

**Why bad:** Tour libraries handle z-index stacking, scroll-into-view, resize, and keyboard nav. Field mode screens are simple enough that a minimal approach works: a full-screen overlay with static step content, no element highlighting needed.

**Instead:** Build a simple step-through overlay (not element-anchored). The field mode screens are linear and the volunteer sees them one at a time. A "Welcome to Field Mode" tour with 3-4 screens showing what each button does is sufficient. No need for element-anchored highlighting.

### Anti-Pattern 4: Creating Backend "Field Mode" Endpoints

**What:** Building `/api/v1/campaigns/{id}/field/canvass` or similar.

**Why bad:** The backend already has all needed endpoints. Field mode is purely a frontend UX concern.

**Instead:** Reuse all existing endpoints. The only potential new endpoint is `GET /my-assignments` (convenience aggregation).

## New Component Directory Structure

```
web/src/
  components/
    field/                          # NEW directory
      FieldShell.tsx                # Top bar, back nav, campaign name
      WizardStepper.tsx             # Step indicator (1/4, 2/4, etc.)
      OutcomeGrid.tsx               # Large touch-target outcome buttons
      InlineSurvey.tsx              # Survey questions inline (not Card-wrapped)
      VoterCard.tsx                 # Compact voter info for mobile
      AddressCard.tsx               # Address with maps link
      TourOverlay.tsx               # Step-through onboarding overlay
      FieldProgress.tsx             # Walk list / call list progress bar
  routes/
    campaigns/$campaignId/
      field.tsx                     # Layout: FieldShell + Outlet
      field/
        index.tsx                   # Landing page
        canvassing/$walkListId.tsx  # Canvassing wizard
        phone-banking/$sessionId.tsx # Phone banking mode
```

## Integration Points Summary

| Existing Entity | Field Mode Touches | Change |
|-----------------|-------------------|--------|
| `__root.tsx` | Add field mode bypass | 3-line condition to skip sidebar for `/field` routes |
| `AppSidebar` in `__root.tsx` | Add "Field Mode" nav link | 1 new nav item |
| `useWalkLists` hook | Import as-is | Zero changes |
| `useWalkListEntries` hook | Import as-is | Zero changes |
| `useRecordDoorKnock` hook | Import as-is | Zero changes |
| `usePhoneBankSessions` hook | Import as-is | Zero changes |
| `useClaimEntry` hook | Import as-is | Zero changes |
| `useRecordCall` hook | Import as-is | Zero changes |
| `useSelfReleaseEntry` hook | Import as-is | Zero changes |
| `useSurveyScript` hook | Import as-is | Zero changes |
| `useRecordResponses` hook | Import as-is | Zero changes |
| `useShifts` hook | Import as-is | Zero changes |
| `usePermissions` hook | Import as-is | Gate field mode to volunteer+ role |
| `useIsMobile` hook | Import as-is | Optional: auto-suggest field mode on mobile |
| `OUTCOME_GROUPS` constant | Import as-is | Shared with new OutcomeGrid |
| `RESULT_CODES` constant | Extract from DoorKnockDialog | Move to shared location for reuse |
| All types in `types/` | Import as-is | `WalkListEntry`, `CallListEntry`, `SurveyQuestion` |
| Backend API (20+ endpoints) | Zero changes | All operations use existing endpoints |
| Backend services | Zero changes | Business logic unchanged |

## Suggested Build Order

Based on dependency analysis:

### Phase 1: Field Layout Shell + Root Bypass
- `field.tsx` layout with FieldShell component
- `__root.tsx` modification (3-line field mode bypass)
- Add "Field Mode" link to AppSidebar
- **Depends on:** Nothing. Foundation for all field mode routes.

### Phase 2: Volunteer Landing Page
- `field/index.tsx` that detects active shift/assignment
- Uses `useShifts`, `useWalkLists`, `usePhoneBankSessions` to find what the volunteer should be doing
- Routes to canvassing or phone banking based on assignment
- **Depends on:** Phase 1 (field layout).

### Phase 3: Canvassing Wizard
- `field/canvassing/$walkListId.tsx` with state machine
- Extract `RESULT_CODES` to shared constants
- New components: OutcomeGrid, VoterCard, AddressCard, WizardStepper, FieldProgress
- Reuses `useWalkListEntries`, `useRecordDoorKnock`, `useUpdateEntryStatus`
- **Depends on:** Phase 1 (layout). Most complex new route.

### Phase 4: Inline Survey Integration
- InlineSurvey component integrated into canvassing wizard
- Reuses `useSurveyScript`, `useRecordResponses`
- Must work for both canvassing (Phase 3) and phone banking (Phase 5)
- **Depends on:** Phase 3 (canvassing wizard provides the integration point).

### Phase 5: Phone Banking Field Mode
- `field/phone-banking/$sessionId.tsx` with state machine
- Adds `tel:` links for tap-to-call
- Reuses OutcomeGrid, InlineSurvey (already built in Phases 3-4)
- Closely mirrors existing `call.tsx` but with mobile layout
- **Depends on:** Phases 1, 3, 4 (layout + shared field components).

### Phase 6: Onboarding Tour
- TourOverlay component with localStorage state
- Step-through overlay (not element-anchored) showing field mode basics
- Auto-shows on first visit, option to revisit via settings
- **Depends on:** All field mode routes complete (tour describes them).

### Phase 7: Contextual Help + Polish
- Tooltips on field mode buttons using existing `tooltip.tsx` primitive
- Mobile touch target validation (min 44px)
- Progressive disclosure refinements
- **Depends on:** All field mode routes complete.

## Scalability Considerations

| Concern | Current (v1.4) | Future |
|---------|----------------|--------|
| Walk list size | Client-side list from `useWalkListEntries` (works for <500 entries) | Paginate entries; server-side "next unvisited" endpoint |
| Offline support | Cellular connectivity assumed | Service worker + IndexedDB for offline door knocks |
| Real-time sync | Not needed (single volunteer per walk list section) | SSE for multi-volunteer walk list coordination |
| Map integration | AddressCard with Google Maps `geo:` link | Embedded map with route optimization |
| GPS tracking | Not needed | Geolocation API for auto-detecting "at door" state |
| My-assignments API | Client-side filter of all walk lists/sessions | Dedicated endpoint if campaigns exceed 50 walk lists |

## Sources

- Direct codebase analysis:
  - `__root.tsx` (layout hierarchy, sidebar conditional rendering)
  - `call.tsx` (state machine pattern, VoterInfoPanel, SurveyPanel, OutcomePanel)
  - `DoorKnockDialog.tsx` (door knock recording flow, RESULT_CODES)
  - `SurveyWidget.tsx` (survey rendering pattern)
  - `field-ops.ts` / `useFieldOps.ts` (existing hooks)
  - `useWalkLists.ts` (all walk list hooks)
  - `usePhoneBankSessions.ts` (claim/record/release hooks)
  - `useSurveys.ts` (survey script and response hooks)
  - `usePermissions.ts` (role gating)
  - `use-mobile.ts` (mobile detection)
  - `volunteers.tsx`, `phone-banking.tsx`, `canvassing.tsx` (existing layout files)
  - All backend API files in `app/api/v1/` (confirmed all needed endpoints exist)
  - `app/services/shift.py` (check-in creates canvasser/caller records automatically)
- All recommendations based on direct codebase analysis; no external library dependencies introduced

---
*Architecture research for: v1.4 Volunteer Field Mode*
*Researched: 2026-03-15*
