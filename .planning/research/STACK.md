# Technology Stack: v1.4 Volunteer Field Mode

**Project:** CivicPulse Run API
**Researched:** 2026-03-15
**Confidence:** HIGH

## Context

This research covers ONLY the frontend additions needed for v1.4 Volunteer Field Mode. The existing validated stack is not re-evaluated. This milestone is 100% frontend work -- no new backend endpoints, models, or migrations are needed.

**Already installed and validated (DO NOT re-research):**
- React ^19.2.0, React DOM ^19.2.0
- TanStack Router ^1.159.5, TanStack Query ^5.90.21, TanStack Table ^8.21.3
- shadcn/ui (via radix-ui ^1.4.3) with 27 components already generated
- Zustand ^5.0.11 (state management)
- Tailwind CSS ^4.1.18 (styling)
- vaul ^1.1.2 (drawer/bottom sheet -- installed but unused)
- lucide-react ^0.563.0 (icons)
- sonner ^2.0.7 (toast notifications)
- Vite ^7.3.1, TypeScript ~5.9.3

## Recommended Stack Additions

### ONE New Package: driver.js (Guided Tour)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| driver.js | ^1.4.0 | One-time guided onboarding tour, element highlighting | Lightweight (~5kB gzipped), zero dependencies, framework-agnostic, 25K+ GitHub stars, 436K+ weekly npm downloads. Works cleanly with React 19 via useEffect -- no React-specific bindings means no deprecated API risk. |

**Critical finding: react-joyride is BROKEN on React 19.** It uses deprecated `unmountComponentAtNode` and `unstable_renderSubtreeIntoContainer` APIs. The library has been unmaintained for 9+ months. A `next` branch exists but is unreliable. This eliminates the most popular React tour library from consideration.

**Why driver.js over alternatives:**

| Library | Weekly Downloads | React 19 | Bundle | Verdict |
|---------|-----------------|----------|--------|---------|
| react-joyride | ~340K | BROKEN | ~45kB | Eliminated -- deprecated React APIs |
| driver.js | ~436K | Works (framework-agnostic) | ~5kB | Recommended |
| Shepherd.js (React wrapper) | ~30K | Untested | ~25kB | Too heavy, small React community |
| @reactour/tour | ~40K | Unverified | ~15kB | React 19 compat not confirmed in docs |

**Integration pattern:**

```typescript
// hooks/useTour.ts -- thin React wrapper around driver.js
import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useOnboardingStore } from "@/stores/onboardingStore";

export function useTour(tourId: string, steps: StepConfig[]) {
  const { hasCompleted, markComplete } = useOnboardingStore();

  useEffect(() => {
    if (hasCompleted(tourId)) return;

    const driverObj = driver({
      showProgress: true,
      steps,
      onDestroyStarted: () => {
        markComplete(tourId);
        driverObj.destroy();
      },
    });

    // Delay to ensure DOM elements are rendered after route transitions
    const timer = setTimeout(() => driverObj.drive(), 500);
    return () => clearTimeout(timer);
  }, [tourId]);
}
```

**Styling:** driver.js supports CSS class overrides via `popoverClass` (global or per-step). Override `.driver-popover` with Tailwind utility values matching shadcn/ui design tokens (border-radius, colors, font, shadows). Approximately 30 lines of CSS. The driver.js theming system also supports CSS custom properties for quick color swaps.

### Tour State Persistence: Zustand Persist Middleware (No New Package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zustand/middleware (persist) | Already installed (zustand ^5.0.11) | Persist tour completion state and field mode preferences to localStorage | Zero new dependencies. Built-in middleware, supports `partialize` for selective persistence. Project already uses zustand for auth state. |

**Why NOT a custom localStorage hook:** The project already uses zustand. Adding a separate `usePersistedState` pattern creates two state management approaches. zustand persist keeps everything in one pattern.

**Store design:**

```typescript
// stores/onboardingStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  completedTours: Record<string, boolean>;
  hasCompleted: (tourId: string) => boolean;
  markComplete: (tourId: string) => void;
  resetTour: (tourId: string) => void;  // "revisit tour" requirement
  resetAll: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedTours: {},
      hasCompleted: (id) => !!get().completedTours[id],
      markComplete: (id) =>
        set((s) => ({
          completedTours: { ...s.completedTours, [id]: true },
        })),
      resetTour: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.completedTours;
          return { completedTours: rest };
        }),
      resetAll: () => set({ completedTours: {} }),
    }),
    { name: "civicpulse-onboarding" }
  )
);
```

### Mobile Drawer / Bottom Sheet: vaul via shadcn/ui Drawer (No New Package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vaul (via shadcn/ui Drawer) | Already installed (^1.1.2) | Mobile-optimized bottom sheet for canvassing wizard, outcome recording, survey display | Already in package.json but not yet used. shadcn/ui Drawer wraps vaul with project-consistent styling. Snap points provide natural mobile UX (half-screen preview, full expand). Touch-friendly drag-to-dismiss. |

**Action needed:** Generate the shadcn/ui Drawer component (vaul is installed as a dependency, but the component wrapper has not been generated yet):

```bash
npx shadcn@latest add drawer
```

This creates `web/src/components/ui/drawer.tsx` providing `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription` -- all built on vaul with shadcn/ui styling.

**Use for:** Canvassing wizard step containers on mobile (snap points at `["355px", 1]` for half/full screen), outcome recording panels, inline survey display. On desktop viewports, fall back to Dialog or inline content -- the Drawer is specifically for the mobile touch UX.

### Tap-to-Call: Native tel: URI (No Package Needed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| HTML `tel:` URI scheme | Web standard | Phone banking tap-to-call on mobile | Zero dependencies. `<a href="tel:+14045551234">` is universally supported on mobile browsers. Phone's native dialer handles the call. International format required (+country code). |

**No library needed.** Implementation is a small React component:

```typescript
function TapToCall({ phone, children }: { phone: string; children: React.ReactNode }) {
  const formatted = formatE164(phone); // strip non-digits, prepend +1 for US
  return (
    <a
      href={`tel:${formatted}`}
      className="inline-flex items-center gap-2 rounded-md bg-primary
                 px-4 py-3 text-primary-foreground min-h-[44px] min-w-[44px]"
    >
      {children}
    </a>
  );
}
```

**Desktop handling:** On desktop, `tel:` links may open a VoIP app or do nothing. Detect touch device via `window.matchMedia("(pointer: coarse)")` and show the number as copyable text on desktop. The existing phone banking UI already displays phone numbers -- this adds a clickable wrapper for mobile only.

### Contextual Help / Tooltips: Existing Radix Tooltip (No New Package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Radix UI Tooltip (shadcn/ui) | Already installed (radix-ui ^1.4.3) | Contextual help icons, inline hints throughout field mode | Already exists at `web/src/components/ui/tooltip.tsx`. Accessible, keyboard-navigable, auto-positioned. |

**Pattern:** Create a reusable `HelpTip` component composing existing Tooltip + lucide-react `HelpCircle` icon:

```typescript
function HelpTip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center justify-center size-5
                           rounded-full text-muted-foreground hover:text-foreground">
          <HelpCircle className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{content}</TooltipContent>
    </Tooltip>
  );
}
```

For mobile (no hover): Radix Tooltip responds to tap/focus events. For longer help text, use the existing Popover component (`web/src/components/ui/popover.tsx`) instead of Tooltip.

### Wizard / Stepper Progress: Custom Component (No Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom component (~30 lines) | N/A | Linear canvassing wizard progress indicator | shadcn/ui has no official stepper. The canvassing flow is strictly linear (address -> knock -> outcome -> survey -> next) -- no branching, no skip-ahead, no form validation between steps. A stepper library would be over-engineered. |

**Why NOT a stepper library (stepperize, etc.):** Linear flows need `currentStep: number` in component state, not a state machine. The entire stepper UI is a flex row of colored dots:

```typescript
function WizardProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i < current ? "bg-primary" : i === current ? "bg-primary/60" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}
```

### Progressive Disclosure: Existing Components (No New Packages)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Radix Accordion (shadcn/ui) | Already installed | Collapsible sections for advanced options | Already at `web/src/components/ui/accordion.tsx`, used in v1.3 filter builder |
| Radix Collapsible (shadcn/ui) | Already installed | Show more/less toggles | Already at `web/src/components/ui/collapsible.tsx` |

Progressive disclosure is a UX pattern, not a library concern. Use Accordion for grouped options, Collapsible for individual expand/collapse, and conditional rendering for role-based content (RequireRole already exists).

### Mobile Touch Optimization: Tailwind CSS (No New Packages)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | Already installed (^4.1.18) | 44px minimum touch targets, mobile-first responsive layout | Pure CSS. `min-h-[44px] min-w-[44px]` on interactive elements. `@media (pointer: coarse)` for touch-specific styles. |

**Key CSS patterns to establish as utility classes or component variants:**

```css
/* Touch-friendly interactive elements (44px minimum per WCAG) */
.touch-target {
  @apply min-h-[44px] min-w-[44px] flex items-center justify-center;
}

/* Larger action buttons for field mode */
@media (pointer: coarse) {
  .field-action-btn {
    @apply text-lg py-4 px-6;
  }
}
```

**Viewport meta tag** should already include `width=device-width, initial-scale=1.0`. Verify it does NOT include `maximum-scale=1` or `user-scalable=no` (accessibility violation -- users must be able to zoom).

## Installation Summary

```bash
# ONE new package
npm install driver.js

# ONE shadcn component to generate (vaul already installed as dependency)
npx shadcn@latest add drawer
```

**Total new runtime dependencies: 1 (driver.js, ~5kB gzipped)**

Everything else uses existing installed packages.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Guided tour | driver.js | react-joyride | Broken on React 19, uses deprecated APIs, unmaintained 9+ months |
| Guided tour | driver.js | Shepherd.js | Heavier bundle, 10x smaller React community than driver.js |
| Guided tour | driver.js | @reactour/tour | React 19 compatibility unverified in official documentation |
| Tour state | zustand persist | Custom localStorage hook | Project already uses zustand; avoid splitting state patterns |
| Wizard container | vaul Drawer | Dialog/Sheet | Drawer has mobile-native drag/snap UX that Dialog lacks |
| Stepper | Custom 30-line component | stepperize / third-party | Over-engineered for linear, non-branching flow |
| Tap-to-call | Native tel: URI | Twilio SDK | Telephony integration is explicitly out of scope |
| Tooltips | Existing Radix Tooltip | Tippy.js / Floating UI | Already installed and used, accessible, works |
| Progressive disclosure | Existing Accordion/Collapsible | Custom show/hide | Already installed, animated, accessible |

## What NOT to Add

| Library | Why People Suggest It | Why Skip It |
|---------|----------------------|-------------|
| Framer Motion / Motion | Animations for wizard transitions | Tailwind CSS `animate-*` and `transition-*` classes handle slide/fade. Adding ~30kB animation library for 3 transitions is unjustified. vaul already uses its own animation internally. |
| react-swipeable | Swipe gestures for wizard step navigation | vaul handles swipe on drawers. For step navigation, prev/next buttons with 44px touch targets are more reliable than swipe (prevents accidental triggers). |
| @capacitor/core or PWA toolkit | "Feel native" on mobile | Out of scope per PROJECT.md. This is a mobile-optimized web app, not a native wrapper. Viewport meta + touch targets + Drawer is sufficient. |
| react-spring | Physics-based animations | Same rationale as Framer Motion -- overkill for this use case. |
| Any additional toast library | Field status messages | sonner (^2.0.7) is already installed and used throughout the app. |
| cmdk (additional use) | Command palette for field mode | Already installed for member/caller pickers. Field mode should be linear and guided, not command-palette driven. Volunteers should not need to search for actions. |

## Backend: No Changes Required

The v1.4 features are entirely frontend. Existing APIs already support:

| Capability Needed | Existing Endpoint | Status |
|---|---|---|
| Volunteer active assignment lookup | GET /volunteers, GET /shifts | Built in v1.0 Phase 5 |
| Walk list entries with addresses | GET /turfs/{id}/walk-list | Built in v1.0 Phase 3 |
| Door-knock outcome recording | POST /canvassing/door-knocks | Built in v1.0 Phase 3 |
| Survey questions + response recording | GET /surveys/{id}, POST /survey-responses | Built in v1.0 Phase 3 |
| Call list entry claiming | POST /call-lists/{id}/claim | Built in v1.0 Phase 4 (SKIP LOCKED) |
| Call result recording | POST /call-lists/{id}/entries/{id}/result | Built in v1.0 Phase 4 |
| Volunteer shift check-in/out | POST /shifts/{id}/check-in, POST /shifts/{id}/check-out | Built in v1.0 Phase 5 |

No new backend endpoints, models, or migrations needed.

## Confidence Assessment

| Decision | Confidence | Basis |
|----------|------------|-------|
| driver.js for tours | HIGH | Multiple sources confirm react-joyride React 19 breakage; driver.js is framework-agnostic, actively maintained, highest weekly downloads |
| zustand persist for state | HIGH | Official zustand documentation, middleware is built-in, project already uses zustand |
| vaul/Drawer for wizard | HIGH | Already installed as dependency, shadcn/ui official integration |
| tel: for tap-to-call | HIGH | Web standard, web.dev documentation, universal mobile support |
| No stepper library | HIGH | Linear non-branching flow does not justify library overhead |
| No animation library | MEDIUM | Could reconsider if CSS-only transitions feel insufficient, but Tailwind animate utilities are well-proven |
| No backend changes | HIGH | Reviewed all v1.0-v1.3 API surface; all required endpoints exist |

## Sources

- [driver.js official documentation](https://driverjs.com)
- [driver.js GitHub (25K+ stars, 436K+ weekly downloads)](https://github.com/kamranahmedse/driver.js)
- [OnboardJS -- 5 Best React Onboarding Libraries (2026)](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared)
- [Sandro Roth -- Evaluating tour libraries for React](https://sandroroth.com/blog/evaluating-tour-libraries/)
- [npm trends -- driver.js vs react-joyride vs shepherd](https://npmtrends.com/driver.js-vs-hopscotch-vs-intro.js-vs-shepherd)
- [shadcn/ui Drawer component (vaul)](https://ui.shadcn.com/docs/components/radix/drawer)
- [web.dev -- Click to Call best practices](https://web.dev/articles/click-to-call)
- [Zustand persist middleware official docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- [MDN -- Viewport meta tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag)
- [Touch target optimization (44px minimum)](https://www.seo-day.de/wiki/technisches-seo/mobile-technical/touch.php?lang=en)

---
*Stack research for: CivicPulse Run v1.4 Volunteer Field Mode -- frontend additions only*
*Researched: 2026-03-15*
