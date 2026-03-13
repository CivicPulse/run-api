# Phase 21: Integration Polish - Research

**Researched:** 2026-03-12
**Domain:** Frontend display polish (DataTable columns, label mapping, backend response enrichment)
**Confidence:** HIGH

## Summary

Phase 21 closes three integration display gaps identified in the v1.2 final audit. The work spans two distinct domains: (1) DNC table enhancements (reason column, search extension, import reason selector) and (2) call list name resolution in phone bank session views (backend schema enrichment + frontend display updates).

The codebase is mature with well-established patterns for every change needed. The DNC table already has `reason` data flowing from backend through frontend types -- it just needs a column definition and label mapping. The session views already show call list references via `call_list_id` -- they need the backend to include `call_list_name` in the response so the frontend can display a human-readable name with a link. The import dialog needs a reason dropdown and the backend import endpoint needs an optional `reason` query parameter.

**Primary recommendation:** Follow the existing caller_count endpoint-layer enrichment pattern for call_list_name, and follow the STATUS_LABELS Record pattern for REASON_LABELS. All changes are well-scoped additions to existing code -- no new files, no new routes, no new pages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- DNC Reason Column: Human-readable labels via REASON_LABELS Record, plain text display (not StatusBadge), column order: Phone Number | Reason | Date Added | Remove action
- DNC Search Enhancement: Extend client-side search to match both phone number AND reason text
- DNC Import Reason Selector: Add reason dropdown (Voter Request | Registry Import | Manual), "Refused" excluded from import options, dropdown between file input and Import button, backend accepts optional `reason` parameter
- Call List Name Resolution: Backend response enhancement with `call_list_name: str | None` on PhoneBankSessionResponse, endpoint layer joins (not service layer), applied to all three session views
- Call List Name Display: Clickable Link to call list detail, fallback "Deleted list" muted text, `font-medium hover:underline` link styling

### Claude's Discretion
- Exact muted styling for "Deleted list" fallback text
- Whether to add `call_list_name` to session list endpoint query or compute per-session
- Backend join approach (subquery, LEFT JOIN, or post-fetch lookup)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CALL-06 | User can bulk import DNC numbers from a file | DNC import dialog gains reason selector; backend import endpoint accepts optional reason parameter; REASON_LABELS display in DNC table |
| PHON-05 | User can use the active calling screen to claim and call voters sequentially | Session views display call list name instead of truncated UUID for context |
| PHON-07 | User can record call outcomes with quick-select buttons | Session detail Overview tab shows call list name link for navigation context |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2 | UI framework | Already installed |
| TanStack React Table | 8.21 | DataTable column definitions | Already used for DNC and session tables |
| TanStack React Router | 1.159 | Link component for call list navigation | Already used throughout |
| FastAPI | current | Backend API framework | Already installed |
| SQLAlchemy | async | Database ORM for LEFT JOIN | Already used in phone_banks.py endpoint |
| Pydantic | v2 | Schema validation | Already used for PhoneBankSessionResponse |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix UI Select | current | Import reason dropdown | Already installed, used in SessionDialog |
| ky | 1.14 | HTTP client (api calls) | Already used in all hooks |
| Vitest | current | Unit testing | Already configured |
| Playwright | current | E2E testing | Already configured |

### Alternatives Considered
None -- all libraries are already installed and in active use. No new dependencies needed.

## Architecture Patterns

### Pattern 1: REASON_LABELS Record (matching STATUS_LABELS)
**What:** A const Record mapping backend enum values to human-readable display strings
**When to use:** Displaying DNC reason in the table and filtering by reason text
**Example:**
```typescript
// Source: existing pattern in call-lists/$callListId.tsx (STATUS_LABELS)
const REASON_LABELS: Record<string, string> = {
  refused: "Refused",
  voter_request: "Voter Request",
  registry_import: "Registry Import",
  manual: "Manual",
}
```

### Pattern 2: Endpoint-Layer Enrichment (matching caller_count)
**What:** Batch-fetch related data at the API endpoint layer, enriching the response before returning
**When to use:** Adding `call_list_name` to PhoneBankSessionResponse without changing the service layer
**Example:**
```python
# Source: existing pattern in phone_banks.py list_sessions endpoint (caller_counts)
# After fetching sessions, batch-lookup call list names
call_list_ids = list({s.call_list_id for s in sessions})
if call_list_ids:
    names_result = await db.execute(
        select(CallList.id, CallList.name)
        .where(CallList.id.in_(call_list_ids))
    )
    call_list_names = dict(names_result.all())

# Then set call_list_name=call_list_names.get(s.call_list_id) per session
```

### Pattern 3: Client-Side Search Extension
**What:** Extend existing filter predicate to match additional fields
**When to use:** DNC search matching both phone number AND reason label
**Example:**
```typescript
// Source: existing pattern in dnc/index.tsx
const filteredEntries = search
  ? entries.filter(e => {
      const normalizedSearch = search.toLowerCase()
      const phoneMatch = e.phone_number.includes(search.replace(/\D/g, ""))
      const reasonLabel = REASON_LABELS[e.reason] ?? e.reason
      const reasonMatch = reasonLabel.toLowerCase().includes(normalizedSearch)
      return phoneMatch || reasonMatch
    })
  : entries
```

### Pattern 4: Clickable Name Link with Fallback
**What:** Render a linked name when data exists, muted fallback text when not
**When to use:** Displaying call list name in session tables
**Example:**
```typescript
// Source: existing link pattern in sessions/index.tsx (session name column)
cell: ({ row }) => {
  const name = row.original.call_list_name
  if (!name) {
    return <span className="text-sm text-muted-foreground">Deleted list</span>
  }
  return (
    <Link
      to="/campaigns/$campaignId/phone-banking/call-lists/$callListId"
      params={{ campaignId, callListId: row.original.call_list_id }}
      className="font-medium hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </Link>
  )
}
```

### Pattern 5: Form Data with Query Parameter for Import
**What:** Pass the reason as a query parameter alongside the multipart file upload
**When to use:** DNC import with user-selected reason
**Example:**
```typescript
// Source: existing useImportDNC pattern in useDNC.ts
mutationFn: ({ file, reason }: { file: File; reason: string }) => {
  const formData = new FormData()
  formData.append("file", file)
  return api.post(`api/v1/campaigns/${campaignId}/dnc/import`, {
    body: formData,
    searchParams: { reason },
  }).json<DNCImportResult>()
}
```

### Anti-Patterns to Avoid
- **Frontend-only call list name resolution via separate queries:** The sessions index page already uses this approach (`callListsById` from `useCallLists`), but it fails for deleted lists and adds an extra query. The backend approach is more reliable.
- **Adding call_list_name to the service layer:** Keep service returning plain model objects (established Phase 15 and 16 decision). Enrichment belongs in the endpoint layer.
- **Using StatusBadge for DNC reason:** CONTEXT.md explicitly locks plain text display for consistency with the Date Added column.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown for reason selection | Custom dropdown | Radix UI Select (already installed) | Consistent with SessionDialog call list selector |
| DNC reason mapping | Inline conditionals/switch | REASON_LABELS const Record | Single source of truth, testable, matches STATUS_LABELS pattern |
| Call list name lookup | Frontend join via useCallLists | Backend endpoint-layer enrichment | Handles deleted lists, avoids extra query, consistent with caller_count pattern |

## Common Pitfalls

### Pitfall 1: Breaking the Import Hook Signature
**What goes wrong:** Changing `useImportDNC` from accepting a `File` to accepting `{ file, reason }` breaks the existing test
**Why it happens:** The hook currently uses `mutationFn: (file: File) =>` and the test calls `result.current.mutate(testFile)`
**How to avoid:** Update the test alongside the hook change. The new signature is `{ file: File; reason: string }`
**Warning signs:** Existing useDNC.test.ts import test fails

### Pitfall 2: Forgetting the Backend Import Reason Parameter
**What goes wrong:** Frontend sends reason but backend ignores it, all imports default to "registry_import"
**Why it happens:** The `bulk_import_dnc` endpoint currently passes only `csv_content` and `user.id` to the service. The reason from the request body is not forwarded.
**How to avoid:** Add `reason: str = Query(default="manual")` to the endpoint, pass it to `bulk_import()` as a default reason override
**Warning signs:** Imported entries all show "Registry Import" regardless of selection

### Pitfall 3: Session Detail Not Including call_list_name
**What goes wrong:** The session detail `get_session` endpoint returns `model_validate(pb_session)` directly, bypassing any enrichment
**Why it happens:** Only `list_sessions` has the enrichment pattern (caller_count). `get_session` does a plain validate.
**How to avoid:** Add call_list_name enrichment to both `list_sessions` AND `get_session` endpoints
**Warning signs:** Session detail Overview tab still shows truncated UUID

### Pitfall 4: Radix Select Requires Non-Empty String Values
**What goes wrong:** `<SelectItem value="">` is invalid in Radix UI
**Why it happens:** Radix SelectItem requires a non-empty string value
**How to avoid:** All reason options have valid enum string values ("voter_request", "registry_import", "manual") so this is not an issue as long as you don't add an empty "Select reason" placeholder item
**Warning signs:** Console error about empty SelectItem value

### Pitfall 5: PhoneBankSessionResponse Pydantic Field Default
**What goes wrong:** Adding `call_list_name: str | None` without a default causes validation errors when existing code doesn't provide it
**Why it happens:** `model_validate(pb_session)` from the ORM object won't have a `call_list_name` attribute
**How to avoid:** Define with default: `call_list_name: str | None = None`
**Warning signs:** 500 errors on session endpoints

## Code Examples

### DNC Reason Column Definition
```typescript
// Insert between phone_number and added_at columns
{
  accessorKey: "reason",
  header: "Reason",
  cell: ({ row }) => (
    <span className="text-sm">
      {REASON_LABELS[row.original.reason] ?? row.original.reason}
    </span>
  ),
}
```

### Backend PhoneBankSessionResponse Update
```python
# app/schemas/phone_bank.py
class PhoneBankSessionResponse(BaseSchema):
    id: uuid.UUID
    name: str
    status: str
    call_list_id: uuid.UUID
    call_list_name: str | None = None  # NEW: populated at endpoint layer
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    caller_count: int = 0
```

### Backend Endpoint Enrichment (list_sessions)
```python
# In list_sessions endpoint, after fetching sessions and caller_counts:
from app.models.call_list import CallList

# Batch-fetch call list names
call_list_ids = list({s.call_list_id for s in sessions})
call_list_names: dict[uuid.UUID, str] = {}
if call_list_ids:
    names_result = await db.execute(
        select(CallList.id, CallList.name)
        .where(CallList.id.in_(call_list_ids))
    )
    call_list_names = dict(names_result.all())

# Include in response construction
items = [
    PhoneBankSessionResponse(
        **{
            k: v
            for k, v in PhoneBankSessionResponse.model_validate(s).model_dump().items()
            if k not in ("caller_count", "call_list_name")
        },
        caller_count=caller_counts.get(s.id, 0),
        call_list_name=call_list_names.get(s.call_list_id),
    )
    for s in sessions
]
```

### Backend Endpoint Enrichment (get_session)
```python
# In get_session endpoint, after fetching pb_session:
from app.models.call_list import CallList

# Fetch call list name
cl_result = await db.execute(
    select(CallList.name).where(CallList.id == pb_session.call_list_id)
)
cl_name = cl_result.scalar_one_or_none()

response = PhoneBankSessionResponse.model_validate(pb_session)
response_dict = response.model_dump()
response_dict["call_list_name"] = cl_name
return PhoneBankSessionResponse(**response_dict)
```

### Import Endpoint with Reason Parameter
```python
# app/api/v1/dnc.py - bulk_import_dnc endpoint
@router.post(
    "/campaigns/{campaign_id}/dnc/import",
    response_model=DNCImportResponse,
)
async def bulk_import_dnc(
    campaign_id: uuid.UUID,
    file: UploadFile,
    reason: str = Query(default="manual"),  # NEW: reason override
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing code ...
    result = await _dnc_service.bulk_import(
        db, campaign_id, csv_content, user.id, default_reason=reason
    )
```

### DNC Service bulk_import with default_reason
```python
async def bulk_import(
    self,
    session: AsyncSession,
    campaign_id: uuid.UUID,
    csv_content: str,
    added_by: str,
    default_reason: str = "registry_import",  # NEW parameter
) -> DNCImportResponse:
    # ... existing code, but use default_reason:
    reason = row.get("reason", default_reason).strip()
```

### Import Dialog Reason Selector
```typescript
// Added between file input and Import button in the import dialog
<div className="space-y-2">
  <Label htmlFor="import-reason">Reason for all entries</Label>
  <Select value={importReason} onValueChange={setImportReason}>
    <SelectTrigger id="import-reason">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="voter_request">Voter Request</SelectItem>
      <SelectItem value="registry_import">Registry Import</SelectItem>
      <SelectItem value="manual">Manual</SelectItem>
    </SelectContent>
  </Select>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Frontend call list lookup via useCallLists | Backend `call_list_name` in response | Phase 21 | Handles deleted lists, removes extra frontend query |
| Truncated UUID for call lists | Human-readable name with link | Phase 21 | User can identify and navigate to call lists |
| No DNC reason display | REASON_LABELS column in DNC table | Phase 21 | User understands why each number was added |
| File-only DNC import | Import with reason selector | Phase 21 | User controls the reason applied to bulk entries |

## Open Questions

1. **Backend import reason: Query param vs Form field**
   - What we know: CONTEXT.md says "Backend import endpoint accepts optional `reason` parameter"
   - What's unclear: Whether to use a query parameter or a form field alongside the file upload
   - Recommendation: Use `Query(default="manual")` -- simpler than parsing multipart form with additional fields, and `ky` supports `searchParams` alongside `body: formData`. HIGH confidence this works.

2. **call_list_name in list vs detail**
   - What we know: Both list and detail endpoints need it. List uses batch-fetch pattern, detail does a single lookup.
   - What's unclear: Whether the existing response construction pattern in list_sessions needs refactoring for clarity
   - Recommendation: Follow the existing caller_count pattern exactly -- add call_list_name alongside it in the same comprehension. For get_session, add a single SELECT for the name.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (e2e) |
| Config file | `web/vitest.config.ts` / `web/playwright.config.ts` |
| Quick run command | `cd web && npx vitest run src/hooks/useDNC.test.ts --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-06 | DNC import with reason parameter | unit | `cd web && npx vitest run src/hooks/useDNC.test.ts -x` | Yes (needs update) |
| CALL-06 | DNC reason column displays in table | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | No (Wave 0) |
| PHON-05 | Session views show call list name | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | No (Wave 0) |
| PHON-07 | Session detail shows call list name link | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | No (Wave 0) |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/hooks/useDNC.test.ts -x`
- **Per wave merge:** `cd web && npx vitest run --reporter=verbose`
- **Phase gate:** Full Vitest suite green + Playwright e2e verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useDNC.test.ts` -- update existing import test for new `{ file, reason }` signature
- [ ] `web/e2e/phase21-integration-polish.spec.ts` -- covers CALL-06, PHON-05, PHON-07 visual verification

*(Existing useDNC.test.ts covers current hook behavior; needs test update for changed import signature)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all files listed in CONTEXT.md code_context section
- `app/models/dnc.py` -- DNCReason enum values confirmed: REFUSED, VOTER_REQUEST, REGISTRY_IMPORT, MANUAL
- `app/schemas/phone_bank.py` -- PhoneBankSessionResponse current schema (no call_list_name field)
- `app/api/v1/phone_banks.py` -- list_sessions caller_count enrichment pattern (lines 93-117)
- `app/api/v1/dnc.py` -- bulk_import_dnc endpoint (lines 79-99, no reason param currently)
- `app/services/dnc.py` -- bulk_import method (lines 72-138, uses row.get("reason", "registry_import"))
- `web/src/types/dnc.ts` -- DNCEntry type already has `reason: string`
- `web/src/hooks/useDNC.ts` -- useImportDNC currently accepts File, not { file, reason }
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx` -- current DNC table (no reason column)
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx` -- sessions page uses callListsById client-side lookup
- `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx` -- My Sessions shows UUID.slice(0,8)
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` -- Session detail shows UUID.slice(0,12)

### Secondary (MEDIUM confidence)
- None needed -- all findings verified against source code

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- every pattern already exists in the codebase (STATUS_LABELS, caller_count enrichment, client-side search)
- Pitfalls: HIGH -- identified from direct code inspection of current implementations

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- internal codebase polish, no external dependency concerns)
