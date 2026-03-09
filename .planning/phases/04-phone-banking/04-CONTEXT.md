# Phase 4: Phone Banking - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Campaign managers can run phone banking operations — generate call lists from voter universe criteria, manage phone bank sessions with caller assignment, record call outcomes, and capture survey responses during calls. Reuses the Phase 3 survey engine (SurveyScript, SurveyQuestion, SurveyResponse) without modification. Includes a separate DNC (do-not-call) management system with audit trail. Branched survey logic (CANV-09/PHONE-02 branched portion) is deferred to v2 — linear scripts only.

</domain>

<decisions>
## Implementation Decisions

### Call List Model
- Frozen snapshot — generated once from voter universe criteria, voter set locked at creation (consistent with walk list pattern)
- Claim-on-fetch entry assignment: caller requests next batch of entries, system marks them "in_progress" with caller ID and timestamp; entries release back to pool after configurable timeout (e.g., 30 min)
- Voters ordered by priority score — high-persuasion or fewer prior contact attempts first, maximizing impact per call hour
- Auto-recycle with cooldown: no-answer/busy entries automatically return to pool after cooldown period (e.g., 1 hour); manager-configurable max attempts per voter (e.g., 3); terminal outcomes (refused, deceased, wrong number on all numbers) never retried
- Multi-phone support: each call list entry includes all available phone numbers for a voter (ordered by priority — primary first). Auto-advance to next number on wrong number/disconnected outcome
- Person-level terminal outcomes: "refused" or "deceased" stops trying all numbers for that voter; "wrong number" or "disconnected" only marks that specific phone number
- Basic phone format validation during call list generation — filter out obviously invalid numbers (too short, non-numeric); no carrier lookups

### Phone Bank Sessions
- PhoneBankSession entity wraps a group of callers working a call list during a time window
- Session has: name, scheduled start/end, call list reference, assigned callers
- One call list can span multiple sessions — progress carries over between sessions
- Caller-level check-in/check-out timestamps via session_callers join table (check_in_at, check_out_at) — enables per-caller stats and Phase 5 volunteer hour tracking
- Status lifecycle: draft (setup, assign callers) → active (callers can work) → completed (session ended, stats finalized) — consistent with walk list and survey script patterns
- Each call records start + end timestamps (call_started_at, call_ended_at) for duration metrics
- Optional free-text notes per call — consistent with door-knock notes field
- Supervisor view included in Phase 4 (not deferred to dashboards):
  - Per-caller progress visibility
  - Reassign entries between callers
  - Force-release claimed entries back to pool
  - End caller session (check out + release entries)
  - Pause/resume entire session (no new claims while paused)

### DNC Management
- Separate campaign-scoped DNC table (not a voter-level flag or phone-level flag)
- RLS on campaign_id — each campaign manages its own DNC list
- DNC entry tracks: phone_number, reason enum (refused, voter_request, registry_import, manual), added_by (user ID or "system"), added_at timestamp — full audit trail
- Four DNC sources:
  1. Manual add by campaign manager via API endpoint
  2. Auto-flag on "refused" call outcome — system automatically adds number
  3. Bulk CSV import for external DNC registry numbers (federal/state lists)
  4. Caller-initiated during call — explicit "add to DNC" action separate from outcome
- Call list generation filters out all DNC numbers during creation

### Script & Survey Integration
- Linear scripts only for v1 — branched logic deferred to v2 (aligns with CANV-09 deferral)
- Reuse existing SurveyScript model as-is — same scripts can serve canvassing and phone banking
- No phone-specific script fields (intro/closing text is a client-side concern)
- Call flow: outcome recorded first (answered, no answer, etc.) → if "answered", proceed to survey → non-contact outcomes skip survey
- Partial survey responses saved — if voter hangs up mid-survey, captured responses are kept and marked as partial completion
- Survey responses emit SURVEY_RESPONSE interaction events (same as canvassing)
- Call outcomes emit PHONE_CALL interaction events with JSONB payload: result_code, call_list_id, session_id, phone_number_used, call_started_at, call_ended_at, notes

### Claude's Discretion
- Exact claim-on-fetch batch size and timeout defaults
- Call list entry table schema details (indexes, constraints)
- DNC bulk import CSV format and validation rules
- Session pause implementation (status field vs separate flag)
- Priority score calculation for call ordering
- Phone number format validation rules
- Entry release mechanism (background job vs on-fetch check)

</decisions>

<specifics>
## Specific Ideas

- InteractionType enum already has a comment "Phase 4 adds phone_call" — just add the PHONE_CALL value via Alembic migration
- Supervisor actions (reassign, force-release, end caller, pause/resume) are API endpoints for session managers, not a separate dashboard — they're operational controls
- DNC auto-flag on "refused" means the caller doesn't have to remember to add to DNC separately — reduces cognitive load
- Person-level vs number-level terminal distinction is important: "refused" = the person doesn't want to talk (stop all numbers); "wrong number" = just that phone line is bad (try others)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SurveyScript` / `SurveyQuestion` / `SurveyResponse` (app/models/survey.py): Intentionally decoupled from canvassing — reuse directly for phone banking
- `SurveyService` (app/services/survey.py): Script lifecycle, question CRUD, response recording with VoterInteractionService composition — reuse for phone call survey recording
- `VoterInteraction` / `InteractionType` (app/models/voter_interaction.py): Append-only event log, native_enum=False — add PHONE_CALL type
- `VoterInteractionService` (app/services/voter_interaction.py): record_interaction() — compose into new PhoneBankService for call outcome recording
- `build_voter_query()`: Standalone composable query builder — reuse for call list generation targeting
- `VoterListService`: Manages voter lists/target universes — call list generation can reference list IDs
- `PaginatedResponse[T]` (app/schemas/common.py): Generic pagination — use for call list entries
- `set_campaign_context()` (app/db/rls.py): RLS context setter — all new tables need campaign_id + RLS policies
- `CampaignRole` enum (app/core/security.py): Role hierarchy — manager+ for session/list management, volunteer+ for calling

### Established Patterns
- Service class pattern with VoterInteractionService composition for event recording
- Status lifecycle enum (draft → active → completed/archived) on walk lists and survey scripts
- Frozen snapshot generation (walk lists) — same pattern for call lists
- Cursor-based pagination for list entries
- JSONB payload on VoterInteraction for flexible event data
- native_enum=False on all StrEnum columns
- RLS on child tables via subquery through parent's campaign_id

### Integration Points
- InteractionType enum: add PHONE_CALL value via Alembic migration
- New models: CallList, CallListEntry, PhoneBankSession, SessionCaller, DoNotCallEntry
- New routes mount via app/api/v1/router.py
- RLS policies on all new tables (call_lists, call_list_entries, phone_bank_sessions, session_callers, do_not_call)
- Voter contact model (Phase 2): query phone numbers for multi-phone call list entries

</code_context>

<deferred>
## Deferred Ideas

- Branched survey logic (CANV-09) — v2 enhancement that will benefit both canvassing and phone banking
- Predictive dialer / telephony integration — explicitly out of scope per REQUIREMENTS.md
- Real-time WebSocket for live session monitoring — SSE sufficient per project constraints

</deferred>

---

*Phase: 04-phone-banking*
*Context gathered: 2026-03-09*
