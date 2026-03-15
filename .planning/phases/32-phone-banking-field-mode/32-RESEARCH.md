# Phase 32: Phone Banking Field Mode - Research

**Researched:** 2026-03-15
**Domain:** Mobile calling UI, session lifecycle, tel: links, phone formatting, component generalization
**Confidence:** HIGH

## Summary

Phase 32 builds the volunteer-facing phone banking calling experience inside the existing field mode layout. The backend is fully implemented -- session lifecycle (check-in/out), entry claiming via `SELECT FOR UPDATE SKIP LOCKED`, call recording with outcome-based entry transitions, survey recording, and DNC auto-flagging are all production-ready. The frontend has admin-side session management UI and existing React Query hooks (`useCheckIn`, `useCheckOut`, `useClaimEntry`, `useRecordCall`, `useSelfReleaseEntry`) ready to consume.

The work is primarily frontend: replace the placeholder `phone-banking.tsx` route with a full calling flow, generalize `OutcomeGrid` to accept configurable outcome definitions (currently hardcoded to `DoorKnockResultCode`), build a phone number display/dialing component, create a Zustand store for calling session state, and wire everything to existing API hooks. The canvassing wizard (`canvassing.tsx` + `useCanvassingWizard`) provides the exact architectural template.

**Primary recommendation:** Follow the canvassing wizard architecture exactly -- Zustand persist store for session state, orchestrator hook for flow logic, route component for layout/rendering. Generalize `OutcomeGrid` to accept generic outcome configs as props so both canvassing and phone banking use the same component.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Auto check-in: volunteer taps "Start Calling" on landing hub card, is automatically checked into the active session, and gets first batch of entries -- one tap to start
- One voter at a time: show a single voter card with phone numbers and outcome buttons. Batch claiming (5 entries) happens invisibly in the background
- Pre-fetch next batch when 2 entries remain to avoid loading gaps between voters
- Auto-advance to next voter after recording an outcome (same pattern as canvassing wizard)
- Skip button available: releases the entry back to AVAILABLE via `self_release_entry()` so another caller can pick it up
- Session end: both back arrow (with confirmation dialog "Done calling? Your progress is saved.") AND an explicit "End Session" button visible during calling
- End session triggers check-out + release of all claimed entries
- 8 outcomes from CallResultCode displayed in 2-column grid (same layout as canvassing)
- Color-coded matching canvassing pattern: green (Answered), yellow (No Answer, Busy, Voicemail), red (Refused, Deceased), grey (Wrong Number, Disconnected)
- Grid order: Answered, No Answer, Busy, Voicemail, Wrong Number, Refused, Deceased, Disconnected
- OutcomeGrid component generalized to accept generic outcome configs (codes, labels, colors) as props -- both canvassing and phone banking pass their own config
- Survey triggers on ANSWERED only -- all other outcomes skip survey and auto-advance
- InlineSurvey component reused as-is (already generic with campaignId, scriptId, voterId props)
- All phone numbers visible -- no hiding behind dropdowns. Each number shown with type label (Cell, Home, Work) and its own "Call" button
- Tap to call opens native dialer via `tel:` link using E.164 format (+15551234567)
- Display format is human-readable: (555) 123-4567
- Long-press on any phone number copies E.164 to clipboard with toast confirmation "Copied"
- Track which phone number was used: send `phone_number_used` with the outcome (backend already supports this via CallRecordCreate)
- Previously-tried numbers visually marked: strikethrough + "Wrong Number" for terminal numbers, "1 prior try" indicator for recyclable. Terminal numbers hide the Call button
- Reuse VoterCard component: show name, party badge, propensity score, age, and prior call attempt history ("2nd call -- last: No Answer, Mar 10")
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHONE-01 | Volunteer starts and stops a phone banking session with obvious controls | Auto check-in on "Start Calling"; back arrow + "End Session" button for stop; check-out + entry release on end. All backend endpoints exist. |
| PHONE-02 | Volunteer taps a phone number to initiate a call via native dialer (tel: link) | `tel:` link with E.164 format from `CallListEntry.phone_numbers[].value`. Phone numbers array already on claimed entries. |
| PHONE-03 | Volunteer records call outcome via large touch-target buttons after a call | Generalized OutcomeGrid with CallResultCode configs. `useRecordCall` hook exists. `CallRecordCreate` schema supports `phone_number_used`. |
| PHONE-04 | Volunteer can answer inline survey questions after a contact outcome (skippable) | InlineSurvey reused as-is. Survey triggers on ANSWERED only. `CallList.script_id` provides the survey script reference. |
| PHONE-05 | Volunteer sees session progress (calls completed / remaining) | FieldProgress component with `unit="calls"`. Track completed count locally in Zustand store + total from claimed batch. |
| PHONE-06 | Volunteer can copy a phone number to clipboard as fallback when tel: is unsupported | `navigator.clipboard.writeText()` on long-press. Sonner toast "Copied". |
| PHONE-07 | Phone numbers are formatted to E.164 for dialing and display-formatted for reading | Manual formatting function: E.164 stored in `phone_numbers[].value`, display format via simple regex `(XXX) XXX-XXXX`. |
| A11Y-05 | Phone banking caller info and outcome buttons are accessible without visual context | ARIA labels on phone number buttons, outcome buttons, progress; `aria-live` region for voter transitions; `role="status"` on progress. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | UI framework | Already in use |
| TanStack Router | latest | File-based routing | Already in use, route at `/field/$campaignId/phone-banking` |
| TanStack Query | latest | Server state | Already in use, hooks in `usePhoneBankSessions.ts` |
| Zustand | latest | Client state persistence | Already in use for canvassing store pattern |
| ky | latest | HTTP client | Already in use with auth interceptor |
| sonner | latest | Toast notifications | Already in use for copy feedback, session end |
| shadcn/ui | latest | UI components | Button, Card, Badge, Sheet, Progress, AlertDialog already in use |
| Tailwind CSS | v4 | Styling | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons | Phone, Check, SkipForward, Copy, etc. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual phone formatting | libphonenumber-js | Overkill for US numbers only; manual regex is 5 lines and already sufficient |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── routes/field/$campaignId/
│   └── phone-banking.tsx          # Replace placeholder with full calling flow
├── components/field/
│   ├── OutcomeGrid.tsx            # MODIFY: generalize to accept outcome config props
│   ├── PhoneNumberList.tsx        # NEW: phone numbers with call/copy buttons
│   ├── CallingVoterCard.tsx       # NEW: voter card variant for phone banking
│   └── CompletionSummary.tsx      # NEW: session completion with stats
├── stores/
│   └── callingStore.ts            # NEW: Zustand persist store for calling session
├── hooks/
│   └── useCallingSession.ts       # NEW: orchestrator hook (parallels useCanvassingWizard)
└── types/
    └── calling.ts                 # NEW: phone banking field mode types
```

### Pattern 1: Zustand Persist Store (from canvassingStore.ts)
**What:** Session state persisted to sessionStorage for phone interruption resilience
**When to use:** Track calling progress client-side across app switches
**Example:**
```typescript
// Mirrors canvassingStore.ts pattern exactly
interface CallingState {
  sessionId: string | null
  callListId: string | null
  entries: CallListEntry[]          // Current batch of claimed entries
  currentEntryIndex: number
  completedCalls: Record<string, string>  // entryId -> resultCode
  skippedEntries: string[]
  callStartedAt: string | null      // ISO timestamp when call initiated
  phoneNumberUsed: string | null    // E.164 of dialed number
  lastActiveAt: number

  // Actions
  startSession: (sessionId: string, callListId: string, entries: CallListEntry[]) => void
  addEntries: (entries: CallListEntry[]) => void
  recordOutcome: (entryId: string, resultCode: string) => void
  skipEntry: (entryId: string) => void
  advanceEntry: () => void
  setCallStarted: (phone: string) => void
  clearCallStarted: () => void
  reset: () => void
}
```

### Pattern 2: Orchestrator Hook (from useCanvassingWizard.ts)
**What:** Single hook that composes store + API mutations + derived state
**When to use:** Complex flow logic with multiple side effects
**Example:**
```typescript
// Parallels useCanvassingWizard exactly
export function useCallingSession(campaignId: string, sessionId: string) {
  // Compose: store state + useClaimEntry + useRecordCall + useSelfReleaseEntry + useCheckIn + useCheckOut
  // Return: currentEntry, progress, handleOutcome, handleSkip, handleEndSession, isComplete
}
```

### Pattern 3: OutcomeGrid Generalization
**What:** Extract hardcoded DoorKnockResultCode dependency to generic props
**When to use:** When the same visual pattern applies to different outcome domains
**Example:**
```typescript
// BEFORE (current):
interface OutcomeGridProps {
  onSelect: (result: DoorKnockResultCode) => void
  disabled?: boolean
}

// AFTER (generalized):
interface OutcomeConfig {
  code: string
  label: string
  color: { bg: string; text: string; border: string }
}

interface OutcomeGridProps<T extends string = string> {
  outcomes: OutcomeConfig[]
  onSelect: (code: T) => void
  disabled?: boolean
}
```

### Pattern 4: Phone Number Component with tel: + clipboard
**What:** List of phone numbers with Call button (tel: link) and long-press copy
**When to use:** Displaying callable phone numbers on mobile
**Example:**
```typescript
// tel: link for native dialer
<a href={`tel:${e164Number}`} className="min-h-11 min-w-11 ...">Call</a>

// Long-press to copy
const handleCopyPhone = async (e164: string) => {
  await navigator.clipboard.writeText(e164)
  toast("Copied")
}
```

### Anti-Patterns to Avoid
- **Embedding OutcomeGrid logic in route:** Extract to orchestrator hook like canvassing does. Route component handles layout only.
- **Polling session progress from backend:** For volunteer view, track progress locally in Zustand. Backend progress endpoint is for supervisor view (and requires manager role).
- **Calling claim endpoint on every voter advance:** Batch claim 5 entries upfront, pre-fetch next batch when 2 remain.
- **Using useState for session state:** Must use Zustand persist to survive phone app switching (requirement mirrors CANV-07).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Outcome grid UI | New button grid | Generalized OutcomeGrid component | Consistent with canvassing, already handles ARIA, touch targets |
| Survey after contact | New survey component | InlineSurvey as-is | Already generic (campaignId, scriptId, voterId props) |
| Progress bar | Custom progress | FieldProgress with unit="calls" | Already handles ARIA role="status", percentage calculation |
| Session state persistence | localStorage wrapper | Zustand persist + sessionStorage | Established pattern from canvassingStore.ts |
| API mutations | Raw fetch calls | Existing hooks in usePhoneBankSessions.ts | useCheckIn, useCheckOut, useClaimEntry, useRecordCall, useSelfReleaseEntry all exist |
| Confirmation dialog | Custom modal | shadcn AlertDialog | Already in project, handles accessibility |

**Key insight:** The backend and React Query hooks are 100% complete. This phase is purely frontend UI work building on established patterns.

## Common Pitfalls

### Pitfall 1: OutcomeGrid Breaking Canvassing
**What goes wrong:** Generalizing OutcomeGrid changes its interface, breaking canvassing.tsx
**Why it happens:** Canvassing imports OutcomeGrid directly with DoorKnockResultCode
**How to avoid:** Make the generalized interface backward-compatible. Canvassing passes its own outcome configs, or provide a wrapper. Update canvassing.tsx to pass CANVASSING_OUTCOMES config at the same time.
**Warning signs:** Canvassing route stops rendering outcome buttons

### Pitfall 2: CallListEntry Frontend Type Missing phone_attempts
**What goes wrong:** Cannot determine which phone numbers were previously tried
**Why it happens:** Frontend `CallListEntry` type in `web/src/types/call-list.ts` does NOT include `phone_attempts`, but backend `CallListEntryResponse` schema DOES return it
**How to avoid:** Add `phone_attempts: Record<string, { result: string; at: string }> | null` to the frontend `CallListEntry` type
**Warning signs:** Cannot render strikethrough/prior-try indicators on phone numbers

### Pitfall 3: Claim Endpoint Uses call_list_id, Not session_id
**What goes wrong:** Trying to claim entries via session endpoint that doesn't exist
**Why it happens:** `useClaimEntry` hook takes `callListId`, but `FieldMeResponse` returns `session_id` for phone banking
**How to avoid:** First fetch session detail to get `call_list_id`, then use it for claiming. Or use `PhoneBankSession.call_list_id` from `usePhoneBankSession(campaignId, sessionId)`.
**Warning signs:** 404 on claim endpoint

### Pitfall 4: call_started_at/call_ended_at Required by Backend
**What goes wrong:** Backend rejects call recording without timestamps
**Why it happens:** `CallRecordCreate` requires `call_started_at` and `call_ended_at` (datetime fields)
**How to avoid:** Record `callStartedAt` in Zustand store when user taps "Call", use current time as `call_ended_at` when outcome is recorded. For cases where volunteer doesn't tap Call first (direct outcome), use same timestamp for both.
**Warning signs:** 422 errors on call recording

### Pitfall 5: Progress Count Source Mismatch
**What goes wrong:** Progress shows wrong numbers because backend progress endpoint requires manager role
**Why it happens:** `GET /progress` endpoint uses `require_role("manager")`
**How to avoid:** Track progress locally in Zustand store (completedCalls count vs total entries in batch). For total, use `FieldMeResponse.phone_banking.total` from hub data.
**Warning signs:** 403 when volunteer tries to fetch progress

### Pitfall 6: tel: Link Behavior on Desktop
**What goes wrong:** tel: links do nothing or show confusing dialogs on desktop browsers
**Why it happens:** Desktop browsers may not have a registered tel: handler
**How to avoid:** This is field mode, designed for mobile. Accept desktop as degraded experience; the copy-to-clipboard fallback covers it.
**Warning signs:** Desktop testing shows broken tel: links (acceptable -- field mode is mobile-first)

## Code Examples

### Phone Number Formatting (E.164 to Display)
```typescript
// Simple US phone formatting -- no library needed
function formatPhoneDisplay(e164: string): string {
  // +15551234567 -> (555) 123-4567
  const digits = e164.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4)
    const prefix = digits.slice(4, 7)
    const line = digits.slice(7)
    return `(${area}) ${prefix}-${line}`
  }
  return e164 // fallback for non-US numbers
}
```

### Phone Number Status from phone_attempts
```typescript
interface PhoneAttempt {
  result: string
  at: string
}

function getPhoneStatus(
  phoneValue: string,
  phoneAttempts: Record<string, PhoneAttempt> | null,
): { isTerminal: boolean; priorTries: number; lastResult: string | null } {
  if (!phoneAttempts || !phoneAttempts[phoneValue]) {
    return { isTerminal: false, priorTries: 0, lastResult: null }
  }
  const attempt = phoneAttempts[phoneValue]
  const isTerminal = attempt.result === "wrong_number" || attempt.result === "disconnected"
  return { isTerminal, priorTries: 1, lastResult: attempt.result }
}
```

### Calling Outcome Color Config
```typescript
// Source: CONTEXT.md locked decisions
import type { CallResultCode } from "@/types/calling"

export type CallResultCode =
  | "answered" | "no_answer" | "busy" | "voicemail"
  | "wrong_number" | "refused" | "deceased" | "disconnected"

export const CALL_OUTCOME_ORDER: CallResultCode[] = [
  "answered", "no_answer", "busy", "voicemail",
  "wrong_number", "refused", "deceased", "disconnected",
]

export const CALL_OUTCOME_CONFIGS: OutcomeConfig[] = [
  { code: "answered",     label: "Answered",     color: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" } },
  { code: "no_answer",    label: "No Answer",    color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "busy",         label: "Busy",         color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "voicemail",    label: "Voicemail",    color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "wrong_number", label: "Wrong #",      color: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" } },
  { code: "refused",      label: "Refused",      color: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" } },
  { code: "deceased",     label: "Deceased",     color: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" } },
  { code: "disconnected", label: "Disconnected", color: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" } },
]
```

### Auto Check-in Flow
```typescript
// On "Start Calling" tap from hub:
// 1. Check in to session
const checkInMutation = useCheckIn(campaignId, sessionId)
// 2. Fetch session detail to get call_list_id
const sessionQuery = usePhoneBankSession(campaignId, sessionId)
// 3. Claim first batch of entries
const claimMutation = useClaimEntry(campaignId, callListId)
// 4. Initialize Zustand store with entries
store.startSession(sessionId, callListId, claimedEntries)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate outcome components per domain | Generalized OutcomeGrid with config props | Phase 32 | Single component serves canvassing + phone banking |
| DoorKnockResultCode hardcoded in OutcomeGrid | Generic OutcomeConfig interface | Phase 32 | Component becomes reusable across domains |

**Deprecated/outdated:**
- Nothing deprecated -- building new functionality on stable patterns

## Open Questions

1. **Session Detail Data for Volunteer**
   - What we know: `FieldMeResponse` returns `session_id` but not `call_list_id`. Session detail endpoint gives `call_list_id`.
   - What's unclear: Whether to fetch session detail on mount or embed `call_list_id` in `FieldMeResponse`
   - Recommendation: Fetch session detail on mount -- it's one extra query and avoids backend schema changes. Cache with React Query.

2. **VoterCard Reuse vs New Component**
   - What we know: Current VoterCard is tightly coupled to canvassing (imports OutcomeGrid, uses EnrichedWalkListEntry type)
   - What's unclear: Whether to modify VoterCard to be generic or create CallingVoterCard
   - Recommendation: Create `CallingVoterCard` as a separate component. VoterCard has canvassing-specific rendering (household context, skip/complete states). Phone banking needs phone numbers, call buttons, attempt history. Composition is cleaner than making one component do both.

3. **Script ID for Survey**
   - What we know: `CallList.script_id` links to survey script. Backend `CallListResponse` includes `script_id`.
   - What's unclear: Whether claim response includes script_id or we need separate call list detail fetch
   - Recommendation: Fetch call list detail (`GET /call-lists/{id}`) once when session starts to get `script_id`. Cache it -- it won't change during a session.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (latest) |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test e2e/phase32-verify.spec.ts --headed` |
| Full suite command | `cd web && npx playwright test e2e/` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHONE-01 | Start/stop session with obvious controls | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "start and stop" --headed` | No -- Wave 0 |
| PHONE-02 | Tap phone number to call via tel: link | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "tel link" --headed` | No -- Wave 0 |
| PHONE-03 | Record call outcome via touch-target buttons | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "outcome" --headed` | No -- Wave 0 |
| PHONE-04 | Answer inline survey after contact | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "survey" --headed` | No -- Wave 0 |
| PHONE-05 | See session progress | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "progress" --headed` | No -- Wave 0 |
| PHONE-06 | Copy phone number to clipboard | e2e (manual-only) | Manual: long-press verification on mobile device | N/A |
| PHONE-07 | Phone numbers E.164 for dialing, formatted for display | unit | `cd web && npx vitest run src/types/calling.test.ts` | No -- Wave 0 |
| A11Y-05 | Accessible without visual context | e2e | `cd web && npx playwright test e2e/phase32-verify.spec.ts -g "accessible" --headed` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test e2e/phase32-verify.spec.ts --headed`
- **Per wave merge:** `cd web && npx playwright test e2e/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/phase32-verify.spec.ts` -- covers PHONE-01 through PHONE-05, PHONE-07, A11Y-05
- [ ] `web/src/types/calling.test.ts` -- covers phone formatting utility (PHONE-07)
- [ ] `web/src/stores/callingStore.test.ts` -- covers store logic (mirrors canvassingStore.test.ts)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `app/services/phone_bank.py` -- full backend service implementation
- Codebase analysis: `app/api/v1/phone_banks.py` -- all API endpoints
- Codebase analysis: `web/src/hooks/usePhoneBankSessions.ts` -- all React Query hooks
- Codebase analysis: `app/models/call_list.py` -- CallResultCode enum, CallListEntry model with phone_attempts
- Codebase analysis: `web/src/components/field/OutcomeGrid.tsx` -- current implementation to generalize
- Codebase analysis: `web/src/stores/canvassingStore.ts` -- Zustand persist pattern to replicate
- Codebase analysis: `web/src/hooks/useCanvassingWizard.ts` -- orchestrator hook pattern to replicate
- Codebase analysis: `web/src/routes/field/$campaignId/canvassing.tsx` -- route layout pattern to replicate

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- user-locked implementation choices

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- exact parallel to completed canvassing wizard (Phase 31)
- Pitfalls: HIGH -- identified from direct codebase analysis of type mismatches and API role requirements
- Backend readiness: HIGH -- verified all endpoints exist with correct schemas

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependencies changing)
