# Phase 32: Phone Banking Field Mode - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Volunteers can work through a phone banking session from their phone, calling voters and recording outcomes without switching between apps. This phase delivers: a mobile calling experience with auto check-in, tap-to-call via native dialer, outcome recording via generalized touch-target buttons, inline survey reuse after answered calls, session progress tracking, and a completion summary. The phone-banking route placeholder at `/field/{campaignId}/phone-banking` becomes the full calling flow. Offline sync (Phase 33), onboarding tour (Phase 34), and accessibility audit (Phase 35) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Call flow & session lifecycle
- Auto check-in: volunteer taps "Start Calling" on landing hub card, is automatically checked into the active session, and gets first batch of entries — one tap to start
- One voter at a time: show a single voter card with phone numbers and outcome buttons. Batch claiming (5 entries) happens invisibly in the background
- Pre-fetch next batch when 2 entries remain to avoid loading gaps between voters
- Auto-advance to next voter after recording an outcome (same pattern as canvassing wizard)
- Skip button available: releases the entry back to AVAILABLE via `self_release_entry()` so another caller can pick it up
- Session end: both back arrow (with confirmation dialog "Done calling? Your progress is saved.") AND an explicit "End Session" button visible during calling
- End session triggers check-out + release of all claimed entries

### Outcome buttons & survey trigger
- 8 outcomes from CallResultCode displayed in 2-column grid (same layout as canvassing)
- Color-coded matching canvassing pattern: green (Answered), yellow (No Answer, Busy, Voicemail), red (Refused, Deceased), grey (Wrong Number, Disconnected)
- Grid order: Answered, No Answer, Busy, Voicemail, Wrong Number, Refused, Deceased, Disconnected
- OutcomeGrid component generalized to accept generic outcome configs (codes, labels, colors) as props — both canvassing and phone banking pass their own config
- Survey triggers on ANSWERED only — all other outcomes skip survey and auto-advance
- InlineSurvey component reused as-is (already generic with campaignId, scriptId, voterId props)

### Phone number display & dialing
- All phone numbers visible — no hiding behind dropdowns. Each number shown with type label (Cell, Home, Work) and its own "Call" button
- Tap to call opens native dialer via `tel:` link using E.164 format (+15551234567)
- Display format is human-readable: (555) 123-4567
- Long-press on any phone number copies E.164 to clipboard with toast confirmation "Copied"
- Track which phone number was used: send `phone_number_used` with the outcome (backend already supports this via CallRecordCreate)
- Previously-tried numbers visually marked: strikethrough + "Wrong Number" for terminal numbers, "1 prior try" indicator for recyclable. Terminal numbers hide the Call button

### Voter card & caller context
- Reuse VoterCard component: show name, party badge, propensity score, age, and prior call attempt history ("2nd call — last: No Answer, Mar 10")
- Phone numbers displayed below voter info on the same card (integrated, not separate sections)
- Completion screen when no more entries: summary with calls made, outcome breakdown (answered, no answer, voicemail, other), and "Back to Hub" button

### Claude's Discretion
- Exact Tailwind styling, spacing, and animation for the calling screen
- Batch size tuning (default 5, but could adjust)
- End Session button placement and visibility (persistent footer vs collapsible)
- Confirmation dialog styling for session end
- Phone number formatting library choice (or manual formatting)
- Completion screen animation and layout
- How to detect tel: link support for the copy fallback

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phone banking backend
- `app/models/call_list.py` — CallList, CallListEntry, CallResultCode, EntryStatus models
- `app/models/phone_bank.py` — PhoneBankSession, SessionCaller, SessionStatus models
- `app/services/phone_bank.py` — Full session lifecycle: create, check-in/out, claim entries, record calls, progress tracking
- `app/services/call_list.py` — CallListService with claim_entries() using SELECT FOR UPDATE SKIP LOCKED
- `app/schemas/phone_bank.py` — CallRecordCreate (phone_number_used field), SessionProgressResponse

### Shared field components (from Phase 31)
- `web/src/components/field/OutcomeGrid.tsx` — Currently canvassing-specific, needs generalization to accept outcome configs
- `web/src/components/field/InlineSurvey.tsx` — Generic survey component, reuse as-is
- `web/src/components/field/FieldProgress.tsx` — Generic progress bar with configurable unit label
- `web/src/components/field/VoterCard.tsx` — Voter context card with name, party, propensity, age, prior interactions

### Field infrastructure (from Phase 30)
- `web/src/routes/field/$campaignId/phone-banking.tsx` — Placeholder route to replace
- `web/src/components/field/FieldHeader.tsx` — Header with back/title/help/avatar
- `web/src/routes/field/$campaignId.tsx` — Field layout shell

### Survey system
- `web/src/hooks/useSurveys.ts` — useSurveyScript, useRecordResponses hooks
- `web/src/types/survey.ts` — QuestionResponse type

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OutcomeGrid`: Needs generalization from DoorKnockResultCode to generic outcome config — extract color/label maps to props
- `InlineSurvey`: Already generic (campaignId, scriptId, voterId, open, onComplete, onSkip) — direct reuse
- `FieldProgress`: Already generic with configurable `unit` prop (default "doors", pass "calls") — direct reuse
- `VoterCard`: Reuse for voter context display — may need phone numbers section added
- `PhoneBankService.claim_entries_for_session()`: Backend batch claiming ready to use
- `PhoneBankService.record_call()`: Full call recording with interaction events, survey, DNC auto-flagging
- `PhoneBankService.check_in()` / `check_out()`: Session lifecycle ready
- `CallList.script_id`: Optional FK to survey script — same pattern as walk list
- Zustand persist pattern: Established in canvassing store for session state persistence

### Established Patterns
- Field layout shell with FieldHeader (back/title/help/avatar) — phone banking renders inside this
- TanStack Router file-based routing: phone banking at `web/src/routes/field/$campaignId/phone-banking.tsx`
- React Query hooks: follow `useWalkListEntries` pattern for `useClaimedEntries`, `useRecordCall`
- `ky` HTTP client with auth interceptor for API calls
- Zustand persist + sessionStorage for state (calling session progress, current entry index)
- Sonner toast for transient feedback (clipboard copy, session end confirmation)

### Integration Points
- `phone-banking.tsx` route: Currently placeholder "coming soon" — becomes the calling flow
- `POST /api/v1/campaigns/{id}/phone-bank/sessions/{sid}/calls`: Record call outcome endpoint
- `POST /api/v1/campaigns/{id}/phone-bank/sessions/{sid}/claim`: Claim entries endpoint
- `POST /api/v1/campaigns/{id}/phone-bank/sessions/{sid}/check-in`: Check-in endpoint
- `POST /api/v1/campaigns/{id}/phone-bank/sessions/{sid}/check-out`: Check-out endpoint
- `GET /api/v1/campaigns/{id}/field/me`: Returns session_id for phone banking assignment
- Survey API: Same endpoints as canvassing (GET questions, POST responses)

</code_context>

<specifics>
## Specific Ideas

- Calling experience should feel like "one voter at a time" — focused, not overwhelming
- All phone numbers visible upfront with type labels — callers often need to try alternate numbers
- Terminal numbers (wrong/disconnected) should be visually struck through so callers don't waste time
- Completion screen should feel rewarding — "Great work!" with session stats gives a sense of accomplishment
- Long-press to copy is a natural mobile gesture — unobtrusive fallback for tel: link issues
- End session needs both quick exit (back arrow) and explicit closure (End Session button) — belt and suspenders

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-phone-banking-field-mode*
*Context gathered: 2026-03-15*
