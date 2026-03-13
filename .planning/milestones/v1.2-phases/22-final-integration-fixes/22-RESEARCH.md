# Phase 22: Final Integration Fixes - Research

**Researched:** 2026-03-13
**Domain:** React frontend -- display fix (UUID-to-name resolution) + permission gating (RequireRole)
**Confidence:** HIGH

## Summary

Phase 22 closes two specific integration gaps identified in the v1.2 milestone audit (INT-01 and INT-02). Both fixes are minimal, well-scoped frontend changes that follow established patterns already proven in this codebase. No new libraries, no new API endpoints, no architectural changes.

**INT-01** (P1-display): The call list detail page (`$callListId.tsx`) renders `claimed_by` as a raw UUID string. The fix applies the exact `useMembers` + `membersById` lookup pattern already used in Phase 20's session detail page (`sessions/$sessionId/index.tsx`), with name display + role badge and a truncated-UUID fallback.

**INT-02** (P2-auth): The DNC management page (`dnc/index.tsx`) has no permission gating on mutation buttons (Add Number, Import, Remove). The fix wraps each button with `<RequireRole minimum="manager">` and conditionally hides the Remove column for non-managers, following the established Phase 12 principle of "users don't see what they can't do."

**Primary recommendation:** Follow the reference implementations exactly -- `sessions/$sessionId/index.tsx` for membersById pattern, and the existing RequireRole usage in `$callListId.tsx` line 251 for gating pattern. Two files changed, zero new files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `useMembers(campaignId)` + `membersById` lookup via `useMemo` -- same pattern as Phase 20's caller display
- Display format: member display name + small role badge (admin, manager, volunteer) -- consistent with Phase 20 caller tables
- Fallback when `claimed_by` UUID doesn't match any current member: truncated UUID (first 12 chars + "...") -- matches Phase 20 fallback exactly
- Unclaimed entries continue to show "--" (existing behavior)
- Each DNC mutation button wrapped individually with `<RequireRole minimum="manager">`
- Header buttons: Add Number and Import from file each get their own RequireRole wrapper
- Per-row Remove: wrapped with RequireRole inside the cell renderer
- Remove column hidden entirely for non-managers -- column only included in ColumnDef array when user has manager+ role
- Matches Phase 12 principle: "users simply don't see what they can't do"

### Claude's Discretion
- Exact role badge styling in claimed_by column (reuse StatusBadge or inline badge)
- How to conditionally include the Remove column (usePermissions check in column array vs RequireRole in cell)
- Whether to extract membersById into a shared utility or keep it inline

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHON-05 | User can use the active calling screen to claim and call voters sequentially | INT-01 fix: `claimed_by` column in call list detail shows member names, making the caller assignment visible and meaningful for the calling workflow |
| INFR-01 | UI shows/hides actions based on user's campaign role (permission-gated) | INT-02 fix: DNC mutation buttons gated with `RequireRole minimum="manager"`, closing the one remaining ungated page |
| CALL-07 | User can remove a number from the DNC list | INT-02 fix: Remove button gated behind manager+ role, ensuring only authorized users can modify DNC list |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Purpose | Relevant Import |
|---------|---------|-----------------|
| `useMembers` | Fetch campaign members for name resolution | `@/hooks/useMembers` |
| `RequireRole` | Declarative role gating component | `@/components/shared/RequireRole` |
| `usePermissions` | Imperative role check hook | `@/hooks/usePermissions` |
| `StatusBadge` | Role badge display (reuse for claimed_by column) | `@/components/shared/StatusBadge` |
| `useMemo` | Memoize membersById Map | React built-in |

### Alternatives Considered
None applicable. All tools are already in the codebase and proven.

**Installation:** None required. Zero new dependencies.

## Architecture Patterns

### Pattern 1: membersById Lookup (INT-01 fix)

**What:** Fetch all campaign members via `useMembers(campaignId)`, build a `Map<string, CampaignMember>` keyed by `user_id`, then look up UUIDs in column cell renderers.

**When to use:** Any time a backend response contains a `user_id` UUID that needs human-readable display.

**Reference implementation:** `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` lines 731-739

```typescript
// Source: sessions/$sessionId/index.tsx (Phase 20 -- verified in codebase)
import { useMembers } from "@/hooks/useMembers"
import type { CampaignMember } from "@/types/campaign"

// In component body:
const { data: membersData } = useMembers(campaignId)

const membersById = useMemo(() => {
  const map = new Map<string, CampaignMember>()
  for (const m of membersData?.items ?? []) {
    map.set(m.user_id, m)
  }
  return map
}, [membersData])
```

**Name resolution with fallback:**
```typescript
// Source: sessions/$sessionId/index.tsx lines 82-88
function resolveCallerName(
  membersById: Map<string, CampaignMember>,
  userId: string,
): string {
  const member = membersById.get(userId)
  return member ? member.display_name : `${userId.slice(0, 12)}...`
}
```

**Role badge display:**
```typescript
// Source: sessions/$sessionId/index.tsx lines 73-80
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

// In JSX:
{resolveCallerRole(membersById, caller.user_id) && (
  <StatusBadge
    status={resolveCallerRole(membersById, caller.user_id)!}
    variant={roleVariant[resolveCallerRole(membersById, caller.user_id)!] ?? "default"}
  />
)}
```

### Pattern 2: RequireRole Wrapping (INT-02 fix)

**What:** Wrap mutation UI elements with `<RequireRole minimum="manager">` to hide them from viewers/volunteers.

**Reference implementation:** `$callListId.tsx` line 251 (already in the same file family)

```typescript
// Source: $callListId.tsx lines 251-255 (verified in codebase)
<RequireRole minimum="manager">
  <Button size="sm" onClick={() => setAddTargetsOpen(true)}>
    + Add Targets
  </Button>
</RequireRole>
```

### Pattern 3: Conditional Column Inclusion (INT-02 Remove column)

**What:** Use `usePermissions().hasRole('manager')` to conditionally include a column in the ColumnDef array, so the entire column (including header) is absent for non-managers.

**Recommendation (Claude's discretion):** Use `usePermissions` at the component level, then `.filter(Boolean)` on the columns array. This is cleaner than wrapping each cell with RequireRole because it removes the column header too.

```typescript
// Recommended pattern:
const { hasRole } = usePermissions()
const isManager = hasRole("manager")

const columns: ColumnDef<DNCEntry>[] = [
  // ...always-visible columns...
  isManager && {
    id: "actions",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => handleRemove(row.original.id)}
      >
        Remove
      </Button>
    ),
  },
].filter(Boolean) as ColumnDef<DNCEntry>[]
```

### Anti-Patterns to Avoid
- **Do NOT disable buttons instead of hiding them:** CONTEXT.md explicitly states "users simply don't see what they can't do" (Phase 12 principle). Never use `disabled` for permission gating.
- **Do NOT create new helper files for membersById:** The pattern is 5 lines of useMemo. Keep it inline in the component (or copy the `resolveCallerName`/`resolveCallerRole` helpers as local functions). Extracting to a shared module adds complexity for a pattern used in only 2 files.
- **Do NOT call useMembers conditionally:** React rules of hooks require it to be called unconditionally at the top level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID-to-name mapping | Custom API endpoint for enriched entries | `useMembers` + client-side Map | Pattern already established; backend doesn't need enrichment for this field |
| Role-based UI gating | Custom permission checks per button | `RequireRole` component + `usePermissions` hook | Shared infrastructure from Phase 12, already used in 29 files |
| Role badge rendering | Custom badge component | `StatusBadge` with `roleVariant` map | Exact pattern from Phase 20 session detail |

**Key insight:** Both fixes are purely additive to existing files using existing patterns. The Phase 20 session detail page is the exact template for INT-01, and the existing `$callListId.tsx` RequireRole usage at line 251 is the exact template for INT-02.

## Common Pitfalls

### Pitfall 1: useMembers returns paginated response
**What goes wrong:** Accessing `membersData` directly instead of `membersData?.items`
**Why it happens:** `useMembers` returns `PaginatedResponse<CampaignMember>` not `CampaignMember[]`
**How to avoid:** Always use `membersData?.items ?? []` with optional chaining
**Warning signs:** Empty Map even when members exist; TypeScript error on `.map()`

### Pitfall 2: claimed_by is nullable
**What goes wrong:** Calling `membersById.get(null)` or showing "undefined..." for unclaimed entries
**Why it happens:** `CallListEntry.claimed_by` is `string | null`. Unclaimed entries have `null`.
**How to avoid:** Guard with `row.original.claimed_by ? resolveCallerName(...) : "--"` before lookup
**Warning signs:** Entries with status "available" showing garbled text

### Pitfall 3: columns array type after filter(Boolean)
**What goes wrong:** TypeScript error because `filter(Boolean)` doesn't narrow `(false | ColumnDef)[]` to `ColumnDef[]`
**Why it happens:** TypeScript limitation with boolean filter
**How to avoid:** Cast with `as ColumnDef<DNCEntry>[]` after filter, or use explicit `.filter((c): c is ColumnDef<DNCEntry> => Boolean(c))`
**Warning signs:** Red squiggles on `columns` prop passed to DataTable

### Pitfall 4: RequireRole and usePermissions sharing role source
**What goes wrong:** Using RequireRole for header buttons but usePermissions for column array, potentially disagreeing on role
**Why it happens:** Both use the same hook internally, but if the hook somehow returns differently...
**How to avoid:** Both `RequireRole` and `usePermissions` call the same `usePermissions` hook internally. They will always agree. Safe to mix.
**Warning signs:** None expected -- this is a theoretical concern only.

### Pitfall 5: Existing DNC test file doesn't mock RequireRole
**What goes wrong:** After adding RequireRole imports to DNC page, existing tests may break because RequireRole calls usePermissions which calls useAuthStore
**Why it happens:** The existing `dnc/index.test.tsx` doesn't mock RequireRole or usePermissions
**How to avoid:** Add RequireRole mock to test file (same pattern as session detail test: lines 35-53)
**Warning signs:** Test failures with "Cannot read properties of undefined" from useAuthStore

## Code Examples

### INT-01: claimed_by Column Fix (callListId.tsx)

New imports needed:
```typescript
// Add to existing imports:
import { useMemo } from "react"
import { useMembers } from "@/hooks/useMembers"
import type { CampaignMember } from "@/types/campaign"
```

Add to `CallListDetailPage` component body (after `useCallListEntries`):
```typescript
const { data: membersData } = useMembers(campaignId)

const membersById = useMemo(() => {
  const map = new Map<string, CampaignMember>()
  for (const m of membersData?.items ?? []) {
    map.set(m.user_id, m)
  }
  return map
}, [membersData])
```

Role variant map (local to file, matching Phase 20):
```typescript
type StatusVariant = "default" | "success" | "warning" | "error" | "info"
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}
```

Updated column definition (replaces lines 203-211):
```typescript
{
  id: "assigned_caller",
  header: "Assigned Caller",
  cell: ({ row }) => {
    const claimedBy = row.original.claimed_by
    if (!claimedBy) {
      return <span className="text-muted-foreground">--</span>
    }
    const member = membersById.get(claimedBy)
    if (!member) {
      return (
        <span className="text-muted-foreground">
          {claimedBy.slice(0, 12)}...
        </span>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <span>{member.display_name}</span>
        <StatusBadge
          status={member.role}
          variant={roleVariant[member.role] ?? "default"}
        />
      </div>
    )
  },
},
```

### INT-02: DNC RequireRole Gates (dnc/index.tsx)

New imports needed:
```typescript
// Add to existing imports:
import { RequireRole } from "@/components/shared/RequireRole"
import { usePermissions } from "@/hooks/usePermissions"
```

Header buttons (wrap existing buttons, lines 167-171):
```typescript
<RequireRole minimum="manager">
  <Button onClick={() => setAddOpen(true)}>Add Number</Button>
</RequireRole>
<RequireRole minimum="manager">
  <Button variant="outline" onClick={() => setImportOpen(true)}>
    Import from file
  </Button>
</RequireRole>
```

Column array with conditional Remove column:
```typescript
const { hasRole } = usePermissions()
const isManager = hasRole("manager")

const columns: ColumnDef<DNCEntry>[] = [
  // ...phone, reason, date columns unchanged...
  ...(isManager
    ? [{
        id: "actions",
        cell: ({ row }: { row: { original: DNCEntry } }) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => handleRemove(row.original.id)}
          >
            Remove
          </Button>
        ),
      }]
    : []),
] as ColumnDef<DNCEntry>[]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw UUID in claimed_by column | membersById lookup with name + role badge | Phase 22 (this phase) | User can identify callers by name |
| No permission gates on DNC page | RequireRole on all mutation buttons | Phase 22 (this phase) | Viewers/volunteers can't modify DNC list |

**No deprecated patterns involved.** All patterns used here are current project standards.

## Open Questions

1. **membersById as shared utility?**
   - What we know: Pattern is used in 3 places (session detail, shift detail, now call list detail)
   - What's unclear: Whether extracting to `useMembersById(campaignId)` hook is worthwhile
   - Recommendation: **Keep inline** for this phase. Three usages doesn't justify extraction. If a fourth appears, refactor then. (Claude's discretion area -- choosing simplicity.)

2. **INT-03 and INT-04 from audit?**
   - What we know: Phase 22 scope explicitly covers INT-01 and INT-02 only
   - What's unclear: Whether INT-03 (calling screen RequireRole) and INT-04 (vestigial useReassignEntry) should be addressed
   - Recommendation: Out of scope per CONTEXT.md. INT-03 is P3-low (backend enforces), INT-04 is P4-cosmetic.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react (happy-dom) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose {testfile}` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHON-05 (INT-01) | claimed_by shows member name + role badge, fallback to truncated UUID, unclaimed shows "--" | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/call-lists/\$callListId.test.tsx -x` | No -- Wave 0 |
| INFR-01 (INT-02) | DNC mutation buttons hidden for non-manager roles | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | Yes (needs update) |
| CALL-07 (INT-02) | Remove column absent for non-managers, present for managers | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/dnc/index.test.tsx -x` | Yes (needs update) |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run {changed-test-file} -x`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx` -- new file covering PHON-05 (INT-01): membersById name resolution, role badge, truncated UUID fallback, unclaimed dash
- [ ] Update `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` -- add RequireRole mock, add tests for: buttons hidden when viewer role, buttons visible when manager role, Remove column absent for viewer, Remove column present for manager

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `sessions/$sessionId/index.tsx` (Phase 20 membersById reference)
- Codebase inspection: `$callListId.tsx` (current state, line 203-211 claimed_by column)
- Codebase inspection: `dnc/index.tsx` (current state, no RequireRole imports)
- Codebase inspection: `RequireRole.tsx` (component API: minimum, children, fallback)
- Codebase inspection: `usePermissions.ts` (hook API: role, hasRole)
- Codebase inspection: `useMembers.ts` (returns PaginatedResponse<CampaignMember>)
- Codebase inspection: `call-list.ts` types (CallListEntry.claimed_by: string | null)
- Codebase inspection: `dnc.ts` types (DNCEntry interface)
- Codebase inspection: `dnc/index.test.tsx` (existing test patterns, no RequireRole mock)
- Codebase inspection: `sessions/$sessionId/index.test.tsx` (RequireRole mock pattern)

### Secondary (MEDIUM confidence)
- `.planning/v1.2-MILESTONE-AUDIT.md` (INT-01, INT-02 gap descriptions)
- `.planning/phases/22-final-integration-fixes/22-CONTEXT.md` (locked decisions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components/hooks already exist and are verified in codebase
- Architecture: HIGH -- exact reference implementations exist in Phase 20 and Phase 12
- Pitfalls: HIGH -- identified from direct code inspection and type analysis
- Validation: HIGH -- existing test file for DNC, session detail test provides mock patterns

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependencies, all internal patterns)
