# Phase 21: Integration Polish - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Close remaining integration display gaps from v1.2 final audit: show DNC reason in the DNC table, resolve call list names in all session views instead of showing truncated UUIDs, and add a reason selector to the DNC bulk import dialog. Requirements: CALL-06, PHON-05, PHON-07.

Excluded: no new features, no new pages, no new API endpoints beyond enhancing existing session response schema.

</domain>

<decisions>
## Implementation Decisions

### DNC Reason Column
- Human-readable labels: `refused` → "Refused", `voter_request` → "Voter Request", `registry_import` → "Registry Import", `manual` → "Manual"
- Plain text display (not StatusBadge chips) — consistent with Date Added column styling
- Column order: Phone Number | **Reason** | Date Added | Remove action
- REASON_LABELS Record maps backend enum values to display strings

### DNC Search Enhancement
- Extend existing client-side search to match both phone number AND reason text
- Typing "refused" filters to show all entries with reason "Refused"
- Typing a phone number continues to work as before (strips non-digits for comparison)

### DNC Import Reason Selector
- Add a reason dropdown to the import dialog: Voter Request | Registry Import | Manual (default)
- "Refused" excluded from import options — that reason is auto-applied by the system on call refusal
- Dropdown placed between file input and Import button
- Backend import endpoint accepts optional `reason` parameter (defaults to "manual" if omitted)

### Call List Name Resolution
- **Backend response enhancement**: add `call_list_name: str | None` to PhoneBankSession response schema
- Endpoint layer joins call_list table to populate name (not service layer — consistent with Phase 16 caller_count pattern)
- Applied to all three session views: sessions index, My Sessions, session detail Overview tab
- PhoneBankSession TypeScript type updated to include `call_list_name: string | null`

### Call List Name Display
- Name rendered as a clickable Link to `/phone-banking/call-lists/$callListId`
- Fallback when call list deleted: show muted "Deleted list" text (not truncated UUID)
- Link styling: `font-medium hover:underline` — consistent with session name and voter name links

### Claude's Discretion
- Exact muted styling for "Deleted list" fallback text
- Whether to add `call_list_name` to the session list endpoint query or compute it per-session
- Backend join approach (subquery, LEFT JOIN, or post-fetch lookup)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DNCEntry` type (`web/src/types/dnc.ts`): already has `reason: string` field — no type changes needed
- `DNCReason` enum (`app/models/dnc.py`): REFUSED, VOTER_REQUEST, REGISTRY_IMPORT, MANUAL
- `useCallLists` hook: available for testing but not needed for resolution (backend approach chosen)
- `StatusBadge` component: available but not chosen for reason display (plain text preferred)
- `DataTable` component: DNC table uses it with client-side filtering (no pagination)

### Established Patterns
- `caller_count` in Phase 16: populated at endpoint layer via batch query — same pattern for `call_list_name`
- `volunteersById` lookup in Phase 18: useMemo Map pattern — similar fallback approach for deleted items
- `REASON_LABELS` Record pattern: matches `STATUS_LABELS` Record from Phase 15 call list statuses
- Client-side search in DNC page: strips non-digit chars for phone comparison — extend to also match reason text

### Integration Points
- `app/api/v1/phone_bank.py`: session list and detail endpoints need call_list_name population
- `app/schemas/phone_bank.py`: PhoneBankSessionResponse needs `call_list_name` field
- `web/src/types/phone-bank-session.ts`: PhoneBankSession interface needs `call_list_name` field
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx`: add reason column + extend search
- `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx`: replace UUID with name link
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx`: replace UUID with name link in OverviewTab
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx`: replace UUID with name link (bonus)

</code_context>

<specifics>
## Specific Ideas

- REASON_LABELS Record for DNC display: `{ refused: "Refused", voter_request: "Voter Request", registry_import: "Registry Import", manual: "Manual" }`
- Import dialog reason selector excludes "Refused" since that's system-assigned on call refusal outcomes
- "Deleted list" as fallback text matches the user's mental model better than a cryptic UUID fragment

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-integration-polish*
*Context gathered: 2026-03-12*
