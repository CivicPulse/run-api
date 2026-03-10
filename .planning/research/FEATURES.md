# Feature Research — v1.2 Full UI

**Domain:** Campaign management UI — covering all uncovered API endpoints
**Researched:** 2026-03-10
**Confidence:** HIGH (based on gap analysis, competitor patterns, existing codebase)

## Feature Landscape

### Table Stakes (Users Expect These)

UI patterns campaign staff and volunteers assume exist in any modern campaign management tool.

#### Voter Import Wizard

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Drag-and-drop file upload | Every modern SaaS import flow uses this (NGPVAN, NationBuilder, Salesforce) | LOW | react-dropzone; accept CSV only; show file size/name preview |
| Column mapping with auto-suggestions | NGPVAN and Solidarity Tech auto-map columns; manual mapping for 50+ fields is unusable | HIGH | @dnd-kit for drag-and-drop mapping; PapaParse for client-side CSV preview; show first 3 rows as preview |
| Import preview before confirmation | Users need to verify data looks right before committing thousands of records | MEDIUM | Show mapped field summary + sample rows; highlight unmapped/skipped columns |
| Import progress tracking | Large files (100K+ voters) take time; users need feedback | LOW | Poll import job status endpoint; shadcn Progress bar; show rows imported/total |
| Import history | Campaign managers need to see past imports, check for errors | LOW | Simple table with date, file name, row count, status, error count |

#### Campaign Team Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Invite members by email | Every collaboration tool has invite flows | LOW | Dialog with email + role select; generate invite link; copy-to-clipboard |
| Pending invites list with revoke | Standard for team management (Slack, GitHub, Linear) | LOW | Table with invite status, date, role, revoke button |
| Member list with role badges | See who's on the campaign and their access level | LOW | Table with avatar, name, email, role badge, actions dropdown |
| Role change dialog | Promote/demote members (manager → admin, etc.) | LOW | Select dropdown in member row; confirmation dialog for destructive changes |
| Remove member | Remove access from a campaign | LOW | Confirmation dialog with warning about data access loss |
| Ownership transfer | Transfer campaign to another admin | LOW | Dialog with member select; double-confirmation required |

#### Voter Management Completion

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Contact management in voter detail | Every CRM shows phone/email/address inline (HubSpot, Salesforce) | MEDIUM | Tab or section in voter detail; add/edit/delete for each type; set primary toggle |
| Voter create/edit forms | NGPVAN and NationBuilder allow manual voter entry and editing | MEDIUM | Full form with demographics, address, contact info; reuse for create and edit |
| Tag management | Campaign-level tags with add/remove on voter detail | LOW | Tag chips with add popover; campaign tag management page |
| Voter lists page | Static and dynamic list management (NGPVAN "My Voters" lists) | MEDIUM | List of lists with type badge, count, date; detail page showing members; dynamic list filter builder |
| Advanced search UI | Filter builder for complex voter queries (party + precinct + vote history) | MEDIUM | Composable filter chips or form; save as dynamic list option |
| Add interaction note | Quick note entry on voter detail page | LOW | Dialog with note type select + free text; appears in timeline |

#### Phone Banking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Session create/manage | NGPVAN VPB allows creating phone bank sessions with parameters | MEDIUM | Form with name, call list, survey, date range; status transitions (draft → active → complete) |
| Caller assignment | Assign callers to sessions; self-assignment option | LOW | Member picker dialog; show assigned callers list |
| Active calling screen | The core phone banking UX — NGPVAN OpenVPB shows voter info + script + outcome buttons | HIGH | Full-screen focused view; auto-claim next entry; show voter details + contact info + survey questions; quick outcome buttons; skip/release |
| Session progress dashboard | Real-time view of calls made, outcomes, completion % | MEDIUM | Stats cards + outcome breakdown chart; per-caller stats table |
| Check-in/check-out | Track when callers start and finish calling | LOW | Button toggle; auto-tracks hours |

#### Volunteer Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Volunteer detail page | See profile, skills, availability, activity history | MEDIUM | Tabbed detail view with info, availability, shifts, hours |
| Create/edit volunteer | Register new volunteers or update existing | LOW | Form with name, contact, skills checkboxes, status |
| Self-registration flow | Volunteers sign up themselves (Mobilize, SignUpGenius pattern) | LOW | Public-facing form; creates volunteer record linked to user |
| Availability management | Set recurring availability (days/times) | MEDIUM | Weekly grid or slot picker; stored as availability records |
| Volunteer tags | Tag volunteers with skills/interests | LOW | Same tag pattern as voters; campaign-level volunteer tags |
| Hours tracking view | See total hours, shift history, manual adjustments | LOW | Table with shift name, check-in/out times, total hours; summary stats |

#### Shift Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Shift CRUD | Create shifts with date, time, location, capacity, type | MEDIUM | Form with datetime pickers, location, capacity limit, activity type |
| Shift list/calendar view | See upcoming shifts; filter by type/date | MEDIUM | Table view with date grouping; shadcn calendar for date nav |
| Volunteer signup flow | Volunteers sign up for available shifts (Mobilize pattern) | LOW | "Sign Up" button on shift card; capacity counter; waitlist when full |
| Manager assignment | Assign specific volunteers to shifts | LOW | Member picker dialog |
| Check-in/check-out | Track attendance at shifts | LOW | Button per volunteer in shift roster; timestamp capture |
| Shift roster view | See who's signed up, checked in, hours worked | LOW | Table in shift detail with volunteer name, status, times |
| Hours adjustment | Manager adjusts hours after the fact | LOW | Edit dialog with original/adjusted times; reason field |

#### Call Lists & DNC

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Call list CRUD | Create call lists from voter universe with DNC filtering | MEDIUM | Form with voter list/filter selection; auto-DNC exclusion; show entry count |
| Call list detail | View entries, claimed/completed status, stats | MEDIUM | Table with voter name, phone, status, assigned caller |
| DNC list management | View and manage do-not-call numbers | LOW | Table with phone, reason, date added; search/filter |
| DNC single add | Add individual number to DNC | LOW | Dialog with phone input + reason |
| DNC bulk import | Upload list of DNC numbers | LOW | File upload + confirmation; show count added |
| DNC check | Check if a phone number is on DNC list | LOW | Search input with instant result |

#### Campaign Settings

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Edit campaign details | Update name, description, election date | LOW | Settings form with current values pre-filled |
| Delete campaign | Remove campaign with all data | LOW | Danger zone with confirmation; type campaign name to confirm |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Permission-gated UI | Show/hide actions based on campaign role; most small campaign tools don't have granular permissions | MEDIUM | `usePermission` hook + `<CanDo>` component; clean degradation for read-only roles |
| Integrated cross-domain UI | Voter detail shows canvassing + phone banking + volunteer activity in one place; competitors silo these | LOW | Already have interaction timeline; extend with shift history, call history tabs |
| Keyboard-driven calling screen | Phone bankers make 100+ calls/session; keyboard shortcuts for outcomes save significant time | LOW | Hotkeys for common outcomes (1=answered, 2=no answer, etc.); focus management |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Google Calendar-style shift view | Looks professional and familiar | Massive complexity; shift management is CRUD + list, not a calendar app | Date-grouped list view + date picker navigation |
| Real-time collaborative editing | Google Docs-style concurrent editing of voter records | Requires CRDT/OT infrastructure; voter records are not documents | Last-write-wins with optimistic updates; conflict detection on save |
| Predictive dialer integration | High call volume campaigns want auto-dial | Requires telephony infrastructure (Twilio, TCPA compliance) | Manual dial with click-to-copy phone number; integrate dedicated dialer services |
| Drag-and-drop shift scheduling | Drag volunteers between shifts like a Gantt chart | Complex DnD with multi-day ranges; overkill for typical campaign shifts | Assign dialog with volunteer picker per shift |

## Feature Dependencies (UI-specific)

```
[Shared Infrastructure: permission system, DataTable, form patterns]
    |
    |-- required by --> [All CRUD pages]
    |
[Campaign Settings + Members + Invites]
    |
    |-- required by --> [Role-gated UI across all pages]
    |
[Voter Management: contacts, tags, lists, create/edit, search]
    |
    |-- required by --> [Import wizard (needs voter model context)]
    |-- required by --> [Call list creation (needs voter filters)]
    |-- required by --> [Phone banking calling screen (needs voter detail)]
    |
[Call Lists + DNC]
    |
    |-- required by --> [Phone banking sessions (needs call list to operate)]
    |
[Volunteer Management]
    |
    |-- required by --> [Shift Management (shifts reference volunteers)]
```

## Feature Prioritization Matrix

| Feature Area | User Impact | Build Complexity | Priority |
|-------------|------------|-----------------|----------|
| Voter Imports | CRITICAL | HIGH | P1 — can't use the app without data |
| Campaign Members & Invites | HIGH | LOW | P1 — can't collaborate |
| Voter Management completion | HIGH | MEDIUM | P1 — core CRM functionality |
| Call Lists & DNC | HIGH | LOW | P2 — prerequisite for phone banking |
| Phone Banking | HIGH | HIGH | P2 — major feature area |
| Volunteer Management | MEDIUM | MEDIUM | P2 — important but less urgent |
| Shift Management | MEDIUM | MEDIUM | P2 — depends on volunteers |
| Campaign Settings | LOW | LOW | P3 — nice to have |

---
*Feature research for: CivicPulse Run v1.2 Full UI*
*Researched: 2026-03-10*
