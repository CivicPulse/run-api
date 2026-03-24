# Phase 44: UI/UX Polish & Frontend Hardening - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers graceful edge-state handling (errors, empty states, loading) across the entire application, consolidates sidebar navigation, clarifies the volunteer invite flow, and adds contextual tooltips/hints at key decision points. No new features or pages — this is polish and hardening of existing functionality.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Consolidation (UX-01)
- **D-01:** Keep the two-group sidebar structure (Campaign, Organization) — do not flatten into a single list. The separation provides important context about which items are campaign-scoped vs org-scoped.
- **D-02:** Sidebar should slide over (overlay) content on all screen sizes, not push. On desktop, sidebar toggles between visible and hidden (offcanvas) rather than always being persistent. Use shadcn's existing `collapsible="offcanvas"` behavior consistently.
- **D-03:** When sidebar is hidden on desktop, content should use the full viewport width. No icon rail — clean slide-over only.

### Volunteer Invite UX (UX-02)
- **D-04:** Add a radio toggle at the top of the volunteer creation form: "Add volunteer record" (tracked-only, no app login) vs "Invite to app" (sends ZITADEL invite, creates user account).
- **D-05:** Tracked-only path: existing form fields (name, phone, email, skills). No ZITADEL integration.
- **D-06:** Invite path: same base fields + sends invite email via ZITADEL. Show a clear info banner explaining the user will receive an email invitation to access the app.
- **D-07:** For managers creating volunteers, this distinction replaces the current single-form approach. Self-registration (non-manager) path remains unchanged.

### Error Boundary Strategy (OBS-05)
- **D-08:** Implement route-level error boundaries wrapping each major section: campaigns, voters, volunteers, org, phone banking, canvassing.
- **D-09:** Add a top-level app error boundary as the last-resort fallback.
- **D-10:** Error boundary fallback UI: friendly message ("Something went wrong"), retry button, and link to go back to the dashboard. Use existing Card component styling — no special error page design.
- **D-11:** Do NOT add feature-level (component-level) error boundaries — route-level is sufficient for this phase.

### Empty States (OBS-06)
- **D-12:** Use the existing `EmptyState` component from `components/shared/EmptyState.tsx` for all list pages.
- **D-13:** Every list page (voters, call lists, walk lists, turfs, surveys, DNC, phone bank sessions, shifts, volunteer roster) must show a meaningful empty state with: icon, title, description, and optional CTA button.
- **D-14:** DataTable already handles empty state rendering — ensure the message text is contextual per page, not generic "No data".

### Loading States (OBS-07)
- **D-15:** Standardize on Skeleton components for all data-loading pages. Replace any Loader2 spinners with inline skeletons matching the content layout.
- **D-16:** Pages that load cards should show card-shaped skeletons. Pages with tables should show row skeletons. Use the existing `Skeleton` component from shadcn/ui.

### Tooltip/Hint Placement (UX-03, UX-04)
- **D-17:** Tooltips at these key decision points:
  - Turf creation: guidance on ideal turf size (# of households)
  - Role assignment: brief description of each role's permissions
  - Import column mapping: explanation of what each canonical field expects
  - Campaign type: explanation of campaign type options
  - Org settings: what the ZITADEL org ID is used for
- **D-18:** Use the existing TooltipIcon (Popover-based, HelpCircle icon) pattern from `components/field/TooltipIcon.tsx`. Promote it to `components/shared/` for reuse across admin pages.
- **D-19:** Tooltips should be informational only — no multi-step guides or tours. driver.js tours from v1.4 field mode remain separate.

### Claude's Discretion
- Exact empty state copy/messaging per page
- Specific skeleton layout dimensions per page
- Which additional form fields could benefit from help text beyond the required decision points
- Error boundary component naming and file organization

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Components
- `web/src/components/ui/sidebar.tsx` — Sidebar provider, trigger, and content components (shadcn)
- `web/src/components/ui/skeleton.tsx` — Skeleton loading component
- `web/src/components/ui/tooltip.tsx` — Tooltip component (shadcn/radix)
- `web/src/components/shared/EmptyState.tsx` — Reusable empty state component
- `web/src/components/field/TooltipIcon.tsx` — Popover-based help icon pattern

### Sidebar
- `web/src/routes/__root.tsx` — AppSidebar component, RootLayout, SidebarProvider configuration

### Volunteer Creation
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` — Current volunteer registration form

### Requirements
- `.planning/REQUIREMENTS.md` — UX-01 through UX-04, OBS-05 through OBS-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EmptyState` component (`components/shared/EmptyState.tsx`): icon + title + description + optional CTA
- `Skeleton` component (`components/ui/skeleton.tsx`): animate-pulse bg-accent
- `TooltipIcon` component (`components/field/TooltipIcon.tsx`): HelpCircle + Popover, needs promotion to shared
- `DataTable` (`components/shared/DataTable.tsx`): already handles empty state and loading skeleton for table pages
- `RequireRole` / `RequireOrgRole`: role-gated rendering
- 27 shadcn/ui components installed including Card, Dialog, Tooltip, Popover, Badge, Accordion

### Established Patterns
- Loading: Skeleton components for inline loading (7+ pages use this pattern)
- Empty state: Icon + centered message + optional action button
- Forms: react-hook-form + zod validation + useFormGuard
- Toast notifications: Sonner for success/error feedback
- Confirmation: ConfirmDialog / DestructiveConfirmDialog for destructive actions

### Integration Points
- `__root.tsx` SidebarProvider: central point for sidebar behavior changes
- `__root.tsx` RootLayout: where a top-level error boundary would wrap
- Volunteer register page: where invite toggle would be added
- Each route file: where route-level error boundaries would wrap page content

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for error boundaries, empty states, and tooltip placement. Follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 44-ui-ux-polish-frontend-hardening*
*Context gathered: 2026-03-24*
