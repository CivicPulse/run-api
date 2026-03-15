# Phase 31: Canvassing Wizard - Research

**Researched:** 2026-03-15
**Domain:** Mobile-first wizard UI with persistent state, household grouping, survey integration
**Confidence:** HIGH

## Summary

Phase 31 transforms the canvassing placeholder into a full door-to-door wizard. The backend infrastructure is largely complete: `CanvassService.record_door_knock()`, `WalkListEntry` with `household_key`, `DoorKnockResult` enum (9 values), and the full survey engine (`SurveyScript`/`SurveyQuestion`/`SurveyResponse`) all exist. The primary backend gap is an enriched entries endpoint that joins voter details (name, party, age, propensity, address) and prior interaction history onto walk list entries -- the current `GET /entries` returns only `id, voter_id, household_key, sequence, status`.

The frontend is entirely new. The canvassing route (`web/src/routes/field/$campaignId/canvassing.tsx`) is a placeholder. The phase requires: a Zustand persist store for wizard state, household grouping logic (client-side from `household_key`), an OutcomeGrid component with 9 color-coded buttons, a slide-up survey panel using the existing Sheet component, a FieldProgress bar, VoterCard with context display, and resume-from-interruption flow. All shared components (OutcomeGrid, InlineSurvey, FieldProgress, VoterCard) must be designed for reuse by Phase 32 (phone banking).

**Primary recommendation:** Build a new enriched entries API endpoint first, then implement the wizard UI in layers: data fetching + household grouping, then outcome recording, then survey panel, then persist/resume.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All 9 DoorKnockResult values displayed as flat, equal buttons -- no grouping or hierarchy
- 2-column grid layout, all visible without scrolling or expansion
- Color-coded by category: green (Supporter), yellow (Undecided, Come Back Later), red (Refused, Opposed), grey (Not Home, Moved, Deceased, Inaccessible)
- One tap records the outcome -- no confirmation dialog
- Survey triggers on contact outcomes: Supporter, Undecided, Opposed, AND Refused (partial info capture on refusals)
- Non-contact outcomes (Not Home, Come Back, Moved, Deceased, Inaccessible) skip survey and auto-advance
- Entries sharing the same `household_key` are grouped under a single address header
- Layout: address header card at top, then stacked voter sub-cards below
- Outcome buttons appear inline on each voter's sub-card (not in a shared bottom area)
- Completed voters show their recorded outcome with a checkmark; active voter shows outcome buttons
- Bulk apply: after recording "Not Home" for the first voter, prompt "Apply to all N voters at this address?" with Yes/No
- Consistent layout for single-voter addresses -- same address header + voter sub-card pattern
- Wizard advances to next address only after all voters at the current address are handled
- Each voter sub-card shows: name, party (colored badge), propensity score (% with color-coded badge), and age
- Prior interaction history shown: attempt count + last outcome
- Address displayed prominently at top of household card in large text
- Address is tappable -- opens Google Maps navigation link using street address (not lat/long)
- Default flow is linear: advance to next address after recording all outcomes
- "Skip" button available to skip a door (marks entry as SKIPPED)
- List view accessible via button -- shows all doors with status, allows jumping to any door
- Progress indicator: text ("12 of 47 doors") plus thin progress bar below the field header
- Progress counts addresses/doors, not individual voters
- Wizard state persisted via Zustand persist + sessionStorage
- On re-entering canvassing after interruption: toast/banner prompt "Pick up where you left off?" with Resume and Start Over buttons
- Auto-resumes after 10 seconds if no action
- "Start Over" jumps to first PENDING door -- does NOT clear already-recorded outcomes
- "Resume" returns to the exact door where the volunteer left off
- Survey questions appear in a slide-up panel from the bottom after a contact outcome
- Panel overlays the current card (card content dimmed behind)
- "Skip Survey" button always visible
- After survey completion or skip, auto-advance to next voter (or next address if last voter)
- Survey questions come from the walk list's linked `script_id` (SurveyScript model)
- If walk list has no linked script, survey step is skipped entirely

### Claude's Discretion
- Exact Tailwind styling, spacing, and animation for slide-up panel
- Color shades for outcome button categories (exact green/yellow/red/grey values)
- Propensity score threshold breakpoints (what counts as high/medium/low)
- List view layout and sorting
- Skip button placement and styling
- Toast/banner auto-dismiss animation
- How to fetch and display prior interaction history efficiently (count + last outcome query)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CANV-01 | Volunteer sees the next address with voter name, party, and propensity context | Enriched entries endpoint provides voter data; VoterCard component renders it; household grouping clusters by address |
| CANV-02 | Volunteer records a door-knock outcome via large touch-target buttons | OutcomeGrid component with 9 DoorKnockResult values; existing `POST /door-knocks` endpoint records outcome |
| CANV-03 | Volunteer advances to the next door automatically after recording an outcome | Wizard state machine manages currentAddressIndex; auto-advance after outcome + optional survey |
| CANV-04 | Volunteer sees a progress indicator ("12 of 47 doors") | FieldProgress component counts unique addresses from grouped entries |
| CANV-05 | Volunteer can answer inline survey questions after a contact outcome (skippable) | Sheet component for slide-up panel; existing survey API (`GET questions`, `POST responses batch`); Skip Survey button |
| CANV-06 | Volunteer sees multiple voters at same address grouped by household | Client-side grouping by `household_key`; address header card + voter sub-cards pattern |
| CANV-07 | Volunteer's wizard state persists across phone interruptions | Zustand persist middleware with sessionStorage; store tracks currentAddressIndex, completedEntries |
| CANV-08 | Volunteer sees a resume prompt when returning to an interrupted session | Resume banner with "Pick up where you left off?" + auto-resume timer |
| A11Y-04 | Canvassing wizard state transitions announced to screen readers via live regions | ARIA live region wrapping wizard content; role="status" for progress updates |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2 | UI framework | Project standard |
| TanStack Router | 1.159 | File-based routing | Project standard |
| TanStack Query | 5.90 | Server state / data fetching | Project standard |
| Zustand | 5.0 | Client state with persist middleware | Decided in v1.4 research |
| shadcn/ui | 3.8 | UI components (Card, Button, Badge, Progress, Sheet) | Project standard |
| Tailwind CSS | 4.1 | Styling | Project standard |
| ky | 1.14 | HTTP client | Project standard |
| sonner | 2.0 | Toast notifications | Project standard (resume prompt) |
| lucide-react | 0.563 | Icons | Project standard |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| radix-ui | 1.4 | Sheet primitive (slide-up panel) | Survey panel via shadcn Sheet |
| vaul | 1.1 | Drawer primitive | Alternative to Sheet for bottom slide-up if Sheet doesn't feel native enough |
| zod | 4.3 | Schema validation | Survey response validation |

### No New Dependencies Needed
All required functionality is covered by the existing stack. The Sheet component (radix Dialog underneath) handles the slide-up survey panel. Zustand's built-in `persist` middleware handles sessionStorage. No animation library needed -- Tailwind CSS animations + radix transitions cover all requirements.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  routes/field/$campaignId/
    canvassing.tsx            # Main wizard route (replace placeholder)
  components/field/
    OutcomeGrid.tsx           # 9-button 2-col grid (reusable Phase 32)
    VoterCard.tsx             # Name/party/age/propensity card (reusable)
    InlineSurvey.tsx          # Sheet-based survey panel (reusable)
    FieldProgress.tsx         # "12 of 47 doors" + progress bar (reusable)
    HouseholdCard.tsx         # Address header + voter sub-cards container
    ResumePrompt.tsx          # "Pick up where you left off?" banner
    DoorListView.tsx          # All-doors list view with status + jump
  stores/
    canvassingStore.ts        # Zustand persist store for wizard state
  hooks/
    useWalkListEntries.ts     # React Query hook for enriched entries
    useDoorKnock.ts           # React Query mutation for recording outcome
    useSurveyQuestions.ts     # React Query hook for survey questions
    useSurveyResponses.ts     # React Query mutation for batch responses
    useCanvassingWizard.ts    # Orchestrator hook tying store + data together
  types/
    canvassing.ts             # TypeScript types for wizard domain
```

### Pattern 1: Zustand Persist Store for Wizard State
**What:** Zustand store with `persist` middleware using sessionStorage to survive page refreshes and app switches.
**When to use:** Any state that must survive browser navigation events on mobile.
**Example:**
```typescript
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface CanvassingState {
  walkListId: string | null
  currentAddressIndex: number
  completedEntries: Record<string, string> // entryId -> resultCode
  skippedEntries: Set<string>
  surveyAnswers: Record<string, Record<string, string>> // voterId -> {questionId: answer}
  lastActiveAt: number // timestamp for stale detection

  setWalkList: (id: string) => void
  recordOutcome: (entryId: string, result: string) => void
  skipEntry: (entryId: string) => void
  advanceAddress: () => void
  jumpToAddress: (index: number) => void
  reset: () => void
}

export const useCanvassingStore = create<CanvassingState>()(
  persist(
    (set, get) => ({
      // ... state and actions
    }),
    {
      name: "canvassing-wizard",
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          return str ? JSON.parse(str) : null
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    }
  )
)
```

### Pattern 2: Household Grouping (Client-Side)
**What:** Group flat entry list by `household_key` into address-based units.
**When to use:** After fetching entries, before rendering.
**Example:**
```typescript
interface Household {
  householdKey: string
  address: string // from first voter's registration_line1
  entries: EnrichedEntry[]
}

function groupByHousehold(entries: EnrichedEntry[]): Household[] {
  const map = new Map<string, EnrichedEntry[]>()
  for (const entry of entries) {
    const key = entry.household_key || entry.id // fallback for null keys
    const group = map.get(key) || []
    group.push(entry)
    map.set(key, group)
  }
  // Maintain sequence order from first entry in each group
  return Array.from(map.entries())
    .sort((a, b) => a[1][0].sequence - b[1][0].sequence)
    .map(([key, entries]) => ({
      householdKey: key,
      address: formatAddress(entries[0].voter),
      entries,
    }))
}
```

### Pattern 3: Optimistic Outcome Recording
**What:** Record outcome in local store immediately, then POST to API. On failure, revert local state and show error toast.
**When to use:** Door-knock outcome recording for instant feedback on mobile.
**Example:**
```typescript
const doorKnockMutation = useMutation({
  mutationFn: (data: DoorKnockCreate) =>
    api.post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/door-knocks`, { json: data }).json(),
  onMutate: (data) => {
    // Optimistic: record in store immediately
    store.recordOutcome(data.walk_list_entry_id, data.result_code)
  },
  onError: (err, data) => {
    // Revert on failure
    store.revertOutcome(data.walk_list_entry_id)
    toast.error("Failed to save outcome. Please try again.")
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["walk-list-entries", walkListId] })
  },
})
```

### Pattern 4: ARIA Live Region for State Transitions (A11Y-04)
**What:** Wrap wizard content in a live region so screen readers announce door changes.
**When to use:** Every time the wizard advances to a new door/address.
**Example:**
```typescript
<div aria-live="polite" aria-atomic="true" role="status" className="sr-only">
  {`Door ${currentAddressIndex + 1} of ${totalAddresses}. ${currentAddress}. ${currentVoterName}.`}
</div>
```

### Anti-Patterns to Avoid
- **Storing all entries in Zustand:** Only store wizard navigation state (currentIndex, completedEntries) in Zustand persist. Keep the actual entry data in React Query cache. Zustand persist serializes to sessionStorage on every change -- large datasets cause jank.
- **Full-page re-renders on outcome tap:** Use selective Zustand selectors to only re-render the affected voter sub-card, not the entire wizard.
- **Blocking UI on API calls:** Use optimistic updates. The volunteer is standing at a door in weather -- the UI must respond instantly.
- **Server-side household grouping:** The entries API already returns data ordered by sequence with `household_key`. Client-side grouping is simpler and avoids a new response shape. Walk lists are typically 20-200 entries -- trivial to group in-browser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent state across app switches | Custom localStorage wrapper | Zustand `persist` middleware | Handles serialization, rehydration, storage API abstraction |
| Slide-up panel | Custom CSS bottom sheet | shadcn Sheet with `side="bottom"` | Handles focus trap, escape key, overlay, animation, accessibility |
| Toast notifications | Custom notification system | sonner (already installed) | Resume prompt, error feedback, bulk-apply confirmation |
| Progress bar | Custom div with width% | shadcn Progress component | Already styled, accessible, animated |
| Touch target compliance | Manual padding calculations | Tailwind `min-h-11 min-w-11` (44px) | Consistent with existing FieldHeader pattern |

**Key insight:** The existing shadcn/ui component library covers every UI primitive needed. Sheet for survey panel, Card for voter/household display, Button for outcomes, Badge for party/propensity, Progress for the bar. No new UI library installs.

## Common Pitfalls

### Pitfall 1: sessionStorage Lost on Tab Close
**What goes wrong:** Volunteer closes the tab (not just switches away) and loses all wizard state.
**Why it happens:** sessionStorage is scoped to the tab session, not the browser.
**How to avoid:** This is acceptable per the v1.4 research decision. The backend has the ground truth (entry statuses). When reopening, the wizard re-fetches entries and can detect which are already VISITED. Document this behavior -- it's a feature, not a bug.
**Warning signs:** Users reporting "lost progress" -- distinguish between tab-close (expected) and app-switch (should persist).

### Pitfall 2: Stale Wizard State After Long Pause
**What goes wrong:** Volunteer pauses canvassing for hours, comes back, and the persisted state references stale data.
**Why it happens:** Other canvassers may have visited the same doors, or the walk list may have been modified.
**How to avoid:** On resume, re-fetch entries from API and reconcile with persisted state. If an entry the volunteer thinks is PENDING is now VISITED on the server, skip it. Use the `lastActiveAt` timestamp to detect stale sessions (e.g., > 4 hours = suggest refresh).
**Warning signs:** Entry count mismatch between persisted state and API response.

### Pitfall 3: Household Key null Values
**What goes wrong:** Some entries have null `household_key` and get incorrectly grouped together.
**Why it happens:** Voters without geocoded addresses or from certain import sources may lack household keys.
**How to avoid:** Treat null `household_key` as unique -- each null-keyed entry is its own "household" of one. Use entry ID as fallback grouping key.
**Warning signs:** A single "household" card showing voters from different addresses.

### Pitfall 4: Walk List With No Script
**What goes wrong:** Survey panel tries to open but there are no questions, causing empty state or errors.
**Why it happens:** Walk list's `script_id` is nullable. Not all walk lists have surveys.
**How to avoid:** Check `script_id` early. If null, skip the survey step entirely after contact outcomes. The wizard flow should be: outcome -> (if script_id && contact outcome) survey -> advance.
**Warning signs:** Empty slide-up panel appearing briefly before auto-closing.

### Pitfall 5: Bulk Apply "Not Home" Race Condition
**What goes wrong:** Volunteer taps "Apply to all" but the mutations fire in parallel and some fail or double-count.
**Why it happens:** Each door-knock is a separate POST that increments `visited_entries`.
**How to avoid:** Fire mutations sequentially (Promise chain) or use a batch endpoint. The existing `record_door_knock` increments `visited_entries` with a SQL expression, so concurrent calls are safe at the DB level, but sequential is simpler to reason about for error handling.
**Warning signs:** `visited_entries` count not matching actual VISITED entries.

### Pitfall 6: Mobile Keyboard Pushing Survey Panel Off Screen
**What goes wrong:** When volunteer taps a free-text survey field, the mobile keyboard pushes the Sheet content up and it becomes unusable.
**Why it happens:** Bottom sheets and mobile keyboards fight for viewport space.
**How to avoid:** Use `position: fixed` with dynamic viewport height (`dvh` unit in Tailwind). Set Sheet max-height to `max-h-[70dvh]` so there's room for the keyboard. Consider using `visualViewport` API to detect keyboard presence. Test on actual mobile devices.
**Warning signs:** Free-text survey questions being unusable on phones.

## Code Examples

### Enriched Entry API Response (new endpoint needed)
```typescript
// New type: walk list entry with voter details and interaction history
interface EnrichedWalkListEntry {
  id: string
  voter_id: string
  household_key: string | null
  sequence: number
  status: "pending" | "visited" | "skipped"
  voter: {
    first_name: string | null
    last_name: string | null
    party: string | null
    age: number | null
    propensity_combined: number | null
    registration_line1: string | null
    registration_line2: string | null
    registration_city: string | null
    registration_state: string | null
    registration_zip: string | null
  }
  prior_interactions: {
    attempt_count: number
    last_result: string | null  // e.g. "not_home"
    last_date: string | null    // ISO date
  }
}
```

### Backend: Enriched Entries Endpoint
```python
# New endpoint in app/api/v1/walk_lists.py
# GET /campaigns/{campaign_id}/walk-lists/{walk_list_id}/entries/enriched
# Returns all entries with voter details and interaction summary
# No pagination -- walk lists are bounded (typically < 200 entries)
# This avoids N+1 queries from the frontend fetching voter details per entry

@router.get(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/entries/enriched",
    response_model=list[EnrichedEntryResponse],
)
async def list_enriched_entries(
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List all entries with voter details and interaction history for wizard use."""
    # Single query joining WalkListEntry + Voter + interaction aggregates
```

### Outcome Button Color Map
```typescript
const OUTCOME_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  supporter:        { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  undecided:        { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  come_back_later:  { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  refused:          { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  opposed:          { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  not_home:         { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  moved:            { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  deceased:         { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  inaccessible:     { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
}

// Contact outcomes that trigger survey
const SURVEY_TRIGGER_OUTCOMES = new Set([
  "supporter", "undecided", "opposed", "refused"
])

// Non-contact outcomes that auto-advance
const AUTO_ADVANCE_OUTCOMES = new Set([
  "not_home", "come_back_later", "moved", "deceased", "inaccessible"
])
```

### Google Maps Navigation Link
```typescript
// Per project feedback: use street address, not lat/long
function getGoogleMapsUrl(voter: EnrichedVoter): string {
  const parts = [
    voter.registration_line1,
    voter.registration_city,
    voter.registration_state,
    voter.registration_zip,
  ].filter(Boolean)
  const address = parts.join(", ")
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
```

### Propensity Score Display
```typescript
// Claude's discretion: threshold breakpoints
function getPropensityDisplay(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "N/A", color: "bg-gray-100 text-gray-600" }
  if (score >= 70) return { label: `${score}%`, color: "bg-green-100 text-green-700" }
  if (score >= 40) return { label: `${score}%`, color: "bg-yellow-100 text-yellow-700" }
  return { label: `${score}%`, color: "bg-red-100 text-red-700" }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useState for wizard state | Zustand persist + sessionStorage | v1.4 research decision | State survives app switches on mobile |
| Paginated entry fetching | Fetch all entries in single enriched call | Phase 31 | Walk lists bounded at ~200 entries; eliminates pagination UX complexity in wizard |
| Separate voter detail fetches | Joined enriched endpoint | Phase 31 | Eliminates N+1 problem for voter name/party/propensity display |

## Open Questions

1. **Enriched entries endpoint: pagination vs. full fetch**
   - What we know: Walk lists are bounded (turf-scoped, typically 20-200 entries). Current entries endpoint paginates at 50.
   - What's unclear: Whether a walk list could ever exceed 500 entries.
   - Recommendation: Fetch all entries in a single call (no pagination) with a reasonable server-side cap (limit=500). The wizard needs all entries loaded to support the list view and progress counting. Paginating a wizard creates UX complexity for minimal backend benefit.

2. **Prior interaction history query efficiency**
   - What we know: Need attempt count + last result per voter. `VoterInteraction` is append-only with `type=DOOR_KNOCK`.
   - What's unclear: Whether this should be a subquery in the enriched endpoint or a separate call.
   - Recommendation: Include as a correlated subquery in the enriched entries endpoint. Two subqueries per voter (count + last) is fine for 200 rows. Alternatively, use a lateral join or window function.

3. **Skip entry: which entries get SKIPPED on address skip?**
   - What we know: The "Skip" button marks an entry as SKIPPED via PATCH endpoint. But a household may have multiple entries.
   - What's unclear: Whether skipping an address skips all voters at that address, or just the current voter.
   - Recommendation: "Skip" button skips the entire address (all voters at that household). Fire PATCH for each entry. This matches the mental model of "skipping a door."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58 (e2e) + Vitest 4.0 (unit) |
| Config file | `web/playwright.config.ts` + `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANV-01 | Voter card shows name, party, propensity, address | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "voter context"` | No - Wave 0 |
| CANV-02 | Outcome buttons render 9 options, tap records | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "outcome"` | No - Wave 0 |
| CANV-03 | Auto-advance after outcome | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "advance"` | No - Wave 0 |
| CANV-04 | Progress text and bar update | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "progress"` | No - Wave 0 |
| CANV-05 | Survey panel appears on contact, skippable | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "survey"` | No - Wave 0 |
| CANV-06 | Household grouping displays correctly | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "household"` | No - Wave 0 |
| CANV-07 | State persists across navigation | unit | `cd web && npx vitest run src/stores/canvassingStore.test.ts` | No - Wave 0 |
| CANV-08 | Resume prompt appears with correct door number | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "resume"` | No - Wave 0 |
| A11Y-04 | ARIA live region announces transitions | unit | `cd web && npx vitest run --grep "aria live"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx playwright test e2e/phase31-canvassing.spec.ts`
- **Phase gate:** Full Playwright suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/phase31-canvassing.spec.ts` -- covers CANV-01 through CANV-08, A11Y-04
- [ ] `web/src/stores/canvassingStore.test.ts` -- unit tests for persist store logic (CANV-07)
- [ ] Household grouping unit test -- covers null key edge case, single voter, multi-voter

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/models/walk_list.py` -- WalkListEntry, DoorKnockResult enum (9 values), household_key field
- Project codebase: `app/services/canvass.py` -- CanvassService.record_door_knock() implementation
- Project codebase: `app/api/v1/walk_lists.py` -- existing endpoints for entries, door-knocks, entry status update
- Project codebase: `app/api/v1/surveys.py` -- survey questions + batch response endpoints
- Project codebase: `app/models/voter.py` -- Voter fields (name, party, age, propensity_combined, registration address)
- Project codebase: `web/src/stores/authStore.ts` -- Zustand store pattern (non-persist reference)
- Project codebase: `web/src/components/ui/sheet.tsx` -- Sheet component with side="bottom" support
- Project codebase: `web/src/components/field/FieldHeader.tsx` -- 44px touch targets (min-h-11 min-w-11 pattern)
- Project codebase: `web/src/types/field.ts` -- FieldMeResponse with walk_list_id

### Secondary (MEDIUM confidence)
- Zustand persist middleware: well-established API, stable since Zustand v4
- shadcn Sheet with side="bottom": confirmed in sheet.tsx source -- supports top/right/bottom/left

### Tertiary (LOW confidence)
- Mobile keyboard + bottom sheet interaction: based on general web development experience, needs real device testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use in project
- Architecture: HIGH - patterns derived from existing codebase conventions
- Pitfalls: HIGH - based on direct code inspection of models and services
- Backend gap (enriched endpoint): HIGH - confirmed by inspecting WalkListEntryResponse schema (missing voter fields)

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependencies changing)
