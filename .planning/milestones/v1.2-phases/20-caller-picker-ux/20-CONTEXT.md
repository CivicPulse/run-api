# Phase 20: Caller Picker UX - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace raw ZITADEL user ID input in AddCallerDialog with a searchable member picker, and display member names instead of truncated UUIDs in callers tables. Resolves PHON-03 integration gap.

Excluded: multi-caller bulk assignment, volunteer (non-member) picker, new API endpoints.

</domain>

<decisions>
## Implementation Decisions

### Picker interaction style
- Combobox with type-to-search using shadcn Popover + Command pattern
- Search matches on both display_name and email (client-side filter)
- Each option shows: display name + role badge (admin, manager, volunteer)
- One caller added at a time — select member, click Add, dialog closes (matches existing API: one user_id per call)

### Already-assigned handling
- Already-assigned callers hidden from the combobox list entirely
- When all campaign members are assigned, combobox shows "All campaign members are already assigned" — Add button stays disabled
- Removed callers reappear in picker immediately via existing TanStack Query invalidation (useSessionCallers cache invalidation already in place)

### Caller display format
- Both Overview tab callers table and Progress tab callers table show display name + role badge instead of truncated UUID
- Name resolution via membersById lookup (useMemo on useMembers) — follows Phase 18 volunteersById pattern exactly
- Fallback: truncated UUID (first 12 chars + "…") when caller's user_id doesn't match any current member

### Claude's Discretion
- Exact combobox styling and spacing
- Loading state while members query loads in the picker
- Whether to install shadcn Command component or use existing Popover + inline search

</decisions>

<specifics>
## Specific Ideas

- Picker options styled like campaign settings members list — name prominent, role as a small badge
- Consistent name + role display across Overview callers table and Progress tab callers table
- membersById lookup pattern mirrors volunteersById from Phase 18 shift management

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useMembers(campaignId)` hook: returns `PaginatedResponse<CampaignMember>` with user_id, display_name, email, role — primary data source for picker
- `useSessionCallers(campaignId, sessionId)` hook: returns `SessionCaller[]` — used to compute already-assigned set for filtering
- `CampaignMember` type: { user_id, display_name, email, role, synced_at } in `web/src/types/campaign.ts`
- `StatusBadge` component: reuse or adapt for role badges
- Phase 18's `volunteersById` lookup pattern: `useMemo` on list query to create ID→name Map with ID substring fallback

### Established Patterns
- Popover + Command: shadcn combobox pattern (may need to install Command component)
- membersById lookup: `useMemo(() => new Map(members.map(m => [m.user_id, m])), [members])` — consistent with Phase 18 volunteersById
- Query invalidation: useAssignCaller and useRemoveCaller already invalidate sessionKeys.callers — picker list recomputes automatically
- RequireRole: callers section is manager+ only — picker inherits this gate

### Integration Points
- AddCallerDialog (lines 78-150 of sessions/$sessionId/index.tsx): replace Input with Combobox, pass selectedUserId to existing useAssignCaller mutation
- Overview tab callers table (lines 326-377): replace `caller.user_id.slice(0, 12)…` with membersById lookup
- Progress tab callers table (lines 520-526): same membersById lookup for caller name display

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 20-caller-picker-ux*
*Context gathered: 2026-03-12*
