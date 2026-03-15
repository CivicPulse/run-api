# Phase 27: Wire Advanced Filters to Backend - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the voter list page to transmit all filter fields (propensity ranges, demographic multi-select, mailing address) to the backend via POST /voters/search so advanced filtering works end-to-end. Fix sorting (currently non-functional), migrate all frontend voter-fetching hooks from GET to POST, and validate with Playwright E2E tests. GET /voters endpoint stays as-is for backward compatibility.

</domain>

<decisions>
## Implementation Decisions

### API routing strategy
- Always use POST /voters/search — all frontend voter fetching migrates to POST
- GET /voters endpoint stays as-is with its 7 params for external API consumers — no changes
- Initial "conditional POST" choice was revised to "always POST" for simplicity — no conditional routing logic

### VoterSearchBody (backend schema)
- New Pydantic model: VoterSearchBody wraps VoterFilter with pagination and sorting fields
- Structure: `{ filters: VoterFilter, cursor?: str, limit?: int, sort_by?: str, sort_dir?: str }`
- `limit` naming (not page_size) to match existing backend conventions
- `sort_by` validated against whitelist of allowed sortable columns (Literal type or validator)
- `sort_dir` validated as Literal['asc', 'desc']
- POST /voters/search endpoint updated from `body: VoterFilter` to `body: VoterSearchBody`

### VoterSearchRequest type fix
- Remove VoterSearchRequest TypeScript type entirely — it was the broken `{ filters, query }` envelope
- Frontend sends VoterFilter directly (via VoterSearchBody wrapper on backend)
- Create matching TypeScript VoterSearchBody interface for the POST body

### Frontend hook migration
- Delete useVotersQuery (GET-based) — replaced entirely
- Delete useSearchVoters (orphaned mutation) — replaced entirely
- Create new useVoterSearch hook (useQuery-based, POST)
- Migrate useVoters (infinite scroll in AddVotersDialog) to also use POST with VoterSearchBody
- All frontend voter-fetching hooks use POST /voters/search consistently
- Frontend adopts 'limit' naming everywhere (not pageSize)

### VoterFilterBuilder contract
- VoterFilterBuilder keeps emitting VoterFilter via onChange — no change to component contract
- Voter list page wraps VoterFilter into VoterSearchBody when passing to the hook
- Clean separation: filter component doesn't know about pagination/sorting

### Sorting implementation
- Fix sorting in search_voters (currently hardcoded to created_at DESC — sorting has never worked)
- search_voters accepts sort_by and sort_dir parameters from VoterSearchBody
- Dynamic cursor encoding: cursor encodes sort_column_value|id (not just created_at|id)
- When sort_by=last_name, cursor becomes 'Smith|uuid' — handles any sortable column

### Error handling
- Toast notification for POST validation errors (matches existing pattern)
- Keep previous results visible during error state (TanStack Query keepPreviousData)
- Filter panel stays open so user can fix the value

### E2E validation scope
- 4 Playwright E2E test scenarios:
  1. Propensity range filter — set sliders, verify only matching voters shown
  2. Demographic multi-select — select ethnicity/language/military checkboxes, verify results
  3. Mailing address filters — enter city/state/zip, verify exact-match filtering
  4. Combined filter — new filters alongside legacy (party + propensity + ethnicity), verify AND logic
- Dual test data approach: create test voters with known values AND validate against seed data for regression detection
- Verify HTTP method: Playwright intercepts network requests to confirm POST is used
- Separate Playwright E2E test confirming GET /voters still works for legacy API consumers

### Migration sequencing
- Plan 1: Backend (VoterSearchBody, sort support in search_voters, dynamic cursor, POST endpoint update)
- Plan 2: Frontend (hooks, page components, type cleanup, useVotersQuery/useSearchVoters deletion)
- Plan 3: E2E tests (Playwright tests for all 4 scenarios + GET backward compat test)

### Claude's Discretion
- Cache key strategy for TanStack Query (whether to include HTTP method indicator)
- Exact whitelist of sortable columns
- Dynamic cursor encoding implementation details
- Test file organization and naming

</decisions>

<specifics>
## Specific Ideas

- The root cause (from milestone audit BREAK 1) is that GET /voters accepts only 7 hardcoded Query params while VoterFilter has 32 fields — new fields silently dropped
- useSearchVoters mutation existed but was orphaned — never wired to any page
- Sorting has never actually worked on the voter list — frontend sends sort_by/sort_dir but they're silently ignored by both GET endpoint and search_voters method
- Dynamic voter lists (GET /lists/{id}/members) use a separate code path — unaffected by Phase 27 changes

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VoterFilter` Pydantic schema (`app/schemas/voter_filter.py`): 32 fields, fully functional — used as-is inside VoterSearchBody
- `build_voter_query()` (`app/services/voter.py`): All 32 filter conditions implemented — no filter logic changes needed
- `search_voters()` (`app/services/voter.py:220`): Needs sort_by/sort_dir params and dynamic cursor encoding
- `POST /voters/search` endpoint (`app/api/v1/voters.py:64`): Already exists, needs VoterSearchBody update
- `useVoters` infinite scroll hook (`web/src/hooks/useVoters.ts:6`): Used by AddVotersDialog — migrate to POST
- `useVotersQuery` hook (`web/src/hooks/useVoters.ts:114`): Used by voter list page — delete and replace
- `useSearchVoters` mutation hook (`web/src/hooks/useVoters.ts:167`): Orphaned — delete
- `VoterFilterBuilder` component (`web/src/components/voters/VoterFilterBuilder.tsx`): onChange contract stays VoterFilter
- `VoterSearchRequest` TS type (`web/src/types/voter.ts:165`): Broken envelope — delete

### Established Patterns
- TanStack Query useQuery for data fetching, useMutation for side effects
- Toast notifications via sonner for error feedback
- Cursor-based pagination with `created_at|id` encoding (needs dynamic sort column support)
- `keepPreviousData` pattern for smooth filter transitions

### Integration Points
- Voter list page (`web/src/routes/campaigns/$campaignId/voters/index.tsx`): Primary consumer — migrates to new hook
- AddVotersDialog (`web/src/components/voters/AddVotersDialog.tsx`): Uses useVoters infinite scroll — migrates to POST
- VoterFilterBuilder onChange → voter list page → new hook → POST /voters/search → search_voters → build_voter_query

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-wire-advanced-filters-to-backend*
*Context gathered: 2026-03-15*
