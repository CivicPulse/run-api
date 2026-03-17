# Phase 31: Canvassing Wizard - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Volunteers can work through an entire walk list door-by-door from their phone, recording outcomes and answering surveys without losing progress. This phase delivers: a linear canvassing wizard with household grouping, outcome recording via touch-target buttons, inline survey flow, persistent state across interruptions, and shared field components (OutcomeGrid, InlineSurvey, FieldProgress, VoterCard) that Phase 32 will reuse. The canvassing route placeholder at `/field/{campaignId}/canvassing` becomes the full wizard. Offline sync (Phase 33), onboarding tour (Phase 34), and accessibility audit (Phase 35) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Outcome buttons
- All 9 DoorKnockResult values displayed as flat, equal buttons — no grouping or hierarchy
- 2-column grid layout, all visible without scrolling or expansion
- Color-coded by category: green (Supporter), yellow (Undecided, Come Back Later), red (Refused, Opposed), grey (Not Home, Moved, Deceased, Inaccessible)
- One tap records the outcome — no confirmation dialog
- Survey triggers on contact outcomes: Supporter, Undecided, Opposed, AND Refused (partial info capture on refusals)
- Non-contact outcomes (Not Home, Come Back, Moved, Deceased, Inaccessible) skip survey and auto-advance

### Household grouping
- Entries sharing the same `household_key` are grouped under a single address header
- Layout: address header card at top, then stacked voter sub-cards below
- Outcome buttons appear inline on each voter's sub-card (not in a shared bottom area)
- Completed voters show their recorded outcome with a checkmark; active voter shows outcome buttons
- Bulk apply: after recording "Not Home" for the first voter, prompt "Apply to all N voters at this address?" with Yes/No
- Consistent layout for single-voter addresses — same address header + voter sub-card pattern, no special "merged" card
- Wizard advances to next address only after all voters at the current address are handled

### Voter context card
- Each voter sub-card shows: name, party (colored badge), propensity score (% with color-coded badge: green high, yellow medium, red low), and age
- Prior interaction history shown: attempt count + last outcome (e.g., "2nd visit — last: Not Home, Mar 10")
- Address displayed prominently at top of household card in large text
- Address is tappable — opens Google Maps navigation link using street address (not lat/long)

### Wizard flow & navigation
- Default flow is linear: advance to next address after recording all outcomes at current address
- "Skip" button available to skip a door (marks entry as SKIPPED)
- List view accessible via button — shows all doors with status, allows jumping to any door
- Progress indicator: text ("12 of 47 doors") plus thin progress bar below the field header
- Progress counts addresses/doors, not individual voters

### Resume behavior
- Wizard state persisted via Zustand persist + sessionStorage (decided in v1.4 research)
- On re-entering canvassing after interruption: toast/banner prompt "Pick up where you left off? Door 23 of 47" with Resume and Start Over buttons
- Auto-resumes after 10 seconds if no action
- "Start Over" jumps to first PENDING (unvisited) door — does NOT clear already-recorded outcomes
- "Resume" returns to the exact door where the volunteer left off

### Inline survey
- Survey questions appear in a slide-up panel from the bottom after a contact outcome
- Panel overlays the current card (card content dimmed behind)
- "Skip Survey" button always visible — skipping is explicitly supported per CANV-05
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

</decisions>

<specifics>
## Specific Ideas

- Outcome buttons should be large enough for outdoor use with gloves or sweaty hands — 44px minimum per WCAG 2.5.5 (A11Y-04 is in scope for this phase)
- Household view should feel like "working one house at a time" — the address is the unit of work, not individual voters
- Google Maps link should use street address per project feedback (not lat/long coordinates)
- Survey slide-up panel should feel like a natural continuation of the door interaction, not a separate mode
- Bulk "Not Home" apply saves significant time — houses with 3-4 registered voters where nobody's home are very common

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CanvassService.record_door_knock()`: Records interaction, updates entry status to VISITED, increments walk list stats — fully functional backend
- `WalkListEntry` model: has `household_key` for grouping, `sequence` for ordering, `status` (PENDING/VISITED/SKIPPED)
- `DoorKnockResult` enum: 9 values already defined in `app/models/walk_list.py`
- `SurveyScript` + `SurveyQuestion` + `SurveyResponse` models: Full survey engine with question types (multiple_choice, scale, free_text)
- `WalkList.script_id`: Optional FK to survey script — walk list knows its survey
- `AssignmentCard` component: Already links to `/field/{campaignId}/canvassing`
- `FieldMeResponse` type: Provides `walk_list_id`, name, total, completed for the canvassing assignment
- shadcn/ui: Card, Button, Badge, Progress, Sheet (for slide-up panel) all available
- `useAuthStore` (Zustand): Already configured for persist — wizard state store follows same pattern

### Established Patterns
- Field layout shell with FieldHeader (back/title/help/avatar) — wizard renders inside this
- TanStack Router file-based routing: wizard lives at `web/src/routes/field/$campaignId/canvassing.tsx`
- React Query hooks: `useWalkListEntries(walkListId)` pattern for data fetching
- `ky` HTTP client with auth interceptor for API calls
- Zustand persist + sessionStorage for state that survives page refreshes (decided in v1.4 research)

### Integration Points
- `canvassing.tsx` route: Currently a placeholder "coming soon" — becomes the wizard
- `POST /api/v1/campaigns/{id}/walk-lists/{wl_id}/door-knocks`: Existing endpoint for recording outcomes
- `GET /api/v1/campaigns/{id}/walk-lists/{wl_id}/entries`: Endpoint to fetch walk list entries (needs household grouping)
- Survey API: `GET /api/v1/campaigns/{id}/surveys/{script_id}/questions` for fetching survey questions
- Survey API: `POST /api/v1/campaigns/{id}/surveys/{script_id}/responses` for recording answers
- `VoterInteraction` query: Count + last outcome for prior visit history display
- Field header: FieldProgress component integrates into existing FieldHeader layout

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 31-canvassing-wizard*
*Context gathered: 2026-03-15*
