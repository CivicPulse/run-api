# Phase 20: Caller Picker UX - Research

**Researched:** 2026-03-12
**Domain:** React UI - Combobox picker pattern, member name resolution
**Confidence:** HIGH

## Summary

This phase replaces the raw ZITADEL user ID text input in AddCallerDialog with a searchable member picker (Popover + Command combobox), and replaces truncated UUID displays with resolved member names + role badges in both the Overview and Progress tab caller tables. This is the final PHON-03 gap closure needed to complete all 60 v1.2 requirements.

The project already has all necessary infrastructure: the `Command` component (cmdk ^1.1.1) is installed and the shadcn wrapper is at `web/src/components/ui/command.tsx`, the `Popover` component exists at `web/src/components/ui/popover.tsx`, the `useMembers` hook returns `CampaignMember[]` with `user_id`, `display_name`, `email`, and `role`, and the `useSessionCallers` hook provides the already-assigned set. The Phase 18 `volunteersById` pattern provides a proven template for the `membersById` lookup. The `StatusBadge` component and `roleVariant` map from the members settings page provide the exact role badge rendering pattern.

**Primary recommendation:** Use the Popover + Command combobox pattern (no new dependencies needed), create a `membersById` useMemo lookup following the Phase 18 volunteersById pattern, and reuse the existing StatusBadge + roleVariant for role badges.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Combobox with type-to-search using shadcn Popover + Command pattern
- Search matches on both display_name and email (client-side filter)
- Each option shows: display name + role badge (admin, manager, volunteer)
- One caller added at a time -- select member, click Add, dialog closes (matches existing API: one user_id per call)
- Already-assigned callers hidden from the combobox list entirely
- When all campaign members are assigned, combobox shows "All campaign members are already assigned" -- Add button stays disabled
- Removed callers reappear in picker immediately via existing TanStack Query invalidation (useSessionCallers cache invalidation already in place)
- Both Overview tab callers table and Progress tab callers table show display name + role badge instead of truncated UUID
- Name resolution via membersById lookup (useMemo on useMembers) -- follows Phase 18 volunteersById pattern exactly
- Fallback: truncated UUID (first 12 chars + "...") when caller's user_id doesn't match any current member

### Claude's Discretion
- Exact combobox styling and spacing
- Loading state while members query loads in the picker
- Whether to install shadcn Command component or use existing Popover + inline search

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHON-03 | User can assign and remove callers to a session | Combobox picker replaces raw user ID input for assignment; remove flow unchanged; membersById lookup enables name display for both assignment and removal |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cmdk | ^1.1.1 | Command menu primitive for searchable list | Already installed; powers shadcn Command component |
| radix-ui (Popover) | Already installed | Popover container for combobox dropdown | Already installed; shadcn Popover wrapper exists |
| @tanstack/react-query | ^5.90.21 | Data fetching for members and callers | Already used throughout; useMembers and useSessionCallers hooks exist |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| StatusBadge | N/A (project component) | Role badge rendering | Used in combobox items and caller table rows |
| lucide-react | Already installed | Icons (Check, ChevronsUpDown, Search) | Combobox trigger and selection indicators |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Popover+Command combobox | Dialog with Input+scrollable list (AssignVolunteerDialog pattern from Phase 18) | The AssignVolunteerDialog uses Dialog+Input+radio buttons, which works but is heavier UI; Popover+Command is the CONTEXT.md locked decision and provides better inline UX |

**Installation:**
```bash
# No new packages needed -- cmdk, radix-ui Popover, and all shadcn wrappers already installed
```

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/
    index.tsx              # Modified: AddCallerDialog, OverviewTab, ProgressTab
  components/ui/
    command.tsx            # Existing: shadcn Command wrapper (no changes)
    popover.tsx            # Existing: shadcn Popover wrapper (no changes)
  hooks/
    useMembers.ts          # Existing: provides CampaignMember[] (no changes)
    usePhoneBankSessions.ts # Existing: provides SessionCaller[] (no changes)
```

### Pattern 1: Popover + Command Combobox
**What:** A combobox built by composing Popover (container) with Command (searchable list). The trigger button shows current selection or placeholder. Clicking opens a popover with CommandInput for search and CommandItems for options.
**When to use:** Selecting from a known list of items with search filtering.
**Example:**
```typescript
// Popover + Command combobox pattern (shadcn standard)
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

// Inside AddCallerDialog:
const [open, setOpen] = useState(false)
const [selectedUserId, setSelectedUserId] = useState("")

// Filter: hide already-assigned members
const assignedIds = new Set((callers ?? []).map(c => c.user_id))
const availableMembers = (members?.items ?? []).filter(m => !assignedIds.has(m.user_id))

<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" aria-expanded={open}>
      {selectedUserId
        ? members?.items.find(m => m.user_id === selectedUserId)?.display_name
        : "Select a member..."}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0">
    <Command>
      <CommandInput placeholder="Search by name or email..." />
      <CommandList>
        <CommandEmpty>
          {availableMembers.length === 0
            ? "All campaign members are already assigned"
            : "No members found"}
        </CommandEmpty>
        <CommandGroup>
          {availableMembers.map(member => (
            <CommandItem
              key={member.user_id}
              value={`${member.display_name} ${member.email}`}
              onSelect={() => {
                setSelectedUserId(member.user_id)
                setOpen(false)
              }}
            >
              <span>{member.display_name}</span>
              <StatusBadge status={member.role} variant={roleVariant[member.role] ?? "default"} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

### Pattern 2: membersById Lookup (follows Phase 18 volunteersById)
**What:** A useMemo-based Map that resolves user_id to CampaignMember for name display in tables. Falls back to truncated UUID when member not found.
**When to use:** Any table that displays caller user_ids.
**Example:**
```typescript
// Source: Phase 18 volunteersById pattern in shifts/$shiftId/index.tsx
const { data: membersData } = useMembers(campaignId)

const membersById = useMemo(() => {
  const map = new Map<string, CampaignMember>()
  for (const m of membersData?.items ?? []) {
    map.set(m.user_id, m)
  }
  return map
}, [membersData])

// Helper: resolve caller name
function resolveCallerName(userId: string): string {
  const member = membersById.get(userId)
  return member ? member.display_name : `${userId.slice(0, 12)}...`
}

// Helper: resolve caller role (for badge)
function resolveCallerRole(userId: string): string | null {
  return membersById.get(userId)?.role ?? null
}
```

### Pattern 3: Role Badge Rendering (from settings/members.tsx)
**What:** StatusBadge component with roleVariant map to render colored role badges.
**When to use:** Anywhere a campaign member role needs visual display.
**Example:**
```typescript
// Source: web/src/routes/campaigns/$campaignId/settings/members.tsx
type StatusVariant = "default" | "success" | "warning" | "error" | "info"

const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

// In table cell:
<td className="py-2">
  <div className="flex items-center gap-2">
    <span>{resolveCallerName(caller.user_id)}</span>
    {resolveCallerRole(caller.user_id) && (
      <StatusBadge
        status={resolveCallerRole(caller.user_id)!}
        variant={roleVariant[resolveCallerRole(caller.user_id)!] ?? "default"}
      />
    )}
  </div>
</td>
```

### Anti-Patterns to Avoid
- **Fetching members per-row:** Do NOT call useMembers inside each table row. Use a single useMembers call at the page level and pass membersById down.
- **Creating a new hook for member lookup:** The membersById pattern is a local useMemo, not a separate hook. Keep it simple.
- **Using the AssignVolunteerDialog pattern with radio buttons:** CONTEXT.md specifies Popover+Command combobox. Do not copy the Phase 18 Dialog+Input+radio pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Searchable dropdown | Custom search input + filtered div list | Popover + Command (cmdk) | cmdk handles keyboard navigation, ARIA, fuzzy matching, focus management |
| Role badge colors | Inline conditional classes | StatusBadge + roleVariant map | Already exists in members.tsx, consistent with settings page |
| Cache invalidation on assign/remove | Manual query cache manipulation | Existing useAssignCaller/useRemoveCaller invalidation | Hooks already invalidate sessionKeys.callers on success |
| Client-side member filtering | Custom string matching | cmdk's built-in filter via CommandItem value prop | cmdk does substring matching on the value prop automatically |

**Key insight:** cmdk's CommandItem `value` prop drives the built-in search filter. Setting `value={member.display_name + " " + member.email}` makes both name and email searchable automatically without custom filter logic.

## Common Pitfalls

### Pitfall 1: cmdk CommandItem value vs onSelect
**What goes wrong:** cmdk passes the normalized (lowercased) `value` string to `onSelect`, not the original object. Developers try to use the value to look up the member, but it's been lowercased/normalized.
**Why it happens:** cmdk normalizes value strings for matching. The onSelect callback receives the normalized string.
**How to avoid:** Do not rely on the onSelect parameter to identify the selected member. Instead, use a closure that captures the member's user_id directly: `onSelect={() => setSelectedUserId(member.user_id)}`.
**Warning signs:** Selected member resolving to wrong person or undefined.

### Pitfall 2: Popover width not matching trigger
**What goes wrong:** The PopoverContent renders at its default width (w-72) rather than matching the trigger button width.
**Why it happens:** Popover and Command have independent width defaults.
**How to avoid:** Add `className="w-[var(--radix-popover-trigger-width)] p-0"` to PopoverContent to match trigger width. Alternatively, set a fixed width on both trigger and content.
**Warning signs:** Combobox dropdown being narrower or wider than the trigger button.

### Pitfall 3: membersById stale after member role change
**What goes wrong:** If a member's role is changed in settings while the session detail page is open, the role badge shows stale data.
**Why it happens:** useMembers cache is not invalidated by role changes from a different page.
**How to avoid:** This is acceptable for v1 -- the data refreshes on next page navigation. Not worth adding cross-page invalidation complexity.
**Warning signs:** Not really detectable in normal use; only matters for same-session concurrent admin actions.

### Pitfall 4: Empty members query while loading
**What goes wrong:** membersById is an empty Map during initial load, causing all caller names to show truncated UUIDs momentarily.
**Why it happens:** useMembers query takes time to resolve; callers query may resolve first.
**How to avoid:** Show a loading skeleton or "Loading..." state for the callers table until both useSessionCallers and useMembers have resolved. Or accept the brief UUID flash (similar to Phase 18 approach).
**Warning signs:** Brief flash of UUIDs before names appear on page load.

### Pitfall 5: CommandEmpty message when no available vs no match
**What goes wrong:** The "All campaign members are already assigned" message shows even when the search term just has no matches.
**Why it happens:** CommandEmpty renders whenever the filtered list is empty, regardless of the reason.
**How to avoid:** Check both `availableMembers.length === 0` (all assigned) and whether a search term is active to show the appropriate empty message. When availableMembers is empty AND no search term, show the "all assigned" message. When search term is active and filters to zero, show "No members found".
**Warning signs:** Confusing empty state messages.

## Code Examples

### Current AddCallerDialog (to be replaced)
```typescript
// Source: web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx (lines 78-150)
// Current: Input field for raw ZITADEL user ID
// Target: Replace Input with Popover+Command combobox
```

### Current Overview Tab Callers Table (to be modified)
```typescript
// Source: lines 326-377 of same file
// Current: caller.user_id.slice(0, 12) + "..."
// Target: membersById lookup -> display_name + role badge
```

### Current Progress Tab Callers Table (to be modified)
```typescript
// Source: lines 520-526 of same file
// Current: caller.user_id.slice(0, 12) + "..."
// Target: membersById lookup -> display_name + role badge
```

### Integration Point: useMembers data shape
```typescript
// Source: web/src/hooks/useMembers.ts
// Returns PaginatedResponse<CampaignMember>
// CampaignMember: { user_id, display_name, email, role, synced_at }
```

### Integration Point: useSessionCallers data shape
```typescript
// Source: web/src/hooks/usePhoneBankSessions.ts (sessionKeys.callers)
// Returns SessionCaller[]
// SessionCaller: { id, session_id, user_id, check_in_at, check_out_at, created_at }
```

### Integration Point: useAssignCaller mutation
```typescript
// Source: web/src/hooks/usePhoneBankSessions.ts
// mutationFn: (userId: string) => POST .../callers { user_id: userId }
// Already invalidates sessionKeys.callers on success
// AddCallerDialog already calls assignMutation.mutateAsync(userId.trim())
// Only change: userId comes from combobox selection instead of text input
```

### roleVariant map (copy from members.tsx)
```typescript
// Source: web/src/routes/campaigns/$campaignId/settings/members.tsx
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw ZITADEL user ID input | Searchable member picker combobox | Phase 20 (this phase) | Users no longer need to know/copy UUIDs |
| Truncated UUID display | Member name + role badge | Phase 20 (this phase) | Callers tables become human-readable |

**No deprecated/outdated concerns:** All libraries used (cmdk ^1.1.1, radix-ui Popover, TanStack Query v5) are current and stable.

## Open Questions

1. **Should roleVariant be extracted to a shared constant?**
   - What we know: It exists in `settings/members.tsx` and will be needed in the session detail page.
   - What's unclear: Whether to duplicate or extract to a shared location.
   - Recommendation: Extract to a small shared constant (e.g., `@/lib/role-utils.ts`) since it is now used in two places. Alternatively, keep it duplicated if the planner prefers minimal file changes.

2. **Progress tab callers: CallerProgressItem has no direct member lookup**
   - What we know: CallerProgressItem has `user_id`, `calls_made`, `check_in_at`, `check_out_at` -- the same `user_id` field used for lookup.
   - What's unclear: Nothing -- membersById.get(caller.user_id) works identically.
   - Recommendation: Same membersById pattern applies; pass it to ProgressTab or lift useMembers to page level.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHON-03a | AddCallerDialog shows member picker combobox instead of text input | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "combobox"` | Needs update |
| PHON-03b | Selecting a member and clicking Add triggers assignCaller mutation with correct user_id | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "Add Caller"` | Exists (needs update for combobox flow) |
| PHON-03c | Already-assigned callers are hidden from the picker | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "already-assigned"` | Needs creation |
| PHON-03d | Overview tab callers table shows member names + role badges | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "display name"` | Needs creation |
| PHON-03e | Progress tab callers table shows member names + role badges | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "progress.*display name"` | Needs creation |
| PHON-03f | Fallback to truncated UUID when member not found in lookup | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "fallback"` | Needs creation |
| PHON-03g | "All members assigned" empty state when no available members | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx -t "all.*assigned"` | Needs creation |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update existing test mock setup to include `useMembers` mock in `index.test.tsx`
- [ ] Add `CampaignMember` test factory helpers (similar to existing `makeCaller`, `makeSession`)
- [ ] Update existing "Add Caller" test to use combobox interaction pattern instead of text input
- [ ] Add new test cases for: already-assigned filtering, name display in tables, fallback behavior, empty state

## Sources

### Primary (HIGH confidence)
- Direct file reads: `web/src/components/ui/command.tsx` -- confirmed cmdk ^1.1.1 shadcn wrapper installed
- Direct file reads: `web/src/components/ui/popover.tsx` -- confirmed radix-ui Popover wrapper installed
- Direct file reads: `web/src/hooks/useMembers.ts` -- confirmed CampaignMember type and query structure
- Direct file reads: `web/src/hooks/usePhoneBankSessions.ts` -- confirmed SessionCaller type and mutation invalidation
- Direct file reads: `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` -- current implementation (650 lines)
- Direct file reads: `web/src/routes/campaigns/$campaignId/settings/members.tsx` -- roleVariant map and StatusBadge usage pattern
- Direct file reads: `web/src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.tsx` -- volunteersById pattern
- Direct file reads: `web/src/components/shifts/AssignVolunteerDialog.tsx` -- existing picker dialog pattern (Dialog+Input+radio, NOT to be copied here)
- Direct file reads: `web/src/types/campaign.ts` -- CampaignMember interface
- Direct file reads: `web/src/types/phone-bank-session.ts` -- SessionCaller and CallerProgressItem interfaces

### Secondary (MEDIUM confidence)
- cmdk ^1.1.1 behavior: CommandItem value prop drives filtering; onSelect receives normalized value (verified via code inspection of command.tsx using CommandPrimitive from cmdk)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use in the project
- Architecture: HIGH -- all three patterns (combobox, membersById, roleVariant) have direct precedent in the codebase
- Pitfalls: HIGH -- derived from actual codebase inspection and cmdk behavior analysis

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no fast-moving dependencies)
