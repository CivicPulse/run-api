# CivicPulse Run API — UI vs API Gap Analysis Report

> **Date:** 2026-03-10
> **Purpose:** Identify what UI functionality is missing to fully cover all API capabilities
> **Not a plan** — this is an inventory and gap report only

---

## Summary

| Area | API Endpoints | UI Coverage | Status |
|------|:---:|:---:|:---:|
| Health | 2 | 0 | N/A (infra only) |
| Users / Me | 2 | 2 | COMPLETE |
| Campaigns (CRUD) | 5 | 2 of 5 | PARTIAL |
| Campaign Invites | 4 | 0 | MISSING |
| Campaign Members | 4 | 0 | MISSING |
| Voter Imports | 6 | 0 | MISSING |
| Voters | 5 | 4 of 5 | NEAR-COMPLETE |
| Voter Contacts | 11 | 11 | HOOKS ONLY (no UI pages) |
| Voter Interactions | 2 | 2 | HOOKS ONLY (read in detail page) |
| Voter Tags | 5 | 5 | HOOKS ONLY (no UI pages) |
| Voter Lists | 8 | 8 | HOOKS ONLY (no UI pages) |
| Surveys | 11 | 11 | COMPLETE |
| Turfs | 5 | 5 | COMPLETE |
| Walk Lists | 10 | 10 | COMPLETE |
| Call Lists | 6 | 0 | MISSING |
| DNC (Do Not Call) | 5 | 0 | MISSING |
| Phone Banking | 12 | 1 (read-only list) | MOSTLY MISSING |
| Volunteers | 14 | 1 (read-only list) | MOSTLY MISSING |
| Shifts | 14 | 1 (read-only list) | MOSTLY MISSING |
| Dashboard | 1 | 1 | COMPLETE |

**Bottom line:** ~150 API endpoints exist. The UI has full page coverage for ~55 of them. Another ~35 have hooks/types but no UI pages. ~60 endpoints have zero UI coverage.

---

## Detailed Gap Analysis by Module

### 1. Campaigns (5 endpoints)

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| POST /campaigns | HAS UI | `campaigns/new.tsx` — create form |
| GET /campaigns | HAS UI | `index.tsx` — campaign list |
| GET /campaigns/{id} | HAS UI | `$campaignId.tsx` — layout wrapper |
| PATCH /campaigns/{id} | MISSING | No edit campaign page/dialog |
| DELETE /campaigns/{id} | MISSING | No delete campaign button |

**Gap:** Campaign settings/edit page and delete functionality.

---

### 2. Campaign Invites (4 endpoints) — ENTIRELY MISSING

| Endpoint | UI Status |
|----------|-----------|
| POST /campaigns/{id}/invites | MISSING |
| GET /campaigns/{id}/invites | MISSING |
| DELETE /campaigns/{id}/invites/{invite_id} | MISSING |
| POST /invites/{token}/accept | MISSING |

**Gap:** No invite management UI at all. Need: invite creation dialog, pending invites list, revoke button, and an invite acceptance page/flow.

---

### 3. Campaign Members (4 endpoints) — ENTIRELY MISSING

| Endpoint | UI Status |
|----------|-----------|
| GET /campaigns/{id}/members | MISSING |
| PATCH /campaigns/{id}/members/{user_id}/role | MISSING |
| DELETE /campaigns/{id}/members/{user_id} | MISSING |
| POST /campaigns/{id}/transfer-ownership | MISSING |

**Gap:** No member management UI. Need: members list page, role change dialog, remove member button, ownership transfer dialog.

---

### 4. Voter Imports (6 endpoints) — ENTIRELY MISSING

| Endpoint | UI Status |
|----------|-----------|
| POST /campaigns/{id}/imports | MISSING |
| POST /campaigns/{id}/imports/{import_id}/detect | MISSING |
| POST /campaigns/{id}/imports/{import_id}/confirm | MISSING |
| GET /campaigns/{id}/imports/{import_id} | MISSING |
| GET /campaigns/{id}/imports | MISSING |
| GET /campaigns/{id}/imports/templates | MISSING |

**Gap:** No voter import wizard. This is a critical workflow — need: file upload UI, column detection/mapping step, confirmation step, progress polling, and import history list.

---

### 5. Voters (5 endpoints)

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| GET /campaigns/{id}/voters | HAS UI | Voter list with infinite scroll + filters |
| POST /campaigns/{id}/voters/search | HAS HOOK | `useSearchVoters` exists but no advanced search UI |
| GET /campaigns/{id}/voters/{voter_id} | HAS UI | Voter detail page |
| POST /campaigns/{id}/voters | HAS HOOK | `useCreateVoter` hook exists, no create form UI |
| PATCH /campaigns/{id}/voters/{voter_id} | HAS HOOK | `useUpdateVoter` hook exists, no edit form UI |

**Gap:** VoterForm component for create/edit. Advanced search UI page.

---

### 6. Voter Contacts (11 endpoints) — HOOKS ONLY, NO UI PAGES

All 11 endpoints have hooks in `useVoterContacts.ts` (phones, emails, addresses — CRUD + set-primary). Types exist in `voter-contact.ts`.

**Gap:** No contact management UI in the voter detail page. Need: contacts tab with add/edit/delete for each contact type, primary contact toggle.

---

### 7. Voter Tags (5 endpoints) — HOOKS ONLY, NO UI PAGES

All 5 endpoints have hooks in `useVoterTags.ts`. Types in `voter-tag.ts`.

**Gap:** No tag management UI. Need: tags tab in voter detail, campaign tag management, add/remove tag from voter.

---

### 8. Voter Lists (8 endpoints) — HOOKS ONLY, NO UI PAGES

All 8 endpoints have hooks in `useVoterLists.ts`. Types in `voter-list.ts`.

**Gap:** No voter lists UI. Need: voter lists page, create/edit list forms, list detail page with member management, dynamic list filter builder.

---

### 9. Voter Interactions (2 endpoints) — PARTIAL

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| GET .../interactions | HAS UI | Timeline on voter detail page |
| POST .../interactions | HAS HOOK | `useCreateInteraction` exists, no UI to create notes |

**Gap:** "Add note/interaction" button/dialog on voter detail page.

---

### 10. Call Lists (6 endpoints) — ENTIRELY MISSING

| Endpoint | UI Status |
|----------|-----------|
| POST /campaigns/{id}/call-lists | MISSING |
| GET /campaigns/{id}/call-lists | PARTIAL (read-only in phone-banking.tsx) |
| GET /campaigns/{id}/call-lists/{id} | MISSING |
| PATCH /campaigns/{id}/call-lists/{id} | MISSING |
| DELETE /campaigns/{id}/call-lists/{id} | MISSING |
| POST /campaigns/{id}/call-lists/{id}/claim | MISSING |

**Gap:** Call list management pages — create, detail view, status transitions, delete, claim entries for calling.

---

### 11. DNC — Do Not Call (5 endpoints) — ENTIRELY MISSING

| Endpoint | UI Status |
|----------|-----------|
| GET /campaigns/{id}/dnc | MISSING |
| POST /campaigns/{id}/dnc | MISSING |
| POST /campaigns/{id}/dnc/import | MISSING |
| DELETE /campaigns/{id}/dnc/{id} | MISSING |
| POST /campaigns/{id}/dnc/check | MISSING |

**Gap:** Full DNC management page — list, add single, bulk import, delete, check phone.

---

### 12. Phone Banking (12 endpoints) — MOSTLY MISSING

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| GET .../phone-bank-sessions | HAS UI | Read-only cards on phone-banking.tsx |
| GET .../phone-bank-sessions/{id} | MISSING | No session detail page |
| POST .../phone-bank-sessions | MISSING | No create session form |
| PATCH .../phone-bank-sessions/{id} | MISSING | No edit/status update |
| POST .../callers | MISSING | No caller assignment UI |
| DELETE .../callers/{user_id} | MISSING | No caller removal |
| POST .../check-in | MISSING | No check-in flow |
| POST .../check-out | MISSING | No check-out flow |
| POST .../calls | MISSING | No call recording UI |
| GET .../progress | MISSING | No progress dashboard |
| POST .../entries/{id}/reassign | MISSING | No entry reassignment |
| POST .../entries/{id}/release | MISSING | No entry release |

**Gap:** Nearly the entire phone banking workflow is missing. Need: session CRUD, caller management, check-in/out flow, call recording screen (the core "calling" experience), progress tracking, entry management.

---

### 13. Volunteers (14 endpoints) — MOSTLY MISSING

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| GET .../volunteers | HAS UI | Read-only table on volunteers.tsx |
| GET .../volunteers/{id} | MISSING | No volunteer detail page |
| POST .../volunteers | MISSING | No create volunteer form |
| POST .../volunteers/register | MISSING | No self-registration flow |
| PATCH .../volunteers/{id} | MISSING | No edit volunteer |
| PATCH .../volunteers/{id}/status | MISSING | No status update |
| POST .../availability | MISSING | No availability management |
| DELETE .../availability/{id} | MISSING | No availability management |
| GET .../availability | MISSING | No availability view |
| POST .../volunteer-tags | MISSING | No volunteer tag CRUD |
| GET .../volunteer-tags | MISSING | No volunteer tag list |
| POST .../volunteers/{id}/tags/{id} | MISSING | No tag assignment |
| DELETE .../volunteers/{id}/tags/{id} | MISSING | No tag removal |
| GET .../volunteers/{id}/hours | MISSING | No hours tracking view |

**Gap:** Volunteer management is almost entirely unbuilt. Need: volunteer detail page, create/edit forms, self-registration, availability calendar, volunteer tags, hours tracking.

---

### 14. Shifts (14 endpoints) — MOSTLY MISSING

| Endpoint | UI Status | Notes |
|----------|-----------|-------|
| GET .../shifts | HAS UI | Read-only table on volunteers.tsx |
| GET .../shifts/{id} | MISSING | No shift detail page |
| POST .../shifts | MISSING | No create shift form |
| PATCH .../shifts/{id} | MISSING | No edit shift |
| PATCH .../shifts/{id}/status | MISSING | No status transitions |
| DELETE .../shifts/{id} | MISSING | No delete shift |
| POST .../shifts/{id}/signup | MISSING | No volunteer self-signup |
| POST .../shifts/{id}/assign/{volunteer_id} | MISSING | No manager assignment |
| DELETE .../shifts/{id}/signup | MISSING | No cancel signup |
| DELETE .../shifts/{id}/volunteers/{id} | MISSING | No remove volunteer |
| POST .../check-in/{volunteer_id} | MISSING | No check-in flow |
| POST .../check-out/{volunteer_id} | MISSING | No check-out flow |
| PATCH .../volunteers/{id}/hours | MISSING | No hours adjustment |
| GET .../shifts/{id}/volunteers | MISSING | No shift roster view |

**Gap:** Shift management is almost entirely unbuilt. Need: shift CRUD, signup/assignment flows, check-in/out, hours adjustment, shift detail with volunteer roster.

---

## Coverage by Completion Status

### FULLY IMPLEMENTED (UI pages + hooks + types)
- Surveys (11/11 endpoints)
- Turfs (5/5 endpoints)
- Walk Lists (10/10 endpoints)
- Dashboard (1/1 endpoint)
- Users/Me (2/2 endpoints)

### HOOKS/TYPES EXIST, UI PAGES MISSING
- Voter Contacts (11 endpoints) — needs UI in voter detail
- Voter Tags (5 endpoints) — needs UI in voter detail
- Voter Lists (8 endpoints) — needs dedicated pages
- Voters create/edit (2 endpoints) — needs VoterForm
- Voter advanced search (1 endpoint) — needs search UI
- Voter interactions create (1 endpoint) — needs add-note dialog

### NOTHING EXISTS (no hooks, no types, no UI)
- Campaign Invites (4 endpoints)
- Campaign Members (4 endpoints)
- Voter Imports (6 endpoints)
- Call Lists (6 endpoints)
- DNC (5 endpoints)
- Phone Banking session management (11 endpoints)
- Volunteers management (13 endpoints)
- Shifts management (13 endpoints)
- Campaign edit/delete (2 endpoints)

---

## Priority Ranking (by user impact)

1. **Voter Imports** — Can't get voter data into the system without this
2. **Campaign Members & Invites** — Can't collaborate on campaigns
3. **Voter Management completion** (contacts, tags, lists, create/edit, search) — Core voter data is partially built
4. **Phone Banking** — Major feature area, only has read-only list
5. **Volunteers** — Major feature area, only has read-only list
6. **Shifts** — Major feature area, only has read-only list
7. **Call Lists & DNC** — Required for phone banking to work
8. **Campaign edit/delete** — Settings page needed
