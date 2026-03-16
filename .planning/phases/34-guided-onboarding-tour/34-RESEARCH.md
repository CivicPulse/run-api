# Phase 34: Guided Onboarding Tour - Research

**Researched:** 2026-03-16
**Domain:** Frontend guided tour / onboarding UX (driver.js + React 19 + Zustand)
**Confidence:** HIGH

## Summary

Phase 34 adds a guided onboarding experience to the field mode screens built in Phases 30-32. The core deliverable is a driver.js-powered step-by-step tour split into three contextual segments (welcome, canvassing, phone banking), per-segment completion persistence in localStorage, help button wiring for context-aware replay, persistent contextual tooltip icons on key actions, and inline quick-start instruction cards.

driver.js is the locked library choice (selected in v1.4 research due to react-joyride's React 19 incompatibility). It is framework-agnostic (~5kb gzipped), works via vanilla DOM selectors, and provides a clean imperative API (`driver()`, `drive()`, `destroy()`). Since driver.js is not a React library, integration requires a custom React hook wrapper that manages the driver instance lifecycle. The tour state (completion tracking, session counts) should use a Zustand persist store with localStorage -- matching the established pattern from `offlineQueueStore.ts`.

**Primary recommendation:** Create a `useTourStore` Zustand persist store for completion/session state, a `useTour` React hook wrapping driver.js imperative API, and integrate via `data-tour-*` attributes on target components. Keep driver.js CSS overrides in a single `tour.css` file imported alongside `driver.js/dist/driver.css`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three segments: welcome (hub), canvassing (wizard), phone banking (calling) with specific step counts and content
- Welcome segment auto-triggers on first visit to `/field/{campaignId}` (hub)
- Canvassing segment auto-triggers on first visit to `/field/{campaignId}/canvassing`
- Phone banking segment auto-triggers on first visit to `/field/{campaignId}/phone-banking`
- Segments are independent -- a volunteer who only does canvassing never sees the phone banking tour
- Tap-to-advance (Next button) -- no auto-advance timers
- Friendly casual tone matching Phase 30's "Hey Sarah!" style
- Each step shows "Step N of M" indicator and a "Skip" button to exit the tour early
- localStorage-based persistence keyed by `tour_{campaignId}_{userId}`
- Per-segment tracking: `{ welcome: true, canvassing: true, phoneBanking: false }`
- Skipping/dismissing mid-tour marks that segment as complete
- No backend API needed -- device-local only
- Wire the disabled help "?" button in FieldHeader to trigger context-aware tour replay
- Context-aware replay: on hub -> welcome, on canvassing -> canvassing, on phone banking -> phone banking
- Help button becomes enabled (full opacity, tappable) once this phase is complete
- Dismissible inline quick-start card at top of canvassing/phone-banking screens
- Quick-start shows for first 3 sessions of each activity type, then stops
- Quick-start card does NOT appear while tour is actively running
- 4 persistent contextual tooltip icons (outcome buttons, progress bar, skip button, phone number/tap-to-call)
- Tooltip icons use HelpCircle lucide icon at 14px, muted
- Tap tooltip opens popover bubble with 1-2 sentences; tap anywhere else to dismiss

### Claude's Discretion
- Exact driver.js configuration (overlay color/opacity, popover positioning, animation timing)
- driver.js CSS customization to work with Tailwind v4
- Tooltip popover positioning and arrow placement
- Quick-start card styling and animation
- Whether to use a Zustand store or raw localStorage for tour state
- Step content copy refinement (exact wording within the friendly casual tone)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOUR-01 | Volunteer sees a guided step-by-step tour on first visit to field mode | driver.js `drive()` API with `steps` config; auto-trigger via useEffect in route components checking completion state |
| TOUR-02 | Tour is split into segments (welcome, canvassing, phone banking) that run contextually | Three separate step arrays passed to driver.js; each segment triggers independently on its route |
| TOUR-03 | Tour completion state persists so it only runs once per volunteer per campaign | Zustand persist store with localStorage keyed by `tour_{campaignId}_{userId}` |
| TOUR-04 | Volunteer can replay the tour at any time via the help button | FieldHeader help button wired to context-aware replay via `useTour` hook |
| TOUR-05 | Volunteer sees contextual tooltip icons on key actions explaining what they do | shadcn Popover components with HelpCircle icons at 14px on 4 target elements |
| TOUR-06 | Volunteer sees brief quick-start instructions before beginning canvassing or phone banking | Dismissible card component; session count tracked in tour store; hidden when tour active |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| driver.js | 1.4.0 | Step-by-step guided tour engine | Locked decision -- vanilla TS, ~5kb, React 19 compatible (no React dependency), zero deps |
| zustand | 5.0.11 | Tour completion & session state persistence | Already in project; persist middleware with localStorage pattern established |
| lucide-react | 0.563.0 | HelpCircle icon for tooltips and help button | Already in project; used in FieldHeader |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| radix-ui (via shadcn) | 1.4.3 | Popover component for contextual tooltips | For the 4 persistent tooltip icons |
| sonner | 2.0.7 | Toast for "Tour complete!" feedback | Optional completion celebration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| driver.js | react-joyride | react-joyride has React 19 incompatibility -- ruled out in v1.4 research |
| Zustand store | Raw localStorage | Zustand gives reactive state + partialize + established pattern; raw localStorage requires manual event listeners |

**Installation:**
```bash
cd web && npm install driver.js
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── stores/
│   └── tourStore.ts           # Zustand persist store for tour/session state
├── hooks/
│   └── useTour.ts             # React hook wrapping driver.js imperative API
├── components/field/
│   ├── QuickStartCard.tsx     # Dismissible inline instruction card
│   ├── TooltipIcon.tsx        # Reusable contextual tooltip icon (HelpCircle + Popover)
│   └── tour/
│       └── tourSteps.ts       # Step definitions for all 3 segments
├── styles/
│   └── tour.css               # driver.js CSS overrides for Tailwind v4 compatibility
```

### Pattern 1: Tour Store (Zustand Persist)
**What:** Centralized state for tour completion, session counts, and active tour tracking
**When to use:** All tour-related state management
**Example:**
```typescript
// Source: Project pattern from offlineQueueStore.ts + CONTEXT.md decisions
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface TourState {
  // Per-campaign, per-user completion state
  completions: Record<string, {
    welcome: boolean
    canvassing: boolean
    phoneBanking: boolean
  }>
  // Per-campaign, per-user session counts for quick-start cards
  sessionCounts: Record<string, {
    canvassing: number
    phoneBanking: number
  }>
  // Whether a tour is actively running (to suppress quick-start card)
  isRunning: boolean

  // Actions
  markComplete: (key: string, segment: "welcome" | "canvassing" | "phoneBanking") => void
  isSegmentComplete: (key: string, segment: "welcome" | "canvassing" | "phoneBanking") => boolean
  incrementSession: (key: string, activity: "canvassing" | "phoneBanking") => void
  getSessionCount: (key: string, activity: "canvassing" | "phoneBanking") => number
  setRunning: (running: boolean) => void
}

// Key construction: `${campaignId}_${userId}`
export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      completions: {},
      sessionCounts: {},
      isRunning: false,
      // ... actions
    }),
    {
      name: "tour-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        completions: state.completions,
        sessionCounts: state.sessionCounts,
      }),
    }
  )
)
```

### Pattern 2: Tour Hook (driver.js Wrapper)
**What:** React hook that initializes driver.js, manages lifecycle, handles cleanup
**When to use:** Route components that trigger tour segments
**Example:**
```typescript
// Source: driver.js API docs (driverjs.com/docs/api)
import { useEffect, useRef, useCallback } from "react"
import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import "@/styles/tour.css"
import { useTourStore } from "@/stores/tourStore"

export function useTour(campaignId: string, userId: string) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  const startSegment = useCallback((
    segment: "welcome" | "canvassing" | "phoneBanking",
    steps: DriveStep[]
  ) => {
    // Clean up any existing tour
    driverRef.current?.destroy()

    const tourKey = `${campaignId}_${userId}`
    const { setRunning, markComplete } = useTourStore.getState()

    setRunning(true)

    const driverObj = driver({
      showProgress: true,
      progressText: "Step {{current}} of {{total}}",
      nextBtnText: "Next",
      doneBtnText: "Done",
      showButtons: ["next", "close"],
      allowClose: true,
      overlayColor: "black",
      overlayOpacity: 0.5,
      stagePadding: 10,
      stageRadius: 8,
      popoverOffset: 12,
      animate: true,
      steps,
      onDestroyed: () => {
        markComplete(tourKey, segment)
        setRunning(false)
        driverRef.current = null
      },
    })

    driverRef.current = driverObj
    driverObj.drive()
  }, [campaignId, userId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  return { startSegment }
}
```

### Pattern 3: data-tour Attribute Selectors
**What:** Use `data-tour-*` attributes as driver.js element selectors instead of coupling to CSS classes
**When to use:** All tour target elements
**Example:**
```typescript
// On target component:
<div data-tour="assignment-card">...</div>

// In step definition:
{ element: "[data-tour='assignment-card']", popover: { ... } }
```

### Pattern 4: Help Button Context Detection
**What:** FieldHeader help button detects current route to trigger correct segment
**When to use:** Help button replay functionality
**Example:**
```typescript
// In FieldHeader, detect sub-route from pathname
const getActiveSegment = (pathname: string, campaignId: string) => {
  if (pathname.includes("/canvassing")) return "canvassing"
  if (pathname.includes("/phone-banking")) return "phoneBanking"
  return "welcome"
}
```

### Anti-Patterns to Avoid
- **Wrapping driver.js in a React component:** driver.js is imperative, not declarative. Don't try to make it a `<Tour>` component -- use a hook with refs.
- **Using CSS class selectors for tour targets:** Classes get renamed by build tools or Tailwind. Use `data-tour-*` attributes instead.
- **Starting tour before DOM content loads:** Tour must wait for data loading to complete (elements must be in DOM). Use a `useEffect` with data-ready guards, not just mount.
- **Storing tour state in sessionStorage:** Tour completion must survive across sessions. Use localStorage only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Guided overlay tour | Custom overlay + positioning + scroll management | driver.js | Overlay z-index stacking, scroll-into-view, resize handling, arrow positioning are all edge-case heavy |
| Popover positioning | Custom positioned divs | shadcn Popover (Radix) | Viewport collision detection, portal rendering, arrow placement |
| Persistent state with reactive updates | Raw localStorage + event listeners | Zustand persist | Reactive re-renders, partialize, JSON serialization, cross-tab sync |

**Key insight:** driver.js handles the hard parts of tour UX (overlay cutouts, scroll-to-element, popover positioning, z-index management). The custom code is limited to state management and glue hooks.

## Common Pitfalls

### Pitfall 1: driver.js CSS Specificity with Tailwind v4
**What goes wrong:** driver.js ships its own CSS (`driver.js/dist/driver.css`) that may conflict with Tailwind v4's layer-based approach. Popover styles might get overridden or vice versa.
**Why it happens:** Tailwind v4 uses CSS layers; driver.js CSS is not layered. Specificity conflicts depend on import order.
**How to avoid:** Import `driver.js/dist/driver.css` early (in the tour.css file or main entry). Write overrides in a dedicated `tour.css` file with higher specificity selectors (e.g., `.driver-popover.driver-popover`). Test visually on mobile viewport.
**Warning signs:** Popovers render but look wrong (missing background, wrong font, broken arrows).

### Pitfall 2: Tour Triggers on Route With Loading States
**What goes wrong:** Tour starts before data loads, targeting elements that don't exist yet in the DOM.
**Why it happens:** `useEffect` runs on mount, but data fetching is async. Elements like HouseholdCard or AssignmentCard aren't rendered until data arrives.
**How to avoid:** Guard tour trigger with data-ready checks: `if (!isLoading && data && !isSegmentComplete(key, segment)) startSegment(...)`. Consider a short `setTimeout` (300ms) to allow animations to complete.
**Warning signs:** driver.js highlights nothing or highlights the wrong area of the page.

### Pitfall 3: Tour Cleanup on Navigation
**What goes wrong:** Volunteer navigates away mid-tour; driver.js overlay persists on next page.
**Why it happens:** driver.js instance not destroyed on component unmount.
**How to avoid:** Always call `driverRef.current?.destroy()` in the useEffect cleanup. The `onDestroyed` callback should mark the segment complete (dismissing mid-tour = complete per CONTEXT.md).
**Warning signs:** Black overlay stuck on screen after navigation.

### Pitfall 4: Phone Banking Custom Header Missing Help Button
**What goes wrong:** Phone banking's main calling view uses a custom header (not FieldHeader) that replaces the back arrow with an end-session dialog trigger. The help button is absent from this custom header.
**Why it happens:** Phase 32 decision: "Custom header replaces FieldHeader in main calling view to intercept back arrow for end session confirmation."
**How to avoid:** The phone banking calling view's custom header (lines 197-213 in phone-banking.tsx) needs a help button added, OR the phone banking tour must be triggered only before entering the calling view. Given that the tour targets elements IN the calling view (PhoneNumberList, OutcomeGrid, End Session button), the custom header needs a help button added.
**Warning signs:** No way to replay phone banking tour; help button only visible on loading/error states.

### Pitfall 5: Multiple Overlapping Zustand Keys
**What goes wrong:** Tour state keyed by `tour_{campaignId}_{userId}` but userId is accessed from OIDC `user.profile.sub` which may be undefined during initialization.
**Why it happens:** Auth state may not be fully loaded when tour store key is constructed.
**How to avoid:** Guard tour operations with `if (!user?.profile?.sub) return`. Never construct the key with undefined values.
**Warning signs:** Tour state saved with key `tour_abc_undefined`, tour replays every visit.

## Code Examples

### driver.js Step Definitions
```typescript
// Source: driverjs.com/docs/configuration + CONTEXT.md step content
import type { DriveStep } from "driver.js"

export const welcomeSteps: DriveStep[] = [
  {
    element: "[data-tour='hub-greeting']",
    popover: {
      title: "Welcome!",
      description: "This is your home base. You'll find all your assignments right here.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='assignment-card']",
    popover: {
      title: "Your Assignment",
      description: "Tap your assignment to get started. We'll walk you through everything!",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='help-button']",
    popover: {
      title: "Need Help?",
      description: "Tap here anytime to replay this walkthrough.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "[data-tour='avatar-menu']",
    popover: {
      title: "Your Account",
      description: "Manage your account and sign out from here.",
      side: "bottom",
      align: "end",
    },
  },
]
```

### driver.js CSS Overrides for Tailwind v4
```css
/* src/styles/tour.css */
/* Import driver.js base styles */
@import "driver.js/dist/driver.css";

/* Override popover to match app design system */
.driver-popover {
  font-family: inherit;
  border-radius: 12px;
  padding: 16px;
  max-width: 320px;
}

.driver-popover-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground, #1a1a1a);
}

.driver-popover-description {
  font-size: 14px;
  color: var(--muted-foreground, #6b7280);
  line-height: 1.5;
}

.driver-popover-footer {
  margin-top: 12px;
}

.driver-popover-footer button {
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  min-height: 44px; /* Touch target per A11Y-02 */
}

.driver-popover-progress-text {
  font-size: 12px;
  color: var(--muted-foreground, #6b7280);
}
```

### Quick-Start Card Component
```typescript
// Source: CONTEXT.md quick-start card decisions
import { X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface QuickStartCardProps {
  type: "canvassing" | "phoneBanking"
  onDismiss: () => void
}

const CONTENT = {
  canvassing: [
    "Tap a result after each door",
    "Skip houses you can't reach",
    "Your progress saves automatically",
  ],
  phoneBanking: [
    "Tap a number to call",
    "Record the result after hanging up",
    "End session when you're done",
  ],
}

export function QuickStartCard({ type, onDismiss }: QuickStartCardProps) {
  return (
    <Card className="relative mb-4 border-blue-200 bg-blue-50 p-3">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-8 w-8 min-h-8 min-w-8"
        onClick={onDismiss}
        aria-label="Dismiss quick start tips"
      >
        <X className="h-4 w-4" />
      </Button>
      <ul className="space-y-1 pr-8 text-sm text-blue-900">
        {CONTENT[type].map((tip) => (
          <li key={tip}>• {tip}</li>
        ))}
      </ul>
    </Card>
  )
}
```

### Tooltip Icon Component
```typescript
// Source: CONTEXT.md tooltip decisions + shadcn Popover pattern
import { HelpCircle } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface TooltipIconProps {
  content: string
  side?: "top" | "right" | "bottom" | "left"
}

export function TooltipIcon({ content, side = "top" }: TooltipIconProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center p-1"
          aria-label="More info"
        >
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className="max-w-[240px] text-sm"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-joyride for React tours | driver.js (vanilla) with React wrapper hook | 2024 (React 19 release) | react-joyride has React 19 compat issues; driver.js works everywhere |
| Cookie-based tour completion | localStorage with structured keys | Standard practice | No server round-trip, works offline |
| Class-based element selectors | data-attribute selectors | Current best practice | Decoupled from styling, survives CSS changes |

**Deprecated/outdated:**
- driver.js v0.x: Completely different API. Current version is 1.4.x with `driver()` factory function (not `new Driver()`).

## Open Questions

1. **Phone banking custom header help button**
   - What we know: Phone banking's calling view uses a custom header without a help button
   - What's unclear: Whether to add help button to the custom header or use a different replay mechanism
   - Recommendation: Add a help button to the custom header to match FieldHeader's layout. This is the simplest approach and maintains UX consistency.

2. **Tour trigger timing after data load**
   - What we know: Elements must be in DOM before tour starts; data is async
   - What's unclear: Exact delay needed after data renders
   - Recommendation: Use a combination of data-ready guard + requestAnimationFrame or 200ms setTimeout to ensure DOM is painted.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (unit) + Playwright 1.58.2 (e2e) |
| Config file | `web/vitest.config.ts` + `web/playwright.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOUR-01 | Tour auto-triggers on first visit | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | No - Wave 0 |
| TOUR-02 | Tour runs contextual segments | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | No - Wave 0 |
| TOUR-03 | Tour completion persists in localStorage | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | No - Wave 0 |
| TOUR-04 | Help button triggers replay | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | No - Wave 0 |
| TOUR-05 | Tooltip icons show popovers | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | No - Wave 0 |
| TOUR-06 | Quick-start cards show for first 3 sessions | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/stores/tourStore.test.ts` -- covers TOUR-03, TOUR-06 (store logic)
- [ ] `web/src/hooks/useTour.test.ts` -- covers TOUR-02 (segment selection)
- [ ] `web/e2e/tour-onboarding.spec.ts` -- covers TOUR-01, TOUR-04, TOUR-05 (integration)
- [ ] Framework install: `cd web && npm install driver.js` -- driver.js not yet installed

## Sources

### Primary (HIGH confidence)
- [driver.js official docs - Installation](https://driverjs.com/docs/installation) - Import syntax, CSS requirements
- [driver.js official docs - API Reference](https://driverjs.com/docs/api) - Methods: drive(), destroy(), setSteps(), etc.
- [driver.js official docs - Configuration](https://driverjs.com/docs/configuration) - All config options, step schema, popover schema, lifecycle hooks
- [driver.js official docs - Styling](https://driverjs.com/docs/styling) - CSS class names, override approach
- Project source: `web/src/stores/offlineQueueStore.ts` - Zustand persist + localStorage pattern
- Project source: `web/src/stores/canvassingStore.ts` - Zustand persist pattern
- Project source: `web/src/components/field/FieldHeader.tsx` - Disabled help button (lines 60-67)
- Project source: `web/src/routes/field/$campaignId.tsx` - Field layout shell
- Project source: `web/src/routes/field/$campaignId/canvassing.tsx` - Canvassing wizard (tour target)
- Project source: `web/src/routes/field/$campaignId/phone-banking.tsx` - Phone banking (tour target, custom header issue)

### Secondary (MEDIUM confidence)
- [driver.js GitHub](https://github.com/kamranahmedse/driver.js) - Latest version 1.4.0
- [npmjs.com/package/driver.js](https://www.npmjs.com/package/driver.js) - Version verification (403 on direct fetch, confirmed 1.4.0 via search)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - driver.js is a locked decision; API verified via official docs
- Architecture: HIGH - Pattern based on existing project patterns (Zustand persist, hooks) + driver.js documented API
- Pitfalls: HIGH - Identified from code inspection (custom header issue, loading states, CSS specificity) and driver.js docs

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable libraries, no fast-moving changes expected)
