# Phase 16: Phone Banking - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and manage phone bank sessions, manage caller assignment and check-in, use an active calling screen to claim voters sequentially and record outcomes with survey responses, and view session progress dashboards. Requirements: PHON-01 through PHON-10.

Excluded: predictive dialer, WebSocket real-time updates (polling-only), telephony integration.

</domain>

<decisions>
## Implementation Decisions

### Navigation Structure
- **Sessions added as a sub-nav item** to the existing phone-banking sidebar: Sessions | Call Lists | DNC List | My Sessions
- **My Sessions** is a dedicated caller dashboard sub-nav item — shows sessions assigned to the current user with check-in status and action buttons
- Phase 15 sidebar layout unchanged; Sessions and My Sessions appended to existing nav

### Sessions Index + Creation
- **Sessions table columns**: Session name | Status badge | Call list name | Scheduled date | Caller count
- **Session creation form fields**: Name (required) + Call list selector (required) + Scheduled start/end (optional date/time pickers)
- **No survey selector** — backend schema intentionally has no survey_id; sessions link to a call list only
- **Status transitions** triggered by contextual action buttons on the session detail page:
  - Draft: \[Activate\]
  - Active: \[Pause\] \[Complete\]
  - Paused: \[Resume\] \[Complete\]
  - Completed: no actions (terminal)
- **Edit session**: name and scheduled times editable; call list not editable after creation
- **Delete session**: standard ConfirmDialog (no type-to-confirm)

### Caller Dashboard (My Sessions)
- Route: `/campaigns/$campaignId/phone-banking/my-sessions`
- Shows sessions where the current user is an assigned caller
- Per-row: session name | status badge | call list name | my check-in time | action button (Check In / Resume Calling / Checked Out)
- Callers discover and join sessions from this page

### Session Detail Page
- **Two-tab layout**: Overview tab | Progress tab
- **Overview tab** contains:
  - Session metadata (name, status, call list, scheduled times)
  - Status transition buttons (role-gated: manager+ only)
  - Caller management table: assigned callers with check-in/check-out times + add/remove caller actions (manager+ only)
  - Check In / Start Calling buttons for callers (role-gated: shown to volunteer role, hidden for unassigned users)
- **RequireRole gates**: managers see Activate/Pause/Complete + add/remove callers; volunteers see Check In + Start Calling (if checked in and session active)
- Check-in success leaves caller on the session detail; "Start Calling" button becomes active
- **Progress tab**: session progress dashboard (see below)

### Active Calling Screen
- **Route**: `/campaigns/$campaignId/phone-banking/sessions/$sessionId/call`
- **Layout**: Two-panel side-by-side
  - Left panel: voter info (name, phone numbers, address, tags)
  - Right panel: survey script (questions + response inputs inline) + outcome buttons below
- **Outcome buttons grouped by category**:
  - Connected: \[Answered\]
  - Unanswered: \[No Answer\] \[Busy\] \[Voicemail\]
  - Terminal: \[Wrong #\] \[Refused\] \[Disconnected\] \[Deceased\]
  - Action: \[Skip\]
- **After recording an outcome**: show a brief "Call recorded" confirmation message with a "Next Voter" button — caller controls the pace, not auto-advance
- **Survey inline**: questions rendered from the call list's linked survey; responses recorded alongside the outcome in `survey_responses`
- **Claim lifecycle**: claim one entry at a time; when "Next Voter" is clicked, claim the next; if no entries remain, show completion message
- **Skip behavior**: releases claimed entry back to available without recording an outcome; entry goes back into the pool

### Progress Dashboard
- **Location**: Progress tab on session detail page
- **Contents**:
  - Progress bar showing completion % (completed / total)
  - Stat chips: Total | Completed | In Progress | Available
  - Per-caller table: Caller | Calls Made | Checked In | Checked Out | Status
  - Caller row kebab menu: \[Reassign entries\] action (PHON-10)
- **Polling**: TanStack Query `refetchInterval: 30_000` (30 seconds) — no WebSockets
- **Access**: manager+ role only (consistent with backend `/progress` endpoint requiring manager role)

### Claude's Discretion
- Exact visual design of outcome button groupings (color-coding, size, spacing)
- Loading skeleton for calling screen between entries
- Empty state for My Sessions (no assigned sessions yet)
- Empty state for sessions index (no sessions created yet)
- Exact layout of stat chips on progress tab
- Error handling when claim fails (no entries available)
- Call timer (start/end timestamps) — whether to show elapsed call time or just record it

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `usePhoneBankSessions(campaignId)` hook in `web/src/hooks/useFieldOps.ts`: already exists, queries `/api/v1/campaigns/${campaignId}/phone-bank-sessions`
- `PhoneBankSession` type in `web/src/types/field-ops.ts`: already defined
- `phone-banking.tsx` layout file: already a sidebar nav + Outlet (matches voters.tsx pattern) — add Sessions and My Sessions to navItems array
- `DataTable` component: use for sessions index and progress caller table
- `StatusBadge`: use for session status and entry status
- `ConfirmDialog`: use for session delete
- `RequireRole`: use to gate manager vs caller actions on session detail
- `useCallLists(campaignId)` hook: use for call list selector in session creation form

### Established Patterns
- Sidebar layout: `phone-banking.tsx` already implemented — append nav items
- DataTable: manualSorting, manualFiltering, manualPagination for all server-side data
- Dialog create/edit: same component with optional `editSession` prop
- Toast notifications: sonner for success/error feedback
- useFormGuard: wire on session creation/edit form
- RequireRole: hides unauthorized content entirely (no disabled/greyed-out state)
- Kebab menu: ColumnDef cell renderer in consuming component, not baked into DataTable
- Polling: TanStack Query `refetchInterval` as a function checking data state

### Integration Points
- Session creation requires call list selector: query `/api/v1/campaigns/${campaignId}/call-lists`
- Claim endpoint: `POST /api/v1/campaigns/${campaignId}/call-lists/{callListId}/claim` — returns one entry with voter phone numbers
- Outcome recording: `POST /api/v1/campaigns/${campaignId}/phone-bank-sessions/{sessionId}/calls` with `call_list_entry_id`, `result_code`, `phone_number_used`, `call_started_at`, `call_ended_at`, `survey_responses`
- Skip/release: `POST /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/entries/{entryId}/release` (caller self-release)
- Progress: `GET /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/progress` — returns SessionProgressResponse (manager+ only)
- Check-in/check-out: `POST /sessions/{sessionId}/check-in` and `/check-out`
- Reassign: `POST /sessions/{sessionId}/entries/{entryId}/reassign` with `new_caller_id`

### Notes
- `EntryStatus` values: available, in_progress, completed, max_attempts, terminal
- `CallResultCode` values: answered, no_answer, busy, wrong_number, voicemail, refused, deceased, disconnected
- `SessionStatus` values: draft, active, paused, completed
- Person-level terminal outcomes (refused, deceased) mark entire entry TERMINAL + auto-DNC on refused
- Number-level terminal outcomes (wrong_number, disconnected) mark that phone only
- Recyclable outcomes (no_answer, busy, voicemail) increment attempts, set AVAILABLE (or MAX_ATTEMPTS if limit hit)

</code_context>

<specifics>
## Specific Ideas

- Calling screen mockup confirmed: two-panel layout (voter info left, survey + outcomes right)
- Outcome buttons grouped: Connected | Unanswered | Terminal (3 visual groups + Skip action)
- "Next Voter" button after confirmation — caller controls pace (not auto-advance)
- My Sessions dashboard: caller-focused filtered list of assigned sessions with per-row action buttons
- Session detail: two-tab layout (Overview | Progress) rather than separate routes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-phone-banking*
*Context gathered: 2026-03-11*
