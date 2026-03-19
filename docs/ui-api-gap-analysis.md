# CivicPulse Run API — UI vs API Gap Analysis Report

> **Date:** 2026-03-17
> **Purpose:** Identify what UI functionality is missing to fully cover all API capabilities
> **Not a plan** — this is an inventory and gap report only

---

## Summary

| Area | API Endpoints | UI Coverage | Status |
|------|:---:|:---:|:---:|
| Health | 2 | 0 | N/A (infra only) |
| Users / Me | 2 | 2 | COMPLETE |
| Campaigns (CRUD) | 5 | 5 | COMPLETE |
| Campaign Invites | 4 | 3 of 4 | NEAR-COMPLETE |
| Campaign Members | 4 | 4 | COMPLETE |
| Voter Imports | 6 | 6 | COMPLETE |
| Voters | 5 | 5 | COMPLETE |
| Voter Contacts | 11 | 11 | COMPLETE |
| Voter Interactions | 2 | 2 | COMPLETE |
| Voter Tags | 5 | 5 | COMPLETE |
| Voter Lists | 8 | 8 | COMPLETE |
| Surveys | 11 | 11 | COMPLETE |
| Turfs | 5 | 5 | COMPLETE |
| Walk Lists | 10 | 10 | COMPLETE |
| Call Lists | 6 | 6 | COMPLETE |
| DNC (Do Not Call) | 5 | 4 of 5 | NEAR-COMPLETE |
| Phone Banking | 12 | 12 | COMPLETE |
| Volunteers | 14 | 14 | COMPLETE |
| Shifts | 14 | 14 | COMPLETE |
| Dashboard | 1 | 1 | COMPLETE |
| Field UI (volunteer-facing) | 1 | 1 | COMPLETE |

**Bottom line:** ~150 API endpoints exist. The UI has full coverage for the vast majority. Only a handful of minor gaps remain (see below).

---

## What's Been Built Since Last Audit (2026-03-10)

The following areas were previously marked MISSING or MOSTLY MISSING and are now fully or nearly fully implemented:

### Campaign Settings (was PARTIAL → COMPLETE)
- `settings/general.tsx` — Edit campaign name/description (PATCH)
- `settings/members.tsx` — Member list, role changes, removal; invite creation, pending list, revoke
- `settings/danger.tsx` — Delete campaign, transfer ownership

### Campaign Members & Invites (was MISSING → COMPLETE / NEAR-COMPLETE)
- Members UI integrated into `settings/members.tsx` with full CRUD
- Invites UI integrated into `settings/members.tsx` — create, list, revoke
- **Remaining gap:** No standalone invite acceptance page (`POST /invites/{token}/accept`) — likely handled via email link redirect

### Voter Imports (was MISSING → COMPLETE)
- Full import wizard at `voters/imports/new.tsx`: DropZone upload, ColumnMappingTable, MappingPreview, ImportProgress
- Import history list at `voters/imports/index.tsx`

### Voter Management Completion (was PARTIAL → COMPLETE)
- `VoterEditSheet.tsx` — Edit voter form
- `AddVotersDialog.tsx` — Create voter dialog
- `ContactsTab.tsx` — Contact management (phones, emails, addresses) with add/edit/delete/set-primary
- `TagsTab.tsx` — Tag management in voter detail
- `HistoryTab.tsx` — Interaction timeline with add-note capability
- `VoterFilterBuilder.tsx` — Advanced search/filter builder
- `voters/lists/index.tsx` + `voters/lists/$listId.tsx` — Voter list CRUD with detail/member management
- `voters/tags/index.tsx` — Campaign-level voter tag management

### Call Lists (was MISSING → COMPLETE)
- `phone-banking/call-lists/index.tsx` — Call list CRUD with create/edit/delete
- `phone-banking/call-lists/$callListId.tsx` — Call list detail view

### DNC (was MISSING → NEAR-COMPLETE)
- `phone-banking/dnc/index.tsx` — DNC list with add single, bulk import, delete
- **Remaining gap:** No dedicated `POST /dnc/check` UI (phone check) — may be handled inline during phone banking

### Phone Banking (was MOSTLY MISSING → COMPLETE)

**Admin UI:**
- `phone-banking/sessions/index.tsx` — Session CRUD (create, list, status updates, delete)
- `phone-banking/sessions/$sessionId/index.tsx` — Session detail with caller management
- `phone-banking/sessions/$sessionId/call.tsx` — Call view
- `phone-banking/my-sessions/index.tsx` — Volunteer's own sessions

**Field UI (volunteer-facing):**
- `field/$campaignId/phone-banking.tsx` — Full calling workflow: check-in, batch claim, tap-to-call, outcome recording, check-out
- `useCallingSession.ts` — Session lifecycle, prefetch, auto-advance, offline queue integration
- `CallingVoterCard.tsx`, `PhoneNumberList.tsx`, `OutcomeGrid.tsx`, `CompletionSummary.tsx`

### Volunteers (was MOSTLY MISSING → COMPLETE)

**Admin UI:**
- `volunteers/index.tsx` — Volunteer list with filters (status, skills, name)
- `volunteers/$volunteerId/index.tsx` — Volunteer detail with tabs (profile, availability, hours, tags)
- `volunteers/register/index.tsx` — Self-registration flow
- `volunteers/roster/index.tsx` — Roster view with status management
- `volunteers/tags/index.tsx` — Volunteer tag CRUD
- Hooks: `useVolunteers`, `useVolunteerAvailability`, `useVolunteerHours`, `useVolunteerTags`

**Field UI (volunteer-facing):**
- `field/$campaignId/index.tsx` — Volunteer landing hub with assignment cards, pull-to-refresh
- `useFieldMe.ts` — Single API call hydration for volunteer assignments

### Shifts (was MOSTLY MISSING → COMPLETE)
- `volunteers/shifts/index.tsx` — Shift list with type/status filters, date grouping
- `volunteers/shifts/$shiftId/index.tsx` — Shift detail with volunteer roster
- `ShiftDialog.tsx` — Create/edit shift form
- `ShiftCard.tsx` — Shift display card
- `AssignVolunteerDialog.tsx` — Manager volunteer assignment
- `AdjustHoursDialog.tsx` — Hours adjustment dialog
- `useShifts.ts` — Full hook coverage: list, create, update, delete, status, signup, assign, remove, check-in, check-out, hours

### Field UI — Dedicated Volunteer Experience (NEW)

A complete mobile-first interface at `/field/{campaignId}` with its own layout shell:

- **Hub:** Personalized greeting, assignment cards with progress, pull-to-refresh
- **Canvassing wizard:** Door-to-door workflow with household grouping, inline surveys, address progression (`useCanvassingWizard.ts`)
- **Phone banking:** Tap-to-call with outcome recording, batch claiming, DNC compliance (`useCallingSession.ts`)
- **Offline queue + sync:** localStorage-backed queue, automatic retry, conflict handling (`useSyncEngine.ts`, `offlineQueueStore.ts`)
- **Guided onboarding tour:** driver.js integration with segment-based progress tracking (`useTour.ts`, `tourStore.ts`)

---

## Remaining Gaps

### Minor Gaps (low priority)

| Area | Gap | Notes |
|------|-----|-------|
| Campaign Invites | No standalone invite acceptance page | `POST /invites/{token}/accept` — likely handled via email link + redirect |
| DNC | No dedicated phone check UI | `POST /dnc/check` — may be handled inline during phone banking workflow |

### Potential Enhancements (not gaps — no API exists yet)

These are UX improvements that could be added but don't correspond to missing API coverage:

- Volunteer availability calendar view (hooks exist, no calendar widget)
- Bulk volunteer operations (bulk status change, bulk tag assignment)
- Phone banking real-time progress dashboard (WebSocket)
- Shift calendar/timeline view (currently card-based list)

---

## Coverage by Completion Status

### FULLY IMPLEMENTED (UI pages + hooks + types)
- Users/Me (2/2)
- Campaigns CRUD (5/5)
- Campaign Members (4/4)
- Voter Imports (6/6)
- Voters (5/5)
- Voter Contacts (11/11)
- Voter Interactions (2/2)
- Voter Tags (5/5)
- Voter Lists (8/8)
- Surveys (11/11)
- Turfs (5/5)
- Walk Lists (10/10)
- Call Lists (6/6)
- Phone Banking (12/12)
- Volunteers (14/14)
- Shifts (14/14)
- Dashboard (1/1)
- Field UI (1/1)

### NEAR-COMPLETE (1-2 minor gaps)
- Campaign Invites (3/4 — missing invite accept page)
- DNC (4/5 — missing standalone phone check)
