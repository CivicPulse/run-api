# Phase 16: Phone Banking - Research

**Researched:** 2026-03-11
**Domain:** Phone banking session management, active calling UI, survey integration
**Confidence:** HIGH

## Summary

The backend for Phase 16 is fully implemented. `PhoneBankService` covers session CRUD, caller assignment, check-in/check-out, call recording with outcome lifecycle, progress aggregation, and entry reassignment. All endpoints are live in `app/api/v1/phone_banks.py`. The frontend has zero phone banking session infrastructure — no routes, hooks, or types exist for sessions. The work is entirely frontend.

The primary challenge is the active calling screen: a stateful, multi-step UI (claim → call → record outcome → advance) that must coordinate with the backend claim lifecycle. The session detail page has the most complexity due to its two-tab layout, role-gated action groups, caller management table, and inline check-in flow. The progress tab polls on a 30-second interval using TanStack Query `refetchInterval`.

One backend gap exists: the `release` endpoint at `POST .../entries/{entryId}/release` currently requires `manager+` role, but the calling screen needs caller self-release (volunteer role). This requires a new volunteer-scoped endpoint or the existing endpoint must be duplicated with relaxed auth.

**Primary recommendation:** Build in this order — (1) types + hooks, (2) sessions index + create, (3) session detail with two tabs, (4) My Sessions caller dashboard, (5) active calling screen, (6) update phone-banking sidebar nav. Address the backend self-release gap in the first plan.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Navigation Structure:**
- Sessions added as a sub-nav item to the existing phone-banking sidebar: Sessions | Call Lists | DNC List | My Sessions
- My Sessions is a dedicated caller dashboard sub-nav item — shows sessions assigned to the current user with check-in status and action buttons
- Phase 15 sidebar layout unchanged; Sessions and My Sessions appended to existing nav

**Sessions Index + Creation:**
- Sessions table columns: Session name | Status badge | Call list name | Scheduled date | Caller count
- Session creation form fields: Name (required) + Call list selector (required) + Scheduled start/end (optional date/time pickers)
- No survey selector — backend schema intentionally has no survey_id; sessions link to a call list only
- Status transitions triggered by contextual action buttons on the session detail page:
  - Draft: [Activate]
  - Active: [Pause] [Complete]
  - Paused: [Resume] [Complete]
  - Completed: no actions (terminal)
- Edit session: name and scheduled times editable; call list not editable after creation
- Delete session: standard ConfirmDialog (no type-to-confirm)

**Caller Dashboard (My Sessions):**
- Route: `/campaigns/$campaignId/phone-banking/my-sessions`
- Shows sessions where the current user is an assigned caller
- Per-row: session name | status badge | call list name | my check-in time | action button (Check In / Resume Calling / Checked Out)
- Callers discover and join sessions from this page

**Session Detail Page:**
- Two-tab layout: Overview tab | Progress tab
- Overview tab contains:
  - Session metadata (name, status, call list, scheduled times)
  - Status transition buttons (role-gated: manager+ only)
  - Caller management table: assigned callers with check-in/check-out times + add/remove caller actions (manager+ only)
  - Check In / Start Calling buttons for callers (role-gated: shown to volunteer role, hidden for unassigned users)
- RequireRole gates: managers see Activate/Pause/Complete + add/remove callers; volunteers see Check In + Start Calling (if checked in and session active)
- Check-in success leaves caller on the session detail; "Start Calling" button becomes active
- Progress tab: session progress dashboard (see below)

**Active Calling Screen:**
- Route: `/campaigns/$campaignId/phone-banking/sessions/$sessionId/call`
- Layout: Two-panel side-by-side
  - Left panel: voter info (name, phone numbers, address, tags)
  - Right panel: survey script (questions + response inputs inline) + outcome buttons below
- Outcome buttons grouped by category:
  - Connected: [Answered]
  - Unanswered: [No Answer] [Busy] [Voicemail]
  - Terminal: [Wrong #] [Refused] [Disconnected] [Deceased]
  - Action: [Skip]
- After recording an outcome: show a brief "Call recorded" confirmation message with a "Next Voter" button — caller controls the pace, not auto-advance
- Survey inline: questions rendered from the call list's linked survey; responses recorded alongside the outcome in `survey_responses`
- Claim lifecycle: claim one entry at a time; when "Next Voter" is clicked, claim the next; if no entries remain, show completion message
- Skip behavior: releases claimed entry back to available without recording an outcome; entry goes back into the pool

**Progress Dashboard:**
- Location: Progress tab on session detail page
- Contents:
  - Progress bar showing completion % (completed / total)
  - Stat chips: Total | Completed | In Progress | Available
  - Per-caller table: Caller | Calls Made | Checked In | Checked Out | Status
  - Caller row kebab menu: [Reassign entries] action (PHON-10)
- Polling: TanStack Query `refetchInterval: 30_000` (30 seconds) — no WebSockets
- Access: manager+ role only (consistent with backend `/progress` endpoint requiring manager role)

### Claude's Discretion
- Exact visual design of outcome button groupings (color-coding, size, spacing)
- Loading skeleton for calling screen between entries
- Empty state for My Sessions (no assigned sessions yet)
- Empty state for sessions index (no sessions created yet)
- Exact layout of stat chips on progress tab
- Error handling when claim fails (no entries available)
- Call timer (start/end timestamps) — whether to show elapsed call time or just record it

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHON-01 | User can create a phone bank session with call list and survey | Backend: `POST /phone-bank-sessions` exists. Frontend: needs `useCreatePhoneBankSession` hook + `SessionDialog` component |
| PHON-02 | User can manage session status transitions (draft → active → complete) | Backend: `PATCH /phone-bank-sessions/{id}` with `status` field. Frontend: contextual action buttons in Overview tab, role-gated to manager+ |
| PHON-03 | User can assign and remove callers to a session | Backend: `POST .../callers` and `DELETE .../callers/{user_id}` exist. Frontend: caller management table in Overview tab, manager+ only |
| PHON-04 | User can check in and check out of a phone bank session | Backend: `POST .../check-in` and `.../check-out` exist (volunteer+ role). Frontend: Check In / Start Calling buttons in Overview tab + My Sessions page |
| PHON-05 | User can use the active calling screen to claim and call voters sequentially | Backend: `POST /call-lists/{callListId}/claim` with `batch_size:1`. Frontend: new `/sessions/$sessionId/call` route with claim-on-load pattern |
| PHON-06 | User can view voter details, contact info, and survey script during a call | Backend: claim response includes `phone_numbers`. Survey: `GET /surveys/{scriptId}` returns questions. Frontend: two-panel calling screen |
| PHON-07 | User can record call outcomes with quick-select buttons | Backend: `POST .../calls` with `result_code`, `phone_number_used`, timestamps. Frontend: outcome button groups in right panel |
| PHON-08 | User can skip or release a claimed call list entry | Backend: existing `release` endpoint requires manager+; needs new volunteer self-release endpoint. Frontend: Skip button calls release endpoint |
| PHON-09 | User can view session progress dashboard with outcome breakdown | Backend: `GET .../progress` returns `SessionProgressResponse`. Frontend: Progress tab with polling, progress bar, stat chips, per-caller table |
| PHON-10 | User can reassign call list entries to other callers | Backend: `POST .../entries/{entryId}/reassign` with `new_caller_id` (manager+ role). Frontend: kebab menu in per-caller progress table |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TanStack Query | ^5.90.21 | Server state, mutation hooks, polling | Project standard; used for all data fetching |
| TanStack Router | ^1.159.5 | File-based routing, typed params | Project standard; all routes use this |
| react-hook-form | ^7.71.1 | Form state management | Project standard; used in all forms |
| sonner | ^2.0.7 | Toast notifications | Project standard; used for success/error |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | ^8.21.3 | Headless table via DataTable component | Sessions index, caller management, progress table |
| Radix UI Tabs | via shadcn | Two-tab layout | Session detail Overview/Progress tabs |
| lucide-react | ^0.563.0 | Icons | Outcome buttons, empty states |
| recharts | ^3.7.0 | Charts (available, not required) | Progress bar can be plain CSS; recharts only if pie/bar chart needed |

### No New Installations Needed
This phase uses exclusively the project's existing dependency set. No new packages required.

## Architecture Patterns

### Recommended Route Structure
```
web/src/routes/campaigns/$campaignId/phone-banking/
├── sessions/
│   ├── index.tsx              # Sessions list (PHON-01, PHON-02)
│   └── $sessionId/
│       ├── index.tsx          # Session detail: Overview + Progress tabs (PHON-02, PHON-03, PHON-04, PHON-09, PHON-10)
│       └── call.tsx           # Active calling screen (PHON-05, PHON-06, PHON-07, PHON-08)
└── my-sessions/
    └── index.tsx              # Caller dashboard (PHON-04)
```

The `phone-banking.tsx` layout adds Sessions and My Sessions to its `navItems` array. No structural changes to the layout itself.

### Hook Module Structure
```
web/src/hooks/
├── usePhoneBankSessions.ts    # All session + caller + progress hooks
└── (useCallLists.ts already exists for call list selector)
```

All phone banking session hooks go in a single `usePhoneBankSessions.ts` file — mirrors the `useCallLists.ts` pattern.

### Pattern 1: Query Key Factory
```typescript
// Source: project convention from useCallLists.ts
export const sessionKeys = {
  all: (campaignId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions"] as const,
  detail: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId] as const,
  callers: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId, "callers"] as const,
  progress: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId, "progress"] as const,
}
```

### Pattern 2: Status Transition Mutations
```typescript
// PATCH with just the status field
export function useUpdateSessionStatus(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: string) =>
      api.patch(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`, {
        json: { status },
      }).json<PhoneBankSessionDetail>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.detail(campaignId, sessionId) })
      qc.invalidateQueries({ queryKey: sessionKeys.all(campaignId) })
    },
  })
}
```

### Pattern 3: Progress Polling
```typescript
// refetchInterval as function — stop polling when session is completed
export function useSessionProgress(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.progress(campaignId, sessionId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/progress`)
        .json<SessionProgressResponse>(),
    refetchInterval: (query) => {
      const data = query.state.data as SessionProgressResponse | undefined
      // Stop polling if all entries are terminal/completed
      if (data && data.available === 0 && data.in_progress === 0) return false
      return 30_000
    },
    enabled: !!sessionId,
  })
}
```

### Pattern 4: Claim-One-at-a-Time State Machine
The calling screen maintains local state that cycles through these phases:
```
IDLE → claiming → CLAIMED (show voter) → recording → RECORDED (show confirmation) → IDLE (next voter)
       ↓ (no entries)
     COMPLETE
```

```typescript
// Local state for calling screen
type CallingState =
  | { phase: "idle" }
  | { phase: "claiming" }
  | { phase: "claimed"; entry: CallListEntry }
  | { phase: "recording"; entry: CallListEntry }
  | { phase: "recorded"; entry: CallListEntry; resultCode: string }
  | { phase: "complete" }
```

Claim is triggered by button click ("Start Calling" or "Next Voter"), not auto-advance.

### Pattern 5: Two-Panel Calling Screen Layout
```tsx
// Left: voter info fixed, Right: survey + outcomes scrollable
<div className="flex gap-6 h-full">
  <div className="w-80 shrink-0 space-y-4">
    {/* Voter info: name, phones, address, tags */}
  </div>
  <div className="flex-1 space-y-6">
    {/* Survey questions inline */}
    {/* Outcome buttons grouped */}
  </div>
</div>
```

### Pattern 6: Session Detail Two-Tab Layout
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="progress">Progress</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="progress">
    <RequireRole minimum="manager">
      {/* progress dashboard */}
    </RequireRole>
  </TabsContent>
</Tabs>
```

### Anti-Patterns to Avoid
- **Auto-advancing after outcome**: The caller must click "Next Voter". Do not call claim immediately after recording.
- **Batch claiming**: The CONTEXT.md specifies claim one at a time. `batch_size: 1` only.
- **Survey outside Answered path**: Survey responses are only recorded when `result_code === "answered"`. Do not send survey_responses for other result codes.
- **Polling with fixed interval**: Use `refetchInterval` as a function so polling stops naturally when no work remains.
- **RequireRole with disabled state**: Project convention is hidden entirely, not greyed-out.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session status badge display | Custom badge logic | `StatusBadge` component | Consistent with call lists, sessions pages |
| Delete confirmation | Custom modal | `ConfirmDialog` | Project standard; already used for call list delete |
| Form navigation guard | Custom beforeunload | `useFormGuard({ form })` | Handles both route blocking AND beforeunload |
| Table pagination/sorting | Custom table | `DataTable` | Project standard with manualSorting/manualPagination |
| Permission gating | Conditional rendering | `RequireRole` | Unified role check via usePermissions hook |
| Toast notifications | Custom alerts | `sonner` toast | Project standard; used everywhere |
| Call list selector in create form | Custom fetch | `useCallLists(campaignId)` | Already exists, tested |

## Common Pitfalls

### Pitfall 1: Self-Release Missing from Backend
**What goes wrong:** The `POST .../entries/{entryId}/release` endpoint requires `manager+` role. The Skip button on the calling screen needs volunteer/caller role self-release.
**Why it happens:** Backend was built for supervisor force-release only; caller skip was an oversight.
**How to avoid:** Add a new endpoint `POST .../entries/{entryId}/self-release` with `require_role("volunteer")` that validates `entry.claimed_by == user.id` before releasing. Or relax the existing endpoint to allow self-release by the claiming user.
**Warning signs:** 403 Forbidden when volunteer clicks Skip.

### Pitfall 2: Callers List Not in Session Response
**What goes wrong:** `PhoneBankSessionResponse` does not include assigned callers. The Overview tab needs the caller list.
**Why it happens:** The session endpoint returns basic session data only. Callers require a separate fetch or the response schema must be extended.
**How to avoid:** Add a `GET .../sessions/{sessionId}/callers` endpoint (or include callers in the session detail response). The frontend needs a `useSessionCallers(campaignId, sessionId)` hook.
**Warning signs:** Empty caller management table even with callers assigned.

### Pitfall 3: Sessions Table "Caller Count" Requires Backend Support
**What goes wrong:** The CONTEXT.md specifies a "Caller count" column in the sessions index table, but `PhoneBankSessionResponse` has no `caller_count` field.
**Why it happens:** The backend list endpoint returns basic session fields; caller counts require a JOIN or subquery.
**How to avoid:** Either (a) extend the session list response with a `caller_count` field via a subquery, or (b) omit the caller count column from the index and show it only on the detail page. Option (b) is simpler and avoids backend changes. Research the CONTEXT.md intent — "Caller count" may be acceptable to defer or approximate.
**Warning signs:** `caller_count` is undefined in `PhoneBankSession` type.

### Pitfall 4: Survey Script Not Linked to Session
**What goes wrong:** The session has no `survey_id`. Surveys are linked to the call list via `script_id`.
**Why it happens:** The session schema intentionally has no survey link (noted in CONTEXT.md). Survey display requires fetching the call list detail to get `script_id`, then fetching the script's questions.
**How to avoid:** On the calling screen, first fetch the session to get `call_list_id`, then fetch the call list detail to get `script_id`, then fetch survey questions. Chain these queries with TanStack Query `enabled` flag dependencies.
**Warning signs:** Survey panel empty despite call list having a script.

### Pitfall 5: call_started_at Must Be Set Before Outcome Recording
**What goes wrong:** `CallRecordCreate` requires `call_started_at` and `call_ended_at`. If the UI doesn't capture them, the API call fails.
**Why it happens:** Backend enforces these fields as required.
**How to avoid:** Set `call_started_at = new Date()` when the entry is claimed/displayed. Set `call_ended_at = new Date()` when the outcome button is clicked. Both are ISO datetime strings sent to the backend.
**Warning signs:** 422 validation errors from `record_call` endpoint.

### Pitfall 6: My Sessions Needs Filtered View of Sessions
**What goes wrong:** The `GET /phone-bank-sessions` endpoint returns all sessions, not just sessions where the current user is a caller.
**Why it happens:** Backend list endpoint has no caller filter.
**How to avoid:** Either (a) add a `?caller_id=me` filter to the backend list endpoint, or (b) filter client-side after fetching callers for each session (expensive), or (c) add a dedicated `GET /phone-bank-sessions?assigned_to_me=true` endpoint. The simplest approach is to add a `assigned_to=<user_id>` query param to the list endpoint that joins against `session_callers`.
**Warning signs:** My Sessions page showing all sessions instead of the caller's sessions.

### Pitfall 7: Progress Tab 403 for Non-Managers
**What goes wrong:** The `/progress` endpoint requires `manager+`. If a volunteer navigates to the Progress tab, all progress queries will 403.
**Why it happens:** Backend enforces manager role on progress endpoint.
**How to avoid:** Wrap the entire Progress tab content in `<RequireRole minimum="manager">`. The tab itself can remain visible, but the content shows a "Manager access required" message rather than breaking with 403s.
**Warning signs:** Console errors with 403 responses on progress queries.

## Code Examples

Verified patterns from existing codebase:

### Claim Entry (batch_size: 1)
```typescript
// POST /api/v1/campaigns/{campaignId}/call-lists/{callListId}/claim
// Returns list<CallListEntryResponse> — take [0]
const claimEntry = useMutation({
  mutationFn: () =>
    api.post(
      `api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`,
      { json: { batch_size: 1 } }
    ).json<CallListEntry[]>(),
})
// Usage: const entry = (await claimEntry.mutateAsync())[0]
// If empty array returned → no entries available → show completion screen
```

### Record Call Outcome
```typescript
// POST /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/calls
interface RecordCallPayload {
  call_list_entry_id: string
  result_code: string       // "answered" | "no_answer" | "busy" | etc.
  phone_number_used: string
  call_started_at: string   // ISO datetime
  call_ended_at: string     // ISO datetime
  notes?: string
  survey_responses?: Array<{ question_id: string; answer_value: string }>
  survey_complete?: boolean
}
```

### Check In / Check Out
```typescript
// POST /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/check-in
// POST /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/check-out
// Both return SessionCallerResponse
// No request body needed

const checkIn = useMutation({
  mutationFn: () =>
    api.post(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/check-in`)
      .json<SessionCallerResponse>(),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: sessionKeys.detail(campaignId, sessionId) })
    qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) })
  },
})
```

### Assign / Remove Caller
```typescript
// POST .../callers — body: { user_id: string }
// DELETE .../callers/{user_id}
const assignCaller = useMutation({
  mutationFn: (userId: string) =>
    api.post(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`, {
      json: { user_id: userId },
    }).json<SessionCallerResponse>(),
  onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) }),
})
```

### Session Status Transition Buttons (role-gated)
```tsx
// Only show transitions valid for current status
const STATUS_ACTIONS: Record<string, Array<{ label: string; status: string; variant?: string }>> = {
  draft: [{ label: "Activate", status: "active" }],
  active: [
    { label: "Pause", status: "paused", variant: "outline" },
    { label: "Complete", status: "completed", variant: "outline" },
  ],
  paused: [
    { label: "Resume", status: "active" },
    { label: "Complete", status: "completed", variant: "outline" },
  ],
  completed: [],
}
```

### Outcome Result Code → UI Mapping
```typescript
// Based on CallResultCode enum in app/models/call_list.py
const OUTCOME_GROUPS = [
  {
    label: "Connected",
    outcomes: [{ code: "answered", label: "Answered" }],
  },
  {
    label: "Unanswered",
    outcomes: [
      { code: "no_answer", label: "No Answer" },
      { code: "busy", label: "Busy" },
      { code: "voicemail", label: "Voicemail" },
    ],
  },
  {
    label: "Terminal",
    outcomes: [
      { code: "wrong_number", label: "Wrong #" },
      { code: "refused", label: "Refused" },
      { code: "disconnected", label: "Disconnected" },
      { code: "deceased", label: "Deceased" },
    ],
  },
] as const
```

### Skeleton Pattern (from $callListId.tsx)
```tsx
// Reuse the exact skeleton pattern from existing call list detail page
if (isLoading) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-32" />
    </div>
  )
}
```

## Backend Gaps Requiring New Work

### Gap 1: Caller Self-Release Endpoint (PHON-08)
**Current:** `POST .../sessions/{sessionId}/entries/{entryId}/release` requires `manager+`
**Needed:** Volunteer-level self-release that validates `entry.claimed_by == requesting_user.id`
**Recommendation:** Add a new service method `self_release_entry(session, entry_id, user_id)` that validates ownership and releases. Wire to a new endpoint with `require_role("volunteer")`. Keep the existing force-release endpoint for managers.

### Gap 2: Session Callers List Endpoint (PHON-03)
**Current:** No `GET .../sessions/{sessionId}/callers` endpoint exists in `phone_banks.py`
**Needed:** Endpoint to list callers for a session so the caller management table can be populated
**Recommendation:** Add `GET /campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers` returning `list[SessionCallerResponse]`. Requires `volunteer+` role so callers can see the list.

### Gap 3: My Sessions Filtered View (PHON-04)
**Current:** `GET /phone-bank-sessions` returns all sessions; no caller filter
**Needed:** Filter to sessions where the requesting user is an assigned caller
**Recommendation:** Add `?assigned_to_me=true` query param to `list_sessions` endpoint that joins against `session_callers` where `user_id = current_user.id`. Alternative: filter client-side by fetching all sessions and all caller assignments (expensive). Backend filter is preferred.

### Gap 4: Caller Count in Sessions List (PHON-01)
**Current:** `PhoneBankSessionResponse` has no `caller_count` field
**Needed:** Sessions index table shows "Caller count" column per CONTEXT.md
**Recommendation:** Add a `caller_count: int` field to `PhoneBankSessionResponse` computed via subquery in `list_sessions`. The service can do a COUNT on `session_callers` grouped by `session_id`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto-advance calling screen | Manual "Next Voter" button | This phase design decision | Caller controls pace, reduces accidental skips |
| WebSocket progress updates | TanStack Query polling (30s) | Explicit scope exclusion | Simpler infrastructure; acceptable latency for supervisor dashboard |
| Batch claim prefetch | Single-entry claim (batch_size=1) | This phase design decision | Simpler state machine; no stale claimed entries |

**Existing implementations to reference:**
- `call-lists/$callListId.tsx`: two-panel tab-like filter UI with stat chips — closest analog to session detail
- `useCallLists.ts`: the exact hook pattern to replicate for session hooks

## Open Questions

1. **Caller name display in caller management table**
   - What we know: `SessionCallerResponse` contains `user_id` (a ZITADEL user ID string), not a display name
   - What's unclear: Is there a `GET /users/{userId}` endpoint or a users list? If not, caller management table will show raw user IDs
   - Recommendation: Check if the project has a users/members endpoint (likely on campaigns). The campaign members endpoint (`GET /campaigns/{campaignId}/members`) probably returns display names. Use that to resolve user IDs to names.

2. **Add Caller to session: user selector source**
   - What we know: `AssignCallerRequest` takes a `user_id` string. The UI needs a way to pick a user.
   - What's unclear: Whether there's a campaign members dropdown ready to use or if it needs building
   - Recommendation: Query campaign members for the picker. Likely `GET /campaigns/{campaignId}/members` which already exists from Phase 12.

3. **Survey questions when call list has no script**
   - What we know: `CallList.script_id` is nullable. Many call lists may have no survey.
   - What's unclear: Whether the right panel shows nothing, or a placeholder, when `script_id` is null
   - Recommendation: Treat null `script_id` as no-survey mode. Right panel shows outcome buttons only, no survey section.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + @testing-library/react 16.3.2 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHON-01 | SessionDialog renders create/edit modes | unit | `npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/index.test.tsx` | ❌ Wave 0 |
| PHON-02 | Status transition buttons show for correct statuses | unit | `npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx` | ❌ Wave 0 |
| PHON-03 | Caller management table renders, add/remove calls correct hooks | unit | Same as PHON-02 file | ❌ Wave 0 |
| PHON-04 | Check-in/check-out buttons shown/hidden by role | unit | Same as PHON-02 file | ❌ Wave 0 |
| PHON-05 | Calling screen claims on "Start Calling", transitions states | unit | `npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/call.test.tsx` | ❌ Wave 0 |
| PHON-06 | Voter info and survey questions render for claimed entry | unit | Same as PHON-05 file | ❌ Wave 0 |
| PHON-07 | Outcome button click records call and shows confirmation | unit | Same as PHON-05 file | ❌ Wave 0 |
| PHON-08 | Skip button releases entry without recording outcome | unit | Same as PHON-05 file | ❌ Wave 0 |
| PHON-09 | Progress tab shows stat chips and caller table with polling | unit | Same as PHON-02 file | ❌ Wave 0 |
| PHON-10 | Reassign kebab menu visible for manager, triggers mutation | unit | Same as PHON-02 file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx` — covers PHON-01
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` — covers PHON-02, PHON-03, PHON-04, PHON-09, PHON-10
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` — covers PHON-05, PHON-06, PHON-07, PHON-08
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx` — covers PHON-04 caller view
- [ ] Backend: `tests/unit/test_phone_bank_gaps.py` — covers self-release endpoint, callers list endpoint, my-sessions filter

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `app/api/v1/phone_banks.py`, `app/services/phone_bank.py`, `app/models/phone_bank.py`, `app/schemas/phone_bank.py`
- Codebase direct inspection — `app/models/call_list.py`, `app/services/call_list.py`, `app/schemas/survey.py`
- Codebase direct inspection — `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/index.tsx`, `$callListId.tsx`
- Codebase direct inspection — `web/src/hooks/useCallLists.ts`, `web/src/types/call-list.ts`
- Codebase direct inspection — `web/src/components/shared/` (DataTable, RequireRole, ConfirmDialog, StatusBadge)
- `.planning/phases/16-phone-banking/16-CONTEXT.md` — locked decisions
- `STACK.md` — verified library versions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated decisions from Phases 12-15 (direct codebase reference, not assumptions)

### Tertiary (LOW confidence)
- None — all findings verified against source code

## Metadata

**Confidence breakdown:**
- Backend API surface: HIGH — fully verified from source code
- Frontend patterns: HIGH — verified from existing phase 15 implementations
- Backend gaps: HIGH — verified absence from `phone_banks.py`
- Test infrastructure: HIGH — vitest.config.ts and setup.ts confirmed

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable codebase, 30-day window)
