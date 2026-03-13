# Phase 22: Final Integration Fixes - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Close final integration gaps from v1.2 milestone audit: resolve `claimed_by` UUID display in call list detail page, and add RequireRole gates on DNC management mutation buttons. Requirements: PHON-05, INFR-01, CALL-07.

Excluded: no new features, no new pages, no new API endpoints. Pure frontend display fix and permission gating.

</domain>

<decisions>
## Implementation Decisions

### Claimed-by name resolution
- Use `useMembers(campaignId)` + `membersById` lookup via `useMemo` — same pattern as Phase 20's caller display
- Display format: member display name + small role badge (admin, manager, volunteer) — consistent with Phase 20 caller tables
- Fallback when `claimed_by` UUID doesn't match any current member: truncated UUID (first 12 chars + "…") — matches Phase 20 fallback exactly
- Unclaimed entries continue to show "—" (existing behavior)

### DNC RequireRole gates
- Each mutation button wrapped individually with `<RequireRole minimum="manager">`
- Header buttons: Add Number and Import from file each get their own RequireRole wrapper
- Per-row Remove: wrapped with RequireRole inside the cell renderer
- Remove column hidden entirely for non-managers — column only included in ColumnDef array when user has manager+ role
- Matches Phase 12 principle: "users simply don't see what they can't do"

### Claude's Discretion
- Exact role badge styling in claimed_by column (reuse StatusBadge or inline badge)
- How to conditionally include the Remove column (usePermissions check in column array vs RequireRole in cell)
- Whether to extract membersById into a shared utility or keep it inline

</decisions>

<specifics>
## Specific Ideas

- Claimed-by display should match Phase 20's caller tables exactly — name prominent, role as a small badge
- DNC table for viewers shows 3 columns (Phone, Reason, Date Added); managers see 4 (+ Remove)
- membersById lookup pattern: `useMemo(() => new Map(members.map(m => [m.user_id, m])), [members])`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useMembers(campaignId)` hook: returns `PaginatedResponse<CampaignMember>` with user_id, display_name, email, role
- `RequireRole` component: `<RequireRole minimum="manager">` hides children for insufficient roles
- `usePermissions()` hook: exposes `hasRole(minimum)` for conditional logic (useful for column array filtering)
- `StatusBadge` component: can be reused for role badges (or use inline badge matching Phase 20)
- Phase 20's `membersById` pattern in `sessions/$sessionId/index.tsx`: reference implementation

### Established Patterns
- `membersById` lookup: `useMemo(() => new Map(...), [members])` with ID substring fallback — Phase 18 (volunteersById) and Phase 20 (callers)
- `RequireRole` wrapping individual buttons: used in call list detail (+ Add Targets button, line 251)
- Column conditional inclusion: can use `usePermissions().hasRole('manager')` to filter ColumnDef array

### Integration Points
- `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.tsx` line 206-211: claimed_by column cell renderer — replace raw UUID with membersById lookup + role badge
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx` line 167-169: Add Number + Import buttons — wrap with RequireRole
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx` line 136-141: per-row Remove button — wrap with RequireRole, hide column for non-managers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-final-integration-fixes*
*Context gathered: 2026-03-13*
