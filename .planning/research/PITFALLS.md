# Pitfalls Research: Full UI Coverage (v1.2)

**Domain:** Adding ~95 CRUD UI pages to existing React + TanStack Router + TanStack Query campaign management app
**Researched:** 2026-03-10
**Confidence:** HIGH (patterns verified against existing codebase, TanStack docs, and community best practices)

## Critical Pitfalls

### Pitfall 1: TanStack Query Cache Invalidation Breaks at Scale with Deeply Nested Campaign Routes

**What goes wrong:**
With ~95 endpoints all scoped under `/campaigns/$campaignId/...`, mutation callbacks invalidate the wrong data, miss related queries, or over-invalidate causing waterfall refetches. Example: recording a phone bank call outcome should invalidate the call list entry, the session progress stats, and the voter's interaction history -- but the current pattern only invalidates one query key per mutation. As more hooks are added, stale data becomes the default user experience, and pages show outdated counts, phantom entries, or missing updates.

**Why it happens:**
The existing codebase already shows the beginning of this problem. In `useTurfs.ts`, `useCreateTurf` invalidates `["turfs", campaignId]` -- but what about the dashboard stats that count turfs? What about walk lists that depend on turf existence? Each hook author only thinks about their immediate data, not the cross-cutting queries that also display it. TanStack Query's `invalidateQueries` uses prefix matching by default (invalidating `["turfs", campaignId]` also invalidates `["turfs", campaignId, turfId]`), which is helpful but only works within the same key namespace. Cross-namespace invalidation (turf mutation invalidating dashboard data) must be explicit and is consistently forgotten.

The current hooks also use inconsistent key namespaces: `useFieldOps.ts` uses `["turfs", campaignId]` while `useTurfs.ts` also uses `["turfs", campaignId]` -- these overlap correctly by accident, but with 20+ hook files this will break down.

**How to avoid:**
1. Establish a query key factory pattern at the start of v1.2. Create a single `queryKeys.ts` file that defines all query keys as nested objects:
   ```typescript
   export const queryKeys = {
     voters: {
       all: (campaignId: string) => ["voters", campaignId] as const,
       detail: (campaignId: string, voterId: string) => ["voters", campaignId, voterId] as const,
       interactions: (campaignId: string, voterId: string) => ["voters", campaignId, voterId, "interactions"] as const,
     },
     callLists: {
       all: (campaignId: string) => ["call-lists", campaignId] as const,
       detail: (campaignId: string, listId: string) => ["call-lists", campaignId, listId] as const,
       entries: (campaignId: string, listId: string) => ["call-lists", campaignId, listId, "entries"] as const,
     },
     dashboard: {
       stats: (campaignId: string) => ["dashboard", campaignId, "stats"] as const,
     },
     // ... all other entities
   }
   ```
2. Define an invalidation map that documents which mutations should invalidate which queries. For example, `recordCallOutcome` should invalidate `callLists.entries`, `dashboard.stats`, and `voters.interactions`.
3. Never use string literals in `queryKey` or `invalidateQueries` calls -- always reference the factory. This makes key typos a compile-time error.
4. Use `isMutating()` checks in `onSettled` callbacks to prevent premature invalidation when multiple mutations are in flight (the TkDodo pattern).

**Warning signs:**
- Dashboard counts not updating after creating/deleting entities in sub-pages
- Users need to manually refresh to see changes made on other tabs
- Different parts of the same page showing inconsistent data
- More than 3 inline `queryKey` string arrays per hook file

**Phase to address:**
Phase 1 (Shared Infrastructure). The query key factory and invalidation map must be established before any CRUD pages are built. Retrofitting consistent keys onto 20+ hook files is error-prone.

---

### Pitfall 2: Pre-Signed URL File Upload with No Progress, No Error Recovery, No Size Validation

**What goes wrong:**
The import flow uses pre-signed URLs for direct-to-S3 upload (the backend returns `upload_url` from `POST /imports`). A naive implementation starts the upload, shows a spinner, and hopes for the best. Large CSV files (50-500MB voter files) upload for minutes with no progress indicator, users close the tab thinking it froze, the pre-signed URL expires mid-upload, or the browser runs out of memory trying to validate the file client-side before upload. Non-UTF-8 encoded files upload successfully but produce garbage data during import processing.

**Why it happens:**
The backend API is correctly designed for this (returns `upload_url` and `file_key`, then the client calls `/detect` after upload). But the frontend implementation often treats upload as a single `fetch()` call with no progress tracking. The `ky` HTTP client used in this project does support `onDownloadProgress` but does NOT support `onUploadProgress` for streamed uploads -- this is a known limitation. Pre-signed URLs have a default TTL (often 15 minutes), and large files on slow connections can exceed this. CSV encoding issues (Windows-1252, Latin-1) are invisible until the backend tries to parse the file.

**How to avoid:**
1. Use the raw `XMLHttpRequest` or `fetch` with `ReadableStream` for the actual S3 upload (not `ky`), since `ky` lacks upload progress events. Wrap it in a custom `useUpload` hook that tracks `xhr.upload.onprogress`.
2. Validate file size client-side before requesting the pre-signed URL. Reject files over 500MB with a clear message. Validate file extension (.csv, .tsv, .txt).
3. Read the first 8KB of the file client-side using `FileReader` to detect encoding. If it is not UTF-8, show a warning and offer to re-encode or reject.
4. Show a progress bar with percentage, bytes uploaded, and estimated time remaining during upload.
5. Handle pre-signed URL expiry: if the upload takes longer than 10 minutes, request a new pre-signed URL before the old one expires. Alternatively, use multipart upload for files over 100MB.
6. Implement a cancel button that aborts the `XMLHttpRequest` and cleans up the import job.
7. On upload failure (network error, URL expiry), offer a retry button that requests a fresh pre-signed URL and resumes or restarts.

**Warning signs:**
- Upload UI shows only a spinner with no percentage
- No file size check before upload begins
- Using `ky` or `fetch` for the S3 PUT with no progress callback
- Import wizard does not handle the case where the user closes the browser mid-upload
- No encoding detection or preview of the first few rows

**Phase to address:**
Phase 2 (Voter Import Wizard). This is the most complex single feature in v1.2. The upload UX must be designed with large files in mind from the start -- bolting progress tracking onto a finished wizard requires restructuring the upload layer.

---

### Pitfall 3: Multi-Step Wizard State Loss on Navigation, Refresh, or Error

**What goes wrong:**
The voter import wizard has 4 steps: (1) upload file, (2) detect/review columns, (3) confirm field mapping, (4) monitor processing. Users complete step 1 (which creates a server-side ImportJob and uploads to S3), then accidentally hit the browser back button, navigate to another page, or refresh. All wizard state is lost. They must start over, but the orphaned ImportJob and uploaded file now exist on the server with no client-side reference. Worse: the import job might actually still be processing, and the user starts a duplicate import.

**Why it happens:**
React component state (useState, useReducer) is destroyed on unmount. Multi-step wizards that store progress in component state lose everything on navigation. The existing app uses TanStack Router with file-based routing, so each route is its own component tree -- navigating away unmounts the entire wizard. Using Zustand for wizard state would survive navigation but not page refresh. Neither approach handles the fundamental problem: the server-side state (ImportJob with status=PENDING/UPLOADED) exists independently of the client.

**How to avoid:**
1. Design the wizard as a server-state-driven flow, not a client-state-driven flow. The `ImportJob` record IS the wizard state. Each step updates the server-side job status (PENDING -> UPLOADED -> QUEUED -> PROCESSING -> COMPLETED).
2. On the import page, first check for any in-progress import jobs (call `GET /imports?status=pending,uploaded`). If one exists, resume it at the appropriate step instead of starting fresh.
3. Store the current import job ID in the URL (e.g., `/campaigns/$campaignId/voters/import/$importId`). This makes wizard state survive refresh and is shareable.
4. Use TanStack Query to fetch the import job status at each step. The wizard step is derived from the job status, not from client-side step counter.
5. Add a "Cancel Import" action that deletes the server-side ImportJob and uploaded file if the user wants to start over.
6. Use TanStack Router's `useBlocker` hook to warn users when navigating away from an in-progress import (steps 1-3). Do NOT block navigation after step 4 (monitoring), since the import runs independently.

**Warning signs:**
- Wizard state stored entirely in useState or Zustand with no server-side persistence
- No check for existing in-progress imports on page load
- Import job ID not in the URL
- No cancel/cleanup mechanism for abandoned imports
- Users reporting duplicate imports or "stuck" import jobs

**Phase to address:**
Phase 2 (Voter Import Wizard). This architecture decision must be made before building the wizard UI. A client-state wizard that gets retroactively connected to server state is messy.

---

### Pitfall 4: Phone Banking Claim-on-Fetch Race Conditions Creating Duplicate Calls or Lost Work

**What goes wrong:**
Multiple callers working the same call list simultaneously. Caller A claims 5 entries, starts calling. Caller A's browser goes idle for 20 minutes (claim timeout is configurable via `claim_timeout_minutes`). The server releases Caller A's stale claims. Caller B claims those same entries and starts calling the same voters. Caller A returns, still sees the old entries in their UI, and records outcomes against entries that are now claimed by Caller B. The backend may accept Caller A's outcome recording (since the entry exists), creating conflicting records, or reject it, causing Caller A to lose their work.

**Why it happens:**
The backend correctly implements `SELECT ... FOR UPDATE SKIP LOCKED` for claim atomicity, and releases stale claims based on `claim_timeout_minutes`. But the frontend has no awareness of claim expiry. The UI shows claimed entries indefinitely without checking if the claims are still valid. There is no heartbeat or periodic re-validation. The `ky` client retries on 408/429/500 but does not distinguish between "entry no longer claimed by you" (409 Conflict) and other errors.

**How to avoid:**
1. Track claim timestamps on the frontend. When the caller claims entries, store `claimed_at` and `claim_timeout_minutes`. Show a countdown timer per entry and auto-release (re-claim or warn) before server-side timeout triggers.
2. Implement a claim heartbeat: periodically (every 60 seconds) call a lightweight endpoint or re-verify claimed entries are still assigned to the current user. If claims were released, show a prominent warning.
3. When recording an outcome, handle 409 Conflict specifically: show "This entry was reclaimed by another caller" with the option to save notes locally and skip to the next entry.
4. Add optimistic locking: include `claimed_at` timestamp in the outcome recording request. The backend rejects if `claimed_at` does not match (meaning the entry was released and reclaimed).
5. Auto-claim the next batch of entries before the current batch is exhausted (prefetch pattern). When the caller is on entry 3 of 5, claim the next 5. This prevents downtime between batches.
6. Disable the call UI for entries whose claim has expired on the client side. Do not let the user interact with expired claims.

**Warning signs:**
- No timer or expiry indicator on claimed call list entries
- Users reporting "I called that person already" from another caller
- Outcome recording failing silently or with generic error messages
- No handling of 409 status code in the phone banking hooks
- No periodic claim validation or heartbeat

**Phase to address:**
Phase 4 (Phone Banking UI). The calling experience is the highest-stakes real-time UI in the entire app. Claim management UX must be designed alongside the backend's SKIP LOCKED pattern, not as an afterthought.

---

### Pitfall 5: Permission-Gated UI Becomes an Unmaintainable Spaghetti of Role Checks

**What goes wrong:**
The backend enforces 5 roles (owner, admin, manager, volunteer, viewer) per endpoint via `require_role()`. The frontend starts with `if (userRole === 'admin' || userRole === 'owner')` scattered through every component. With 95 endpoints mapped to UI, this creates hundreds of inline role checks. Role definitions change (add a "coordinator" role), and 40 components need updating. Worse: the frontend role checks drift from backend enforcement, so buttons appear that return 403 when clicked, or buttons are hidden that the user actually has access to.

**Why it happens:**
The existing app has NO permission system on the frontend. The auth store tracks `user` and `isAuthenticated` but not `role` or permissions. Campaign member roles come from ZITADEL (the `members.py` endpoint even returns a hardcoded `role="member"` since real roles come from ZITADEL claims). The JWT token contains ZITADEL roles, but these are not parsed or exposed to the React components. Without a central permission system, each developer improvises their own role checking.

**How to avoid:**
1. Parse ZITADEL campaign roles from the JWT token or fetch them via the members API on campaign load. Store the current user's role for the active campaign in a Zustand store or React context scoped to the campaign layout.
2. Create a permission map (not individual role checks) that maps actions to minimum required roles:
   ```typescript
   const permissions = {
     'imports:create': ['admin', 'owner'],
     'call-lists:create': ['manager', 'admin', 'owner'],
     'shifts:signup': ['volunteer', 'manager', 'admin', 'owner'],
     'members:list': ['viewer', 'volunteer', 'manager', 'admin', 'owner'],
   } as const
   ```
3. Build a single `usePermission(action: string)` hook and a `<CanDo action="imports:create">` wrapper component. All role checks go through these -- never inline role string comparisons.
4. The permission map is the single source of truth. When roles change, update one file.
5. Always let the backend be the ultimate authority. If a user somehow reaches a button they should not see, the backend still returns 403. The frontend permission system is a UX optimization (hide unavailable actions), not a security mechanism.
6. Provide graceful degradation: do not hide entire pages from lower-role users. Instead, show the page in read-only mode with disabled action buttons and a tooltip explaining "Manager role required."

**Warning signs:**
- Inline `role === 'admin'` checks in component files
- Buttons that show up but return 403 when clicked
- No `usePermission` or `<CanDo>` abstraction in the codebase
- User role not available in the campaign layout context
- Different pages checking the same permission differently

**Phase to address:**
Phase 1 (Shared Infrastructure). The permission system must exist before any CRUD pages are built. Every page needs it, and retrofitting requires touching every component.

---

### Pitfall 6: Form-Heavy Pages with No Dirty State Tracking, No Unsaved Changes Warning, No Optimistic Updates

**What goes wrong:**
v1.2 adds dozens of create/edit forms: voters, volunteers, shifts, call lists, DNC entries, campaign settings, survey scripts, etc. Users fill out a complex form, accidentally click a sidebar link, and lose all their work. Or they submit a form, the API takes 2 seconds, and they see no feedback -- so they click Submit again, creating a duplicate. Or they edit a record, switch to another tab, come back, and the form still shows stale data from 30 minutes ago.

**Why it happens:**
The existing forms (e.g., TurfForm.tsx) use React Hook Form + Zod but do not implement navigation blocking. There is no `useBlocker` integration with TanStack Router. The existing `ky` client retries failed requests (including POST mutations), which can create duplicates if the server processes the first request but the client retries before receiving the response. React Hook Form's `isDirty` state is not connected to anything that prevents navigation.

**How to avoid:**
1. Create a reusable `useFormGuard` hook that combines React Hook Form's `formState.isDirty` with TanStack Router's `useBlocker`:
   ```typescript
   function useFormGuard(isDirty: boolean) {
     useBlocker({
       shouldBlockFn: () => isDirty,
       withResolver: true,
       enableBeforeUnload: true,
     })
   }
   ```
2. Apply `useFormGuard` to every form page. Make this a code review checklist item.
3. Prevent double-submit by disabling the submit button on `isSubmitting` (React Hook Form provides this). Do NOT rely on `ky` retry for mutation endpoints. Remove POST/PUT/PATCH/DELETE from the retry status codes in the `ky` client config, or use mutation idempotency keys.
4. Implement optimistic updates for simple edits (name changes, status toggles) using TanStack Query's `onMutate` callback. For complex edits (campaign settings with ZITADEL side effects), wait for server confirmation.
5. On edit pages, refetch the entity data when the page regains focus (`refetchOnWindowFocus: true` is TanStack Query's default -- verify it is not disabled).
6. For long forms (volunteer profiles with many fields), consider auto-save with debounce (save draft every 5 seconds of inactivity) rather than requiring explicit submit.

**Warning signs:**
- Forms with no `useBlocker` or `beforeunload` handler
- Submit button enabled during submission (no `isSubmitting` check)
- POST endpoints in the `ky` retry config (currently retries on 413, which IS a POST-relevant status)
- No optimistic updates on any mutation
- Edit pages not refetching data on window focus

**Phase to address:**
Phase 1 (Shared Infrastructure) for `useFormGuard` hook and `ky` retry config fix. Every subsequent phase uses it.

---

### Pitfall 7: Volunteer Shift Scheduling Ignoring Timezones and Creating Unusable Calendar UIs

**What goes wrong:**
A campaign manager in the Eastern timezone creates a canvassing shift from 9am-12pm. A volunteer in the Central timezone sees it as 9am-12pm (their local time) instead of 8am-11am. They show up an hour late. Or: a shift created on March 8 (before DST spring-forward) for March 10 (after DST) shows the wrong time because the frontend added hours naively instead of using timezone-aware date math. Recurring weekly shifts drift by an hour every DST transition.

**Why it happens:**
The backend stores `start_at` and `end_at` as timestamps (likely UTC in PostgreSQL). JavaScript `Date` objects are UTC internally but display in the browser's local timezone. If the frontend formats shift times without considering the campaign's timezone (or the shift's location timezone), times display incorrectly for users in different timezones. The `Intl.DateTimeFormat` API handles this correctly but only if the timezone is explicitly specified. The existing codebase uses no date formatting library -- dates are likely displayed via `.toLocaleString()` which uses the browser's timezone.

**How to avoid:**
1. Add a `timezone` field to campaigns (or infer from jurisdiction). Store it as an IANA timezone string (e.g., "America/New_York").
2. Always store shift times in UTC on the server. Convert to the campaign's timezone for display, not the browser's timezone. A volunteer in California viewing an Atlanta campaign's shifts should see Eastern times.
3. Use `date-fns` with `date-fns-tz` (already in the npm ecosystem, no heavy dependencies) for all date formatting and arithmetic. Never use raw `Date` math for adding hours/days.
4. Display the timezone abbreviation next to all times (e.g., "9:00 AM EST"). This prevents ambiguity.
5. For shift creation forms, accept times in the campaign's timezone and convert to UTC before sending to the API.
6. Test DST transitions explicitly: create a shift during DST changeover week and verify the displayed time is correct before and after the transition.

**Warning signs:**
- No timezone field on campaigns or shifts
- Date formatting using `.toLocaleString()` without explicit timezone
- No date-fns or equivalent library in package.json
- Shift times displayed without timezone indicator
- No DST transition tests

**Phase to address:**
Phase 5 (Shift Management UI). But the campaign timezone field should be added in Phase 1 (shared data) or Phase 3 (Campaign Settings), since it affects multiple features.

---

### Pitfall 8: Voter List Pages That Freeze the Browser at 10K+ Records

**What goes wrong:**
The voter index page renders all returned voters into the DOM. With the existing `useInfiniteQuery` in `useVoters.ts`, users keep scrolling and loading pages. After 50 pages of 100 voters each, there are 5,000 DOM rows rendering simultaneously. The browser becomes sluggish. At 20,000 rows, the tab crashes. But the campaign has 500,000 voters, and campaign staff need to scroll through filtered results that might still be 50K+ records.

**Why it happens:**
The existing `useVoters` hook correctly uses `useInfiniteQuery` with cursor-based pagination, but infinite scrolling without virtualization means every loaded page stays in the DOM. TanStack Table is already a dependency (`@tanstack/react-table: ^8.21.3`) but TanStack Virtual (`@tanstack/react-virtual`) is NOT installed. Without virtualization, the browser renders every row into the DOM, and React re-renders all of them on any state change.

**How to avoid:**
1. Install `@tanstack/react-virtual` and combine it with `@tanstack/react-table` for virtualized infinite scrolling. TanStack's own example (`virtualized-infinite-scrolling`) shows exactly this pattern.
2. Only render the visible rows plus a small overscan buffer (20-30 rows). Replace the current flat list rendering with a virtualized container.
3. Set `maxPages` on the infinite query to limit how many pages TanStack Query keeps in memory. For voter lists, keeping 5-10 pages (500-1000 records) in memory while the virtualizer handles which are visible.
4. For search results, use server-side filtering (the backend already supports this via `POST /voters/search`) and show paginated results, not infinite scroll.
5. Memoize row components with `React.memo` and stable key props. Use `useMemo` for derived data (filtered/sorted views).
6. Do NOT load all voters on page mount. Default to showing a search interface with no results until the user applies filters. This is standard for large datasets in political tech (NationBuilder, NGP VAN).

**Warning signs:**
- Browser dev tools showing 10,000+ DOM nodes on the voter page
- Scroll jank or input lag after loading multiple pages
- Memory usage climbing linearly with scroll depth
- No `@tanstack/react-virtual` in dependencies
- Voter list loading without any filters applied

**Phase to address:**
Phase 3 (Voter Management). Virtualization must be part of the initial voter list implementation, not retrofitted. The hook (`useVoters`) already supports infinite queries -- it just needs a virtualized renderer.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline query key strings instead of factory | Faster to write individual hooks | Key typos, missed invalidation, inconsistent naming across 20+ hook files | Never for v1.2 -- too many hooks |
| Storing wizard state in React component state | Simple implementation, no persistence code | State loss on navigation, duplicate imports from abandoned wizards | Never for import wizard -- use server-side state |
| `ky` retry config including mutation status codes | Fewer failed requests visible to users | Duplicate resource creation (double-submit on POST), data corruption | Never for POST/PUT/PATCH/DELETE. Remove 413 from retry for mutations or use idempotency keys |
| Inline role string comparisons | Quick to implement first few pages | Hundreds of scattered checks, role changes require touching every file | Only for prototype/spike. Replace with permission map before merge |
| Using browser timezone for all date display | No timezone infrastructure needed | Wrong times for cross-timezone campaigns, DST bugs | Only if all campaign operations are strictly local |
| Rendering all loaded infinite query pages | No virtualization dependency or complexity | Browser crash at 10K+ rows, memory leak on scroll | Only for lists guaranteed under 100 items |
| Client-side CSV parsing for column detection | Faster feedback, no server round-trip | Browser memory issues with large files, inconsistent parsing vs. backend | Only for preview (first 100 rows). Actual column detection should match backend |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Pre-signed URL upload (S3/MinIO) | Using `ky` or `fetch` for the upload PUT (no progress events) | Use `XMLHttpRequest` with `xhr.upload.onprogress` for the S3 PUT. Use `ky` for all other API calls |
| Pre-signed URL upload (S3/MinIO) | Not handling URL expiry during slow uploads | Request fresh URL if upload exceeds 80% of TTL; or use multipart upload for files > 100MB |
| TanStack Router navigation blocking | Using `beforeunload` alone (does not block in-app navigation) | Use TanStack Router's `useBlocker` hook for in-app navigation AND `enableBeforeUnload` for tab close |
| TanStack Query + mutations | Calling `refetch()` after mutation instead of `invalidateQueries()` | Always invalidate via query key factory; refetch is for retrying the same query with the same params |
| ZITADEL role claims | Parsing roles from every API response header | Parse roles from JWT on login; cache in campaign-scoped Zustand store; refresh on campaign switch |
| React Hook Form + Zod 4 | Using Zod v3 schema methods with Zod v4 (breaking changes in `z.string().email()` etc.) | The project uses Zod v4 (`^4.3.6`). Verify all schema definitions use v4 API. `@hookform/resolvers` v5 supports Zod v4 |
| TanStack Table + Virtual | Mounting virtualizer on a div but using table semantics (thead/tbody) | Use the spacer-based virtualization pattern that preserves native table layout for sticky headers and column pinning |
| `ky` retry + mutations | `ky` retries on 408, 413, 429, 500, 502, 503, 504 by default (current config). POST mutations retried on 500 create duplicates | Create a separate `ky` instance for mutations with `retry: 0`, or add idempotency keys |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No virtualization on voter lists | Browser jank, tab crash, memory climbing linearly | TanStack Virtual + Table with maxPages on infinite query | > 2,000 rows rendered in DOM |
| Re-rendering all table rows on any state change | Typing in a search field re-renders 500 visible rows | `React.memo` on row components; isolate search state from table state | > 500 visible rows with interactive filters |
| Loading all campaign data on layout mount | Slow initial load, unnecessary API calls for pages user may not visit | Lazy load per-route; only fetch dashboard data when on dashboard route | > 5 active data fetches on campaign layout |
| Infinite query without maxPages | Memory grows unbounded as user scrolls | Set `maxPages: 10` on voter/call list infinite queries; virtualize rendering | > 5,000 records loaded in memory |
| Large CSV parsed entirely in browser | Tab freezes or crashes on 100MB+ files | Stream-parse only first 100 rows for preview; upload full file to server for processing | > 50MB CSV files |
| Unthrottled polling for import progress | Polling every 500ms creates unnecessary server load and rerenders | Poll every 3 seconds while processing; stop polling when status is terminal (COMPLETED/FAILED) | > 10 concurrent import monitors |
| No debounce on voter search filters | Every keystroke triggers a new API request | Debounce search input by 300ms; use `keepPreviousData: true` for smooth UX | > 5 filter fields changing simultaneously |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Frontend permission checks without backend enforcement | Users bypass UI restrictions via browser dev tools and call APIs directly | Backend `require_role()` is already enforced. Frontend is UX only -- never rely on it for security |
| Displaying voter PII (phone, address) to all roles | Viewers and volunteers see sensitive contact info they should not access | Map PII field visibility to roles: viewers see name only; volunteers see name + phone; managers see all |
| Pre-signed URL leakage via browser history or logs | Anyone with the URL can upload to or download from the S3 bucket until TTL expires | Short TTL (15 min); scope to specific object key; log URL generation |
| Storing ZITADEL access token in localStorage | XSS attack extracts token and impersonates user | The existing code uses `WebStorageStateStore({ store: localStorage })` for oidc-client-ts. This is the standard pattern but ensure CSP headers prevent script injection |
| Campaign member list exposing all user emails | Email harvesting of campaign staff | Only show full emails to admin/owner; show masked emails to other roles (j***@example.com) |
| File upload accepting any file type | Malicious files uploaded disguised as CSV | Validate MIME type and extension on both client and server; never execute uploaded content |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Import wizard with no progress or estimated time | Campaign admin uploads 200MB voter file, waits 10 minutes with no feedback, closes tab | Progress bar with bytes uploaded, percentage, and ETA. Resume indicator if they navigate away and come back |
| Phone banking claim counter with no expiry warning | Caller leaves for coffee, returns to expired claims, records outcomes that get rejected | Show countdown timer per claim; auto-release and reclaim with warning at 2 minutes before expiry |
| Form submission with no loading state | User clicks Save, nothing happens for 2 seconds, clicks again, creates duplicate | Disable button + show spinner on submit; toast on success; shake/highlight on error |
| Shift calendar showing times in wrong timezone | Volunteer shows up at wrong time, wastes 2 hours | Always display campaign timezone; show "in X hours" relative time alongside absolute time |
| Modal confirmation dialogs with no keyboard support | Screen reader users cannot confirm destructive actions (delete shift, remove member) | Use Radix AlertDialog (already in deps) which handles focus trap, Escape key, and aria-labels |
| Voter search that loads all results on empty query | Page freezes loading 500K voters when user first visits | Default to empty results with search prompt; require at least one filter to execute query |
| DNC list import with no preview | Admin imports wrong file, accidentally DNC-flags 10K voters | Show first 10 rows preview before confirming import; add an "undo last import" feature |
| Calling experience that hides voter context | Caller has no information about the person they are calling | Show voter name, address, previous interactions, and any existing survey responses on the call screen |

## "Looks Done But Isn't" Checklist

- [ ] **Query key factory:** Often missing consistent key naming -- verify ALL hooks import from `queryKeys.ts`, no inline string arrays
- [ ] **Voter import wizard:** Often missing resume-on-return -- verify navigating away and back restores wizard to correct step from server state
- [ ] **Phone banking claiming:** Often missing claim expiry UX -- verify UI shows countdown and handles reclaim gracefully after timeout
- [ ] **Form pages:** Often missing navigation guard -- verify every form with editable fields has `useBlocker` integration and `beforeunload`
- [ ] **Permission gating:** Often missing read-only mode -- verify lower-role users see pages with disabled actions, not blank "Access Denied" screens
- [ ] **Shift scheduling:** Often missing timezone display -- verify times show campaign timezone, not browser timezone
- [ ] **Voter list:** Often missing virtualization -- verify scrolling 10,000 rows does not degrade performance (check DOM node count in dev tools)
- [ ] **Delete confirmations:** Often missing double-confirm for destructive actions -- verify campaign delete, member remove, DNC import all require explicit confirmation
- [ ] **Loading states:** Often missing skeleton screens -- verify every page shows skeleton layout (not just a spinner) during initial data fetch
- [ ] **Error boundaries:** Often missing per-section error handling -- verify a failed API call in one section does not crash the entire page
- [ ] **Empty states:** Often missing "no data yet" messaging -- verify every list page has a meaningful empty state with a call to action (not just a blank table)
- [ ] **Accessibility:** Often missing keyboard navigation on custom components -- verify all modals trap focus, all dropdowns are keyboard-navigable, all drag-and-drop has keyboard alternative

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Inconsistent query keys causing stale data | MEDIUM | Create query key factory; find-and-replace all inline keys; add lint rule to prevent regression |
| Import wizard state loss (orphaned jobs) | LOW | Add cleanup job for PENDING imports older than 24 hours; add "resume import" UI |
| Phone bank claim race condition (duplicate calls) | MEDIUM | Add optimistic locking to outcome recording; deduplicate interactions by (voter_id, call_list_entry_id); contact affected voters to apologize for duplicate calls |
| Missing navigation guards (lost form data) | LOW | Add `useFormGuard` hook; apply to all form pages in a single PR |
| Permission checks scattered across components | MEDIUM | Extract all role checks into permission map; create `<CanDo>` component; find-and-replace inline checks |
| Timezone bugs in shift display | LOW | Add campaign timezone field; update all date formatting to use `date-fns-tz`; verify with DST test |
| Browser crash from unvirtualized voter list | MEDIUM | Install TanStack Virtual; refactor voter table component; add `maxPages` to infinite query |
| Double-submit from ky retry on mutations | HIGH | Audit all created records for duplicates; fix ky retry config; add idempotency keys to critical mutations |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Query key inconsistency | Phase 1 (Shared Infrastructure) | All hooks import from queryKeys.ts; no inline key strings; lint rule enforced |
| File upload UX (progress, errors) | Phase 2 (Voter Import Wizard) | Upload 200MB file; verify progress bar; verify cancel; verify resume after network error |
| Wizard state loss | Phase 2 (Voter Import Wizard) | Navigate away mid-wizard and return; verify correct step restored from server state |
| Phone bank claim race condition | Phase 4 (Phone Banking UI) | Two users claim from same list simultaneously; verify no duplicate calls; verify expired claim UI |
| Permission spaghetti | Phase 1 (Shared Infrastructure) | Single `permissions.ts` file; all components use `<CanDo>` or `usePermission`; no inline role checks |
| Form dirty state loss | Phase 1 (Shared Infrastructure) | Edit any form; navigate away; verify blocking dialog appears; verify beforeunload on tab close |
| Timezone bugs in shifts | Phase 5 (Shift Management) | Create shift in ET campaign; view from CT browser; verify correct time with timezone indicator |
| Voter list browser crash | Phase 3 (Voter Management) | Load 10K voters with filters; verify < 200 DOM rows rendered; verify smooth scroll at 60fps |
| Double-submit from ky retry | Phase 1 (Shared Infrastructure) | Slow network simulation; click submit twice; verify single resource created |
| Accessibility gaps | All phases | Keyboard-only navigation test on every page; screen reader test on modals, forms, and drag-drop |

## Sources

- [Avoiding Common Mistakes with TanStack Query](https://www.buncolak.com/posts/avoiding-common-mistakes-with-tanstack-query-part-1/) - Query key management pitfalls
- [Concurrent Optimistic Updates in React Query - TkDodo](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) - Race condition patterns for concurrent mutations
- [We kept breaking cache invalidation in TanStack Query](https://dev.to/ignasave/we-kept-breaking-cache-invalidation-in-tanstack-query-so-we-stopped-managing-it-manually-47k2) - Cache invalidation patterns at scale
- [TanStack Query Invalidation Docs](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) - Official invalidation guide
- [TanStack Router Navigation Blocking](https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking) - useBlocker API for dirty form guards
- [Handling Large File Uploads in React with Pre-signed URLs](https://www.pullrequest.com/blog/handling-large-file-uploads-in-react-securely-using-aws-s3-pre-signed-urls/) - S3 upload patterns
- [Multipart Upload Approach for React](https://www.tothenew.com/blog/handling-large-file-uploads-in-react-the-multipart-upload-approach/) - Progress tracking and chunking
- [Secure File Uploads with React and FastAPI](https://medium.com/@sanmugamsanjai98/secure-file-uploads-made-simple-mastering-s3-presigned-urls-with-react-and-fastapi-258a8f874e97) - FastAPI + S3 pre-signed URL pattern
- [Building a Virtualized Table with TanStack](https://dev.to/ainayeem/building-an-efficient-virtualized-table-with-tanstack-virtual-and-react-query-with-shadcn-2hhl) - Virtual + Table + Query integration
- [TanStack Table Virtualized Infinite Scrolling Example](https://tanstack.com/table/v8/docs/framework/react/examples/virtualized-infinite-scrolling) - Official reference implementation
- [Implementing RBAC in React](https://www.permit.io/blog/implementing-react-rbac-authorization) - Permission-gated UI patterns
- [Accessible Drag and Drop - React Spectrum](https://react-spectrum.adobe.com/blog/drag-and-drop.html) - WCAG 2.2 drag-and-drop patterns
- [Autosave Race Conditions in React Query](https://www.pz.com.au/avoiding-race-conditions-and-data-loss-when-autosaving-in-react-query) - FIFO mutation queue pattern
- [Building Multi-Step Forms with React](https://makerkit.dev/blog/tutorials/multi-step-forms-reactjs) - Wizard state management patterns
- [Multi-Step Forms with React Hook Form + Zustand + Zod](https://www.buildwithmatija.com/blog/master-multi-step-forms-build-a-dynamic-react-form-in-6-simple-steps) - Per-step validation pattern
- CivicPulse codebase analysis: `web/src/hooks/`, `web/src/api/client.ts`, `app/api/v1/` (internal)

---
*Pitfalls research for: Full UI Coverage (v1.2) -- adding ~95 CRUD pages to existing React + TanStack campaign management app*
*Researched: 2026-03-10*
