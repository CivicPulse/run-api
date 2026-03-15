# Pitfalls Research

**Domain:** Volunteer field mode for existing campaign management app
**Researched:** 2026-03-15
**Confidence:** HIGH (based on codebase analysis of existing call screen, walk list, layout, permissions + ecosystem research)

## Critical Pitfalls

### Pitfall 1: Two-Panel Desktop Layout Shipped as "Mobile-Friendly"

**What goes wrong:**
The existing phone banking call screen uses a `flex gap-6 min-h-[500px]` two-panel layout (voter info left at `w-80 shrink-0`, survey+outcomes right). The canvassing walk list uses a full `<Table>` with five columns. Wrapping these in a responsive container or slapping `flex-col` on mobile does not produce a usable field experience. Volunteers in the field are holding phones one-handed, often in sunlight, often walking between houses. A shrunk-down admin UI is fundamentally different from a purpose-built field UI.

**Why it happens:**
Developers reuse existing components because the data and API calls are identical. The admin call screen already "works" -- it claims entries, records outcomes, shows surveys. The temptation is to make it responsive rather than build a separate flow.

**How to avoid:**
Build the field mode as entirely new route trees (`/campaigns/$campaignId/field/...`) with dedicated components. Share hooks (`useClaimEntry`, `useRecordCall`, `useWalkListEntries`) and API clients, but not page-level components. The field canvassing wizard and field phone banking screen should be new files that import existing hooks but render completely different layouts optimized for single-column, large touch targets, and linear flow.

**Warning signs:**
- Field mode routes importing components from `components/canvassing/` or existing phone banking pages
- Responsive breakpoints being added to existing admin pages instead of new field pages
- Walk list entries rendered in a `<Table>` on mobile instead of a card/stack layout
- The `VoterInfoPanel` component from `call.tsx` being reused in field mode without redesign

**Phase to address:**
Phase 1 (Foundation) -- establish the `/field/` route tree and the principle of shared hooks, separate UIs from day one.

---

### Pitfall 2: Wizard State Lost on Accidental Navigation or Browser Kill

**What goes wrong:**
A canvassing volunteer is mid-door-knock: they recorded an outcome, filled in 3 of 5 survey answers, typed notes. Their phone rings (switching apps), they accidentally swipe back, or the browser is killed by the OS for memory. All state is gone. They must re-knock or skip the voter entirely. This is the single most damaging UX failure for field operations.

**Why it happens:**
The existing call screen stores all state in React `useState` -- `CallingState`, `surveyResponses`, `notes` are pure in-memory state (see `call.tsx` lines 261-262). This is fine for an admin at a desk but catastrophic for field use where interruptions are constant.

**How to avoid:**
1. Use Zustand with `persist` middleware (already in `package.json` dependencies) to save wizard state to `sessionStorage`. Key the store by `campaignId + assignmentId` so multiple campaigns do not collide.
2. On field mode mount, check for persisted state and offer to resume ("You have an in-progress door knock at 123 Main St. Resume?").
3. Extend the existing `useFormGuard` hook (used in 15 existing files) to cover field wizard routes -- block both TanStack Router navigation and `beforeunload`.
4. For the canvassing wizard: save after each step transition, not just on final submit. Each step (knock outcome, survey question, notes) should persist immediately.

**Warning signs:**
- Wizard state managed with `useState` instead of a persisted store
- No resume prompt when re-entering field mode
- `useFormGuard` not applied to field routes
- State only saved on final "Submit" action

**Phase to address:**
Phase 2 (Canvassing Wizard) -- must be baked in from the start, not added later.

---

### Pitfall 3: tel: Links Silently Fail or Behave Inconsistently

**What goes wrong:**
`<a href="tel:+15551234567">` has multiple failure modes: (1) Desktop browsers either do nothing or open a random app. (2) iOS handles `tel:` fine in Safari but some in-app browsers (WebView) silently swallow it. (3) Android Chrome shows `ERR_UNKNOWN_URL_SCHEME` in certain WebView contexts. (4) Phone numbers with formatting characters (parentheses, dashes, spaces) behave differently across platforms. (5) The existing phone banking screen displays phone numbers as `<Button>` elements for selection (lines 73-89 of `call.tsx`) but has no `tel:` link -- the volunteer mode needs to add tap-to-call, which is a new interaction pattern.

**Why it happens:**
`tel:` links appear trivially simple, so developers add them without testing on actual devices. The iOS simulator cannot test `tel:` links (no dialer). Android emulators can simulate but behavior differs from real devices.

**How to avoid:**
1. Strip all non-digit characters except leading `+` before constructing the `tel:` URL. Store the display format separately from the dial format.
2. Use `window.location.href = 'tel:...'` as fallback if `<a>` click does not trigger navigation.
3. Show a "Copy number" fallback button alongside every tap-to-call button so volunteers can manually dial if `tel:` fails.
4. On desktop browsers, detect non-mobile UA and show the number as copyable text instead of a tel: link.
5. Test on real iOS and Android devices, not just simulators. Add a Playwright test that verifies the `href` attribute is correctly formatted.

**Warning signs:**
- Phone numbers passed to `tel:` with parentheses, dashes, or spaces still in them
- No fallback for desktop or WebView contexts
- Only tested in Chrome DevTools mobile emulation
- No `formatForDial()` utility function

**Phase to address:**
Phase 3 (Phone Banking Field Mode) -- the tap-to-call feature is central to this phase.

---

### Pitfall 4: Tour Library Breaks on Dynamic/Async Content

**What goes wrong:**
React-joyride (the most popular React tour library, 400K+ weekly npm downloads) has a well-documented failure mode: if the target element for the first step does not exist in the DOM when the tour starts, the entire tour is silently skipped (GitHub issue #585). For subsequent steps, missing targets cause step-skipping without user feedback (issue #519). In the field mode, tour targets will be inside wizard steps that are conditionally rendered -- the "record outcome" buttons do not exist until a voter is claimed, the survey questions do not exist until the script loads.

**Why it happens:**
Tour libraries attach to DOM elements by CSS selector. Field mode UIs are heavily stateful -- content appears and disappears as the wizard progresses. Developers write tour steps referencing elements that exist in the "happy path" render state but not at tour initialization time.

**How to avoid:**
1. Use react-joyride in controlled mode (`stepIndex` managed in state) rather than uncontrolled mode. Advance `stepIndex` only when the target element is confirmed rendered.
2. Split the tour into segment tours per wizard phase rather than one monolithic tour. Example: "Welcome tour" (landing page elements only), "First knock tour" (triggered after first claim), "Recording tour" (triggered when outcome panel renders).
3. Store tour completion state per-segment in localStorage keyed by `userId + campaignId`. Check `tourComplete['welcome']` before showing.
4. Add a `data-tour="step-name"` attribute convention for all tour target elements. This avoids brittle CSS class selectors that break during refactoring.
5. Provide a "Replay tour" button in the field mode header that resets segment completion flags.

**Warning signs:**
- Tour steps defined as a single static array covering the entire field mode
- Tour targets using class names or auto-generated IDs instead of `data-tour` attributes
- Tour starts on page mount without checking if target elements exist in DOM
- No way to replay the tour after completion
- react-shepherd used instead of react-joyride (requires paid commercial license, React 19 wrapper incompatibility)

**Phase to address:**
Phase 4 (Guided Onboarding) -- but `data-tour` attributes should be added to elements in Phases 1-3 as they are built.

---

### Pitfall 5: Admin Navigation Chrome Shown in Field Mode

**What goes wrong:**
The existing app has a full navigation structure with links to Voters (32-filter search), Canvassing (turf management), Phone Banking (session/call-list management), Volunteers (roster/shifts), and Settings. If field mode routes are nested under the same layout, volunteers see the full admin nav. They click "Voters" out of curiosity, land in the 23-dimension filter chip interface, get confused, and cannot find their way back to their assignment. Or worse: a volunteer with elevated permissions accidentally modifies campaign settings.

**Why it happens:**
TanStack Router uses nested layouts. The existing `__root.tsx` wraps all campaign routes with navigation chrome. Adding field routes under the same parent inherits the same layout.

**How to avoid:**
1. Create a dedicated field layout route (e.g., `campaigns/$campaignId/field.tsx` as a layout route) that renders a minimal header: campaign name, assignment name, progress indicator, and a single "Exit Field Mode" button. No sidebar. No admin nav links.
2. The field layout should use the existing `RequireRole` component but with a focused concern: verify the user has at least `volunteer` role, then render only field-appropriate UI.
3. The "Exit Field Mode" link should go to the volunteer dashboard, not the admin campaign view.

**Warning signs:**
- Field routes using the same layout component as admin routes
- Full sidebar visible on field mode pages
- Volunteers able to navigate to voter search, settings, or other admin pages from field mode
- No distinct field layout route file

**Phase to address:**
Phase 1 (Foundation) -- the field layout is infrastructure that all other field phases depend on.

---

### Pitfall 6: Poor Connectivity Causes Silent Data Loss

**What goes wrong:**
A canvasser records a door knock outcome and survey at a house with no cell service. The API call to POST the result fails. If the failure is not handled well, the data is lost. With the existing `handleOutcome` function in `call.tsx`, a failed `recordCall.mutateAsync` shows `toast.error("Failed to record call")` and stays in the "claimed" state -- but if the volunteer does not notice the toast (outdoors, glare, walking), they might hit "Next Voter" thinking it saved.

**Why it happens:**
The existing app assumes reliable connectivity because admins use it from an office. The error handling pattern (try/catch with toast) is appropriate for desktop but insufficient for field use where failures are frequent and attention is divided.

**How to avoid:**
1. Implement an outbox pattern: when a mutation fails due to network error, queue it in a local store (Zustand persist or IndexedDB) and retry automatically when connectivity returns. Show a persistent badge ("2 results pending sync") rather than a fleeting toast.
2. Use TanStack Query's built-in `networkMode: 'offlineFirst'` for field mode mutations. Paused mutations resume when online.
3. Add a `navigator.onLine` listener and show a persistent "Offline" banner in the field mode header when connectivity is lost. Do not auto-dismiss it -- keep it visible until connectivity returns.
4. Make the wizard optimistic: advance to the next voter immediately after recording locally, even if the server has not confirmed. The outbox handles eventual sync.
5. Never block the volunteer's workflow on a network response. The most important thing is that they keep moving door to door.

**Warning signs:**
- Field mode mutations using the default TanStack Query settings (online-first networkMode)
- No offline indicator in the field mode header
- Mutation errors shown only as toasts with no retry queue
- Volunteer workflow blocked while waiting for server response
- No sync status indicator for pending mutations

**Phase to address:**
Phase 2 (Canvassing Wizard) for the outbox pattern and offline indicator. Phase 3 (Phone Banking) extends the same pattern.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing admin page components in field mode with responsive CSS | Faster initial delivery | Two UX contexts fighting in one component; mobile regressions break admin, admin changes break mobile | Never -- share hooks, not UI components |
| Storing wizard state in useState only | Simpler code, no persist dependency | Data loss on any interruption; volunteers lose work constantly | Never for field mode; fine for admin |
| Single monolithic tour covering all field mode pages | One tour definition, simple to write | Breaks when any step target is missing; cannot replay segments; all-or-nothing completion | Never -- split into per-phase segment tours |
| Skipping offline handling ("we'll add it later") | Ship faster | Fundamental architecture change later; must retrofit outbox into every mutation | Only if outbox is added in the immediately next phase |
| Using the same layout for field and admin | One fewer layout file | Volunteers see admin navigation, get lost, accidentally modify data | Never -- field mode must have its own layout |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| tel: links | Passing formatted phone numbers (`(555) 123-4567`) directly to `href="tel:"` | Strip to digits-only (e.g., `+15551234567`) for dial, keep formatted version for display |
| react-joyride + TanStack Router | Mounting tour at top level and expecting it to work across route changes | Mount tour provider inside the field layout route; reset tour state on route transitions; use controlled mode |
| react-joyride + React 19 | Using react-joyride with unverified React 19 compatibility | Verify compatibility before adoption; react-joyride is the safest choice (react-shepherd wrapper has known React 19 issues) |
| Zustand persist + sessionStorage | Using `localStorage` for wizard state, causing stale state across tabs | Use `sessionStorage` for in-progress wizard state (tab-scoped); `localStorage` only for tour completion and preferences |
| TanStack Query + offline mutations | Default `networkMode: 'online'` pauses mutations silently with no user feedback | Set `networkMode: 'offlineFirst'` for field mode mutations and display sync status UI |
| useFormGuard + wizard navigation | Applying form guard to the entire wizard, blocking intentional step transitions | Apply form guard only to exits from the wizard; wizard's own state machine manages internal step navigation |
| Existing hooks in field context | Using `useWalkListEntries` to fetch full 500-entry list on mount | Use claim-on-fetch pattern (already in phone banking); fetch only the current/next entry for canvassing wizard |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full walk list on wizard mount | 3-5s skeleton on 3G for 500+ entry lists | Fetch only next entry via claim pattern; prefetch next 1-2 entries | Walk lists > 100 entries on slow connections |
| Re-fetching survey questions per voter | Redundant API call for same script on each "Next Voter" tap | Cache with long `staleTime` in TanStack Query; script never changes mid-session | Large surveys (10+ questions) on slow connections |
| Tour overlay causing layout reflow | Jank/stutter when spotlight renders, especially on low-end Android | Set `disableScrolling: true` where scroll is not needed; avoid targeting elements in scrollable containers | Low-end Android devices (< 4GB RAM) |
| Full voter detail fetch in field mode | Loading all 22+ columns when field only needs name, address, phone | Return only needed fields from API (sparse fieldset or dedicated endpoint) | Walk lists with 200+ voters on slow connections |
| Persisting every keystroke to storage | UI lag on notes/text fields as Zustand persist writes to sessionStorage | Debounce persist writes (300ms); persist on step transition, not on every change | Devices with slow storage I/O |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Field mode routes accessible without role check | Non-volunteers or unauthenticated users access field operations | Apply `RequireRole` with `volunteer` minimum at field layout level; verify backend endpoints also enforce role |
| Persisted wizard state containing PII in localStorage | Voter names, addresses, phone numbers on shared/lost device survive browser close | Use `sessionStorage` (cleared on tab close); clear all field state on explicit "End Session"; never persist to localStorage |
| Phone numbers in browser history via tel: links | Browser history shows `tel:+15551234567` entries accessible to anyone with device access | Use `window.location.href` assignment or `<a>` with `onClick` handler to avoid history entries |
| Admin endpoints reachable via URL bar from field mode | Volunteer manually types admin URL paths | Field layout should have its own route guard; `RequireRole` hiding is not the same as route blocking |
| Outbox data persisted unencrypted | Queued mutation payloads (voter contact results) stored in plaintext in browser storage | Encrypt outbox entries or scope them to session; clear on logout |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Touch targets smaller than 44x44px | Missed taps, rage taps, wrong outcomes recorded while walking | Minimum 48x48px touch targets; outcome buttons should be full-width on mobile; follow WCAG 2.5.5 |
| Fleeting toast for critical errors | Volunteer misses "Failed to save" toast outdoors in sunlight while walking | Persistent inline banners for errors requiring action; toasts only for confirmations ("Saved!") |
| No progress indicator in canvassing wizard | Volunteer does not know how many houses remain or where they are in the list | Persistent progress bar in field header: "12 of 47 doors visited" |
| "Loading..." text instead of skeleton | Perceived slowness on poor connections; volunteer waits instead of acting | Show optimistic wizard frame immediately; use skeletons for data that is loading |
| Tour that cannot be dismissed | Experienced volunteers frustrated by forced onboarding | Make tour skippable after first step; remember completion per-user; keep tours under 5 steps per segment |
| No "End Session" or unclear exit | Volunteer stuck in field mode, cannot return to dashboard | Prominent "End Session" button that syncs pending data and navigates to volunteer home |
| Survey questions requiring scroll to submit | Volunteer fills answers at top of page, cannot see or reach "Submit" button without scrolling | Pin action buttons (Next/Submit) to bottom of viewport; keep survey questions in scrollable area above |
| Outcome buttons using color only for meaning | Color-blind volunteers cannot distinguish "Connected" (default) from "Terminal" (destructive) | Add text labels AND icons to outcome categories; do not rely solely on button variant colors |

## "Looks Done But Isn't" Checklist

- [ ] **Canvassing wizard:** Often missing "resume in-progress" -- verify that closing and reopening the app restores wizard state with resume prompt
- [ ] **Phone banking tap-to-call:** Often missing desktop fallback -- verify that non-mobile browsers show "Copy Number" instead of broken tel: link
- [ ] **Guided tour:** Often missing segment reset -- verify "Replay Tour" works and individual segments can be replayed independently
- [ ] **Offline handling:** Often missing sync indicator -- verify pending mutations are visible to user and auto-sync when connectivity returns
- [ ] **Field layout:** Often missing deep link handling -- verify a direct link to `/field/canvass` for a volunteer not checked in redirects to check-in, not 404
- [ ] **Touch targets:** Often missing on secondary actions -- verify "Skip", "Back", and "Notes" buttons meet 44px minimum, not just primary action buttons
- [ ] **Field mode permissions:** Often missing backend enforcement -- verify field API calls rejected for non-volunteers even if UI hides routes
- [ ] **Survey in wizard:** Often missing validation -- verify required survey questions block "Next" button with inline errors, not just a toast
- [ ] **Session cleanup:** Often missing on logout -- verify logging out clears all persisted field state (wizard progress, tour completion, outbox)
- [ ] **Landscape orientation:** Often untested -- verify field mode works when phone is rotated; pinned bottom buttons should still be accessible
- [ ] **Back button behavior:** Often broken -- verify Android hardware back button navigates to previous wizard step, not out of the wizard entirely

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Admin layout leaking into field mode | LOW | Extract field layout into its own route tree; 1-2 day refactor if caught early |
| useState wizard state (no persistence) | MEDIUM | Retrofit Zustand persist; requires touching every state mutation; 2-3 day refactor |
| Monolithic tour that breaks on dynamic content | MEDIUM | Split into segment tours; retroactively add data-tour attributes; 2-3 days |
| tel: links with formatting characters | LOW | Single `formatForDial()` utility applied at all call sites; < 1 day |
| No offline handling | HIGH | Retrofitting outbox requires mutation wrapper, sync UI, conflict resolution; 4-5 days |
| Shared admin/field UI components | HIGH | Untangling responsive overrides from admin is harder than building field components fresh; 5+ day rewrite |
| Tour library incompatible with React 19 | MEDIUM | If react-joyride works, no issue. If not, switching to vanilla shepherd.js (no React wrapper) takes 2-3 days |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Admin layout in field mode | Phase 1 (Foundation) | Field routes render without sidebar; Playwright test confirms no admin nav links present |
| Touch targets too small | Phase 1 (Foundation) | Audit all field mode buttons with browser DevTools; none below 44x44px |
| Wizard state loss | Phase 2 (Canvassing Wizard) | Kill browser mid-wizard, reopen, verify resume prompt appears with correct address |
| No offline handling | Phase 2 (Canvassing Wizard) | Toggle airplane mode mid-session; verify data queued locally and synced when online |
| PII in browser storage | Phase 2 (Canvassing Wizard) | Verify sessionStorage used (not localStorage) for voter data; verify cleared on logout |
| tel: link edge cases | Phase 3 (Phone Banking) | Test on real iOS + Android devices; verify copy-number fallback on desktop |
| Tour breaks on async content | Phase 4 (Guided Onboarding) | Tour completes all steps without skipping; replay works; data-tour attributes on all targets |
| data-tour attributes missing | Phases 1-3 (add incrementally) | Grep for `data-tour` in all field mode components before starting Phase 4 |

## Sources

- Direct codebase analysis: `web/src/routes/.../call.tsx` (phone banking call screen, state machine pattern, two-panel layout)
- Direct codebase analysis: `web/src/routes/.../walk-lists/$walkListId.tsx` (canvassing walk list, table-based UI)
- Direct codebase analysis: `web/src/hooks/useFormGuard.ts` (used in 15 files, route blocking + beforeunload)
- Direct codebase analysis: `web/src/components/shared/RequireRole.tsx` (hides unauthorized content)
- Direct codebase analysis: `web/package.json` (zustand, react 19, tanstack query v5 already in deps)
- [react-joyride: Tour hangs if first step target missing (GitHub #585)](https://github.com/gilbarbara/react-joyride/issues/585)
- [react-joyride: Overlay not rendering when steps skipped (GitHub #519)](https://github.com/gilbarbara/react-joyride/issues/519)
- [react-joyride: Error with dynamically added elements (GitHub #109)](https://github.com/gilbarbara/react-joyride/issues/109)
- [Evaluating tour libraries for React -- Sandro Roth](https://sandroroth.com/blog/evaluating-tour-libraries/)
- [react-shepherd React 19 incompatibility noted](https://npm-compare.com/react-joyride,react-shepherd)
- [CSS-Tricks: Current State of Telephone Links](https://css-tricks.com/the-current-state-of-telephone-links/)
- [W3C WCAG 2.5.5: Target Size guidelines (44x44px minimum)](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Smashing Magazine: Accessible Tap Target Sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [TanStack Query: Optimistic Updates documentation](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [TanStack Query: Offline discussion (#4296)](https://github.com/TanStack/query/discussions/4296)
- [TanStack Query: Service worker integration challenges (#7897)](https://github.com/TanStack/query/issues/7897)
- [Zustand + React Hook Form multi-step pattern (Discussion #6382)](https://github.com/orgs/react-hook-form/discussions/6382)

---
*Pitfalls research for: v1.4 Volunteer Field Mode added to existing CivicPulse campaign management app*
*Researched: 2026-03-15*
