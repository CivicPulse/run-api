# Project Research Summary

**Project:** CivicPulse Run — v1.2 Full UI
**Domain:** Political campaign management SPA — frontend UI coverage of ~95 API endpoints
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

CivicPulse Run v1.2 is a frontend completion milestone: the backend API is fully implemented across ~150 endpoints, but only ~55 have corresponding UI pages. This is not a greenfield project — it is a structured buildout against an existing, validated stack (React 19, TanStack Router/Query/Table, shadcn/ui, zustand, react-hook-form + zod). Research confirms the existing stack is the right foundation and requires only 6 targeted additions: PapaParse (CSV preview), react-dropzone (file upload UX), and the @dnd-kit family (column mapping drag-and-drop). The recommended approach is phased CRUD buildout starting with shared infrastructure, then progressing through voter management, imports, call lists, phone banking, and finally volunteer and shift management — each phase unlocking the next via natural data dependencies.

The highest-complexity feature is the voter import wizard, which requires 4 UI steps, direct-to-S3 file upload with progress tracking, server-side column detection, and async polling. The highest-stakes real-time feature is the phone banking calling screen, where claim management race conditions between concurrent callers can produce duplicate calls or lost outcomes. Both features have well-documented pitfalls with clear avoidance strategies. The key risk across the entire milestone is failing to establish shared infrastructure (query key factory, permission system, form guard hook) before building domain pages — retrofitting these across 20+ hook files and 25+ routes is the primary technical debt trap for a project of this scope.

The architecture research is grounded in direct codebase analysis (not inference) and produces a concrete dependency-ordered build plan with 7 phases. All phase ordering is derived from feature dependency chains, not arbitrary scheduling. The research confirms no major architectural pivots are needed: the existing patterns (file-based routes, entity-first query keys, react-hook-form + zod per domain) scale cleanly to the new feature areas.

## Key Findings

### Recommended Stack

The existing stack handles all v1.2 requirements without major additions. Only 6 new npm packages are needed (papaparse, @types/papaparse, react-dropzone, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities). Additionally, 12 shadcn/ui components are added via CLI (no extra npm dependencies). The guiding principle is "use what is already installed" — TanStack Table for data grids, zustand for complex ephemeral state (import wizard), TanStack Query refetchInterval for import and session progress polling, and Intl.DateTimeFormat for date formatting. Explicit research confirmed that socket.io, react-big-calendar, AG Grid, date-fns, and multi-step wizard libraries should all be excluded.

**Core technology additions:**
- **papaparse ^5.5.3:** Client-side CSV preview (first 100 rows) in the import wizard — zero dependencies, 12M+ weekly downloads, Web Worker streaming for 500MB+ voter files
- **react-dropzone ^15.0.0:** File drop zone for import wizard step 1 — handles browser drag event edge cases, accessible, React 19 compatible
- **@dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0 + @dnd-kit/utilities ^3.2.2:** Column mapping drag-and-drop in import wizard step 2 and availability slot reordering — stable API (vs. @dnd-kit/react v0.3.2 which is pre-1.0)
- **shadcn/ui CLI additions:** progress, checkbox, switch, scroll-area, calendar, date-picker, breadcrumb, pagination, toggle, toggle-group, collapsible, spinner — all Radix-based, React 19 compatible

**Critical exclusions with rationale:**
- No socket.io or WebSocket: TanStack Query refetchInterval handles import and session progress; backend has no SSE or WebSocket endpoints
- No react-big-calendar: shift management is CRUD plus a list, not a Google Calendar grid
- No ky for S3 upload: ky lacks onUploadProgress; use XMLHttpRequest for the S3 PUT specifically
- No redux: zustand is installed and used; mixing stores creates confusion
- No date-fns: Intl.DateTimeFormat handles display; date-fns-tz added only in Phase 7 for timezone-aware shift scheduling

### Expected Features

Research analyzed campaign management conventions from NGPVAN, NationBuilder, Solidarity Tech, and Mobilize to establish what campaign staff and volunteers take for granted.

**Must have (table stakes):**
- Voter import wizard with drag-and-drop file upload, auto-column-detection suggestions, mapping UI, and progress tracking — no campaign tool is usable without data ingestion
- Campaign member management (invite by email, pending invites, role badges, role change, remove, ownership transfer) — team collaboration is expected
- Voter contact management (contacts tab, add/edit/delete, primary toggle), voter create/edit forms, tag management, and voter lists (static + dynamic) — these complete the CRM core
- Call list CRUD plus DNC list management — required prerequisite before phone banking sessions operate
- Phone bank session CRUD plus active calling experience with voter card, survey script, and outcome buttons — NGPVAN VPB is the benchmark; callers make 100+ calls per session
- Volunteer CRUD with availability management plus shift CRUD with roster, check-in, and check-out — standard field organizing tooling

**Should have (differentiators for v1.2):**
- Permission-gated UI via usePermission hook and CanDo component with graceful read-only degradation — most small campaign tools lack granular role gating
- Integrated voter timeline showing canvassing, phone banking, and volunteer activity — competitors silo these views
- Keyboard shortcuts on the calling screen — callers making 100+ calls per session gain significant time savings

**Defer to v2+:**
- Google Calendar-style shift grid view (massive complexity for a CRUD list problem)
- Real-time collaborative voter editing (requires CRDT or OT infrastructure)
- Predictive dialer integration (requires Twilio and TCPA compliance)
- Drag-and-drop Gantt shift scheduling (overkill for typical campaign shift assignment)

### Architecture Approach

The architecture is additive to the existing codebase, not a restructure. Approximately 25 new route files, 8 new hook files, and 40-50 new components are needed. All new routes extend the existing `campaigns/$campaignId/` tree using TanStack Router file-based routing. Two existing leaf pages (phone-banking.tsx, volunteers.tsx) convert to layout routes with an Outlet. Three new sidebar items are added (Shifts, Team, Settings). No existing routes, hooks, or components are deleted.

**Build-first shared components (needed by all domains):**
1. **DataTable.tsx** — headless TanStack Table wrapper with sorting, filtering, empty state, loading skeleton
2. **FormDialog.tsx** — standardizes open/close/loading/error across all create/edit forms
3. **DetailPage.tsx** — standard tabbed detail page layout used by voter, volunteer, session, shift, and call list detail pages
4. **StepWizard.tsx** — simple step container (progress bar plus step rendering) for the import wizard
5. **FilterBar.tsx** — reusable filter controls for all list pages

**Key patterns to follow:**
- Entity-first query keys: `["voters", campaignId, voterId]` not `["campaigns", campaignId, "voters"]`
- Query key factory (`queryKeys.ts`) — all hook files import from it; no inline string arrays anywhere
- One hook file per domain; flat structure (not subdirectories) up to ~20 files
- Route files orchestrate only (<150 lines); domain logic extracts to `components/{domain}/`
- Optimistic updates only for high-frequency user actions (tag toggles, outcome recording, check-in/check-out)

**Import wizard architecture (most complex flow):**
Wizard state is server-driven: the ImportJob status IS the current step. The ImportJob ID lives in the URL (`imports/$importId`). Navigating away and returning restores the wizard to the correct server-determined step. Zustand handles only transient display state (local previewed rows, column mapping selections before confirmation).

### Critical Pitfalls

Research identified 8 pitfalls with HIGH confidence. The top 5 requiring preventive action before or during early phases:

1. **Query key inconsistency across 20+ hook files** — establish a `queryKeys.ts` factory in Phase 1 before any CRUD pages are built; never use inline string arrays; cross-domain mutations (e.g., recording a call outcome) must explicitly invalidate query keys across multiple namespaces
2. **Pre-signed URL S3 upload with no progress, no error recovery, no size validation** — use XMLHttpRequest (not ky) for the S3 PUT to get upload progress events; validate file size and encoding client-side before upload; handle URL expiry; implement cancel and retry
3. **Multi-step wizard state loss on navigation or refresh** — design the import wizard as a server-state-driven flow (ImportJob status equals the step); store ImportJob ID in the URL; check for in-progress imports on page load; use useBlocker to warn on navigation away during steps 1-3
4. **Phone banking claim race conditions creating duplicate calls** — display a countdown timer per claim; implement a claim heartbeat (re-verify every 60s); handle 409 Conflict explicitly; consider optimistic locking on outcome recording
5. **Permission gating becoming inline role-check spaghetti** — create `permissions.ts` map (action to minimum role) and a CanDo component in Phase 1; zero inline `role === 'admin'` comparisons anywhere; show read-only degradation for lower roles, not blank screens

**Additional pitfalls requiring phase-specific attention:**
- **Form dirty state loss:** useFormGuard hook combining react-hook-form isDirty with TanStack Router useBlocker — needed by every form page; build in Phase 1
- **Timezone display bugs in shift scheduling:** store UTC, display in campaign timezone using IANA string; show timezone abbreviation next to all times; add date-fns-tz for the shift management phase
- **Voter list browser crash at 10K+ records:** install @tanstack/react-virtual; virtualize the voter table with maxPages on infinite query; default voter index to search-prompt-only (no auto-load all)

## Implications for Roadmap

Based on the dependency chains identified in the architecture research and confirmed by feature priorities, 7 phases are recommended:

### Phase 1: Shared Infrastructure + Campaign Foundation

**Rationale:** Shared components, permission system, and form guard patterns are required by every subsequent phase. Building campaign settings and members first validates the FormDialog pattern with the simplest possible CRUD before applying it to complex domains. Role data from members must be available before any permission-gated UI can exist.

**Delivers:** DataTable, FormDialog, DetailPage, StepWizard, FilterBar shared components; queryKeys.ts factory; permissions.ts map; usePermission hook; CanDo component; useFormGuard hook; ky mutation retry config fix; campaign settings edit/delete; campaign member list + invite + role change + ownership transfer; 3 new sidebar nav items

**Addresses features:** Campaign Settings (P3), Campaign Members (P1)

**Avoids pitfalls:** Query key inconsistency (Pitfall 1); permission spaghetti (Pitfall 5); form dirty state loss (Pitfall 6); double-submit from ky retry on mutations

**Research flag:** Skip — standard CRUD patterns, well-documented shared component patterns

### Phase 2: Voter Management Completion

**Rationale:** Voters are the core data model. The contacts, tags, lists, create/edit, and advanced search features are partially scaffolded (hooks and types exist) but have no UI pages. The import wizard (Phase 3) depends on voter types being complete. Call list creation (Phase 4) depends on voter filtering. The phone banking calling screen (Phase 5) needs voter detail.

**Delivers:** Voter detail enhancement (contacts, tags, lists, notes tabs); voter create/edit forms; voter lists CRUD (static and dynamic); advanced search with filter builder

**Addresses features:** Voter Management completion (P1)

**Avoids pitfalls:** Voter list browser crash — TanStack Virtual plus maxPages on infinite query required here; default voter index to search-prompt-only with no auto-load

**Research flag:** Skip — established CRM patterns; TanStack Virtual integration is documented with official examples

### Phase 3: Voter Import Wizard

**Rationale:** Import is the most complex single feature (4 steps, direct-to-S3 upload, async processing). It must come after voter management completion (Phase 2) so imported voters land in a fully functional voter UI. Import has no dependencies on other v1.2 domains.

**Delivers:** Import history list; 4-step import wizard (file upload, column mapping, confirm, progress polling); import detail and status page

**Addresses features:** Voter Imports (P1 critical — "can't use the app without data")

**Avoids pitfalls:** Pre-signed URL upload UX (Pitfall 2) — XMLHttpRequest, progress bar, cancel, retry; wizard state loss (Pitfall 3) — server-state-driven, ImportJob ID in URL, resume on return

**Research flag:** NEEDS RESEARCH — complex multi-part flow; MinIO pre-signed URL behavior (TTL, multipart support, CORS config) should be verified against the actual deployment before designing the upload layer; the backend `/detect` API response contract should be confirmed before building the column mapping UI

### Phase 4: Call Lists + DNC

**Rationale:** Phone bank sessions reference call lists. Call lists apply DNC filtering. Neither can be created before the underlying domain management UI exists. Call list CRUD is relatively simple but is a hard prerequisite for Phase 5.

**Delivers:** Call list CRUD; call list detail with entries; DNC list management (view, add individual, bulk import, delete, DNC check)

**Addresses features:** Call Lists and DNC (P2)

**Avoids pitfalls:** DNC bulk import should show a first-10-rows preview before confirmation to prevent accidental mass-DNC of the wrong file

**Research flag:** Skip — standard CRUD plus table patterns

### Phase 5: Phone Banking

**Rationale:** Depends on call lists (Phase 4), surveys (already complete), and voter detail (Phase 2). The active calling experience is the highest-complexity and highest-stakes UI in the project.

**Delivers:** Phone bank session CRUD plus status controls (draft to active to complete); caller assignment; active calling experience (claim entry, voter card, survey script, outcome recording, auto-advance); session progress dashboard; check-in and check-out

**Addresses features:** Phone Banking (P2 HIGH impact/HIGH complexity)

**Avoids pitfalls:** Phone bank claim race conditions (Pitfall 4) — countdown timers, claim heartbeat, explicit 409 handling; calling screen should hide the sidebar via pathless layout or conditional root layout rendering

**Research flag:** NEEDS RESEARCH — claim lifecycle and expiry behavior should be validated against the API (specifically claim_timeout_minutes configuration, batch claim prefetch feasibility, and whether a heartbeat endpoint exists or needs polling)

### Phase 6: Volunteer Management

**Rationale:** Volunteers are referenced by shifts. Volunteer CRUD must exist before shift assignment has entities to reference. Volunteer management is lower priority (MEDIUM user impact vs. HIGH for phone banking) and has no dependencies from earlier phases beyond Phase 1 shared infrastructure.

**Delivers:** Volunteer roster with enhanced filters; volunteer create/edit; volunteer detail (availability, tags, hours tabs); self-registration flow; availability management

**Addresses features:** Volunteer Management (P2 MEDIUM priority)

**Research flag:** Skip — standard CRUD plus availability UI patterns; shadcn calendar and toggle-group components from Phase 1 CLI additions are ready to use

### Phase 7: Shift Management

**Rationale:** Final major feature area. Depends on volunteers (Phase 6). Shift scheduling introduces the timezone problem — the only phase requiring date-fns-tz and explicit timezone display logic.

**Delivers:** Shift CRUD; shift list with date-grouped display; volunteer signup; manager assignment; check-in/out per volunteer; shift roster; hours adjustment dialog

**Addresses features:** Shift Management (P2 MEDIUM priority)

**Avoids pitfalls:** Timezone bugs (Pitfall 7) — store UTC, display in campaign IANA timezone, show abbreviation next to all times, use date-fns-tz for all date arithmetic; note that a campaign timezone field should be added to the campaign model in Phase 1 (settings form) so it is available here

**Research flag:** Skip — CRUD plus list patterns; timezone handling with date-fns-tz is a well-documented problem with a known solution

### Phase Ordering Rationale

- **Infrastructure first:** Query key factory, permissions, and form guard patterns are cross-cutting. Introducing them after domain pages are built requires touching every file.
- **Core data model before consumers:** Voter management completion (Phase 2) feeds import (Phase 3), call lists (Phase 4), and phone banking (Phase 5). The dependency cascade is strict.
- **Call lists before phone banking:** Sessions reference call lists; a functional phone banking session cannot be created without an existing call list.
- **Volunteers before shifts:** Shifts assign volunteers; volunteer records must exist for shift rosters and assignment dialogs to operate.
- **Import is isolated but data-dependent:** The import wizard depends only on voter types, not on other v1.2 domains. It is placed after voter completion (Phase 2) so imported data lands in working voter UI immediately.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Voter Import Wizard):** MinIO pre-signed URL behavior (TTL, multipart support, CORS config for direct browser upload), backend /detect API response contract and confidence score schema, client-side encoding detection approach
- **Phase 5 (Phone Banking):** Claim heartbeat endpoint availability, claim_timeout_minutes default and configuration range, batch claim prefetch pattern feasibility with the current backend API

Phases with standard patterns (skip research-phase):
- **Phase 1 (Shared Infrastructure):** Standard React component patterns; TanStack Query key factories are documented in official examples
- **Phase 2 (Voter Management):** CRM CRUD patterns; TanStack Virtual integration example exists in official docs
- **Phase 4 (Call Lists + DNC):** Standard CRUD table patterns with file upload for bulk DNC import
- **Phase 6 (Volunteer Management):** Standard CRUD plus availability slot UI patterns
- **Phase 7 (Shift Management):** CRUD plus date-fns-tz; well-documented timezone solution

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified via npm view on 2026-03-10; React 19 peer dependency compatibility explicitly confirmed for each addition; alternatives considered and excluded with written rationale |
| Features | HIGH | Based on gap analysis of existing codebase plus competitor patterns from NGPVAN, NationBuilder, Solidarity Tech, and Mobilize; complexity estimates derived from direct codebase inspection |
| Architecture | HIGH | Primary source is direct codebase analysis (12 hook files, 18 route files, all components reviewed); patterns derived from existing working code; dependency ordering from actual API schema |
| Pitfalls | HIGH | Each pitfall traced to specific codebase evidence (e.g., ky retry config, useFieldOps.ts key naming, dashboard.tsx line count); prevention strategies reference official TanStack docs and verified community patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **MinIO pre-signed URL behavior:** Research assumed AWS S3 conventions. The backend uses MinIO. URL TTL, multipart upload support, and CORS configuration for direct browser-to-MinIO upload need verification against the actual deployment before building the import wizard upload layer.
- **ZITADEL role claim format:** Campaign roles may come from ZITADEL JWT claims, but the exact claim key path (e.g., `urn:zitadel:iam:org:project:roles`) was not verified against the current ZITADEL instance. The permission system design in Phase 1 must confirm where campaign roles live in the token before building the usePermission hook.
- **Phone banking claim_timeout_minutes default:** The actual default value and whether it can be fetched from an API endpoint was not confirmed. The claim countdown UI needs this value at render time.
- **Voter list virtualization row height:** TanStack Virtual requires a known or estimated row height for windowing. The voter list row height depends on the final column design. This should be resolved at the start of Phase 2, not during implementation.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `web/src/hooks/` (12 files), `web/src/routes/` (18 files), `web/src/components/` (all), `web/src/api/client.ts`, `web/src/types/` (11 files)
- [UI vs API Gap Analysis Report](/docs/ui-api-gap-analysis.md) — endpoint coverage inventory (source for ~55/~28/~67 coverage breakdown)
- npm view commands on 2026-03-10 — version and peer dependency verification for all proposed packages
- [TanStack Query Official Docs](https://tanstack.com/query/v5/docs) — invalidation, optimistic updates, polling patterns
- [TanStack Router Official Docs](https://tanstack.com/router/v1/docs) — file-based routing, useBlocker, navigation blocking
- [TanStack Table + Virtual example](https://tanstack.com/table/v8/docs/framework/react/examples/virtualized-infinite-scrolling) — virtualized infinite scroll reference
- [shadcn/ui component docs](https://ui.shadcn.com/docs/components) — full component list and CLI installation
- [PapaParse official site](https://www.papaparse.com/) — streaming and Web Worker support verified
- [@dnd-kit official docs](https://dndkit.com/) — v6.3.1 stable API; @dnd-kit/react v0.3.2 pre-1.0 status confirmed

### Secondary (MEDIUM confidence)

- [TkDodo — Concurrent Optimistic Updates](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — race condition patterns for concurrent mutations
- [Handling Large File Uploads with Pre-signed URLs](https://www.pullrequest.com/blog/handling-large-file-uploads-in-react-securely-using-aws-s3-pre-signed-urls/) — XHR upload progress pattern
- [Building a Virtualized Table with TanStack](https://dev.to/ainayeem/building-an-efficient-virtualized-table-with-tanstack-virtual-and-react-query-with-shadcn-2hhl) — Virtual plus Table plus Query integration
- [Implementing RBAC in React](https://www.permit.io/blog/implementing-react-rbac-authorization) — permission map and CanDo component pattern
- [TanStack Router Navigation Blocking](https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking) — useBlocker API for dirty form guards

### Tertiary (needs validation during implementation)

- MinIO pre-signed URL behavior — assumed AWS S3 conventions; verify against actual deployment
- ZITADEL campaign role claim path — needs confirmation against running ZITADEL instance
- Phone banking claim_timeout_minutes default — not confirmed against backend configuration

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
