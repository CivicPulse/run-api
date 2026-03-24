# Phase 44: UI/UX Polish & Frontend Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 44-ui-ux-polish-frontend-hardening
**Areas discussed:** Sidebar consolidation, Volunteer invite UX, Error boundary strategy, Tooltip/hint placement
**Mode:** --auto (all decisions auto-selected with recommended defaults)

---

## Sidebar Consolidation

| Option | Description | Selected |
|--------|-------------|----------|
| Keep two groups, overlay on all sizes | Campaign and Organization groups stay separate; sidebar slides over content on desktop and mobile | ✓ |
| Flatten to single list | Merge all nav items into one flat list | |
| Icon rail on desktop | Collapse to icons on desktop, full on mobile | |

**User's choice:** [auto] Keep two groups, overlay on all sizes (recommended default)
**Notes:** Matches UX-01 requirement. Existing `collapsible="offcanvas"` pattern already supports this; just needs desktop behavior adjustment.

---

## Volunteer Invite UX

| Option | Description | Selected |
|--------|-------------|----------|
| Radio toggle on form | "Add record" vs "Invite to app" toggle at top of creation form | ✓ |
| Separate forms | Two entirely different pages/routes for each path | |
| Wizard step | Multi-step wizard with invite as an additional step | |

**User's choice:** [auto] Radio toggle on form (recommended default)
**Notes:** Minimal UI change to existing form. Self-registration path unchanged. Manager-only feature.

---

## Error Boundary Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Route-level + top-level | Error boundaries per major route section plus app-level fallback | ✓ |
| Top-level only | Single error boundary at app root | |
| Component-level | Granular boundaries on individual components | |

**User's choice:** [auto] Route-level + top-level (recommended default)
**Notes:** Standard React pattern. Route-level provides good granularity without over-engineering.

---

## Tooltip/Hint Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted decision points | Tooltips only at 5 key decision points (turf sizing, roles, import mapping, campaign type, ZITADEL ID) | ✓ |
| Comprehensive | Help text on every form field | |
| Progressive | Start minimal, add based on user feedback | |

**User's choice:** [auto] Targeted decision points (recommended default)
**Notes:** Avoids tooltip fatigue. Uses existing TooltipIcon pattern promoted to shared.

---

## Claude's Discretion

- Empty state copy per page
- Skeleton layout dimensions
- Additional form field help text beyond required decision points
- Error boundary component organization

## Deferred Ideas

None — discussion stayed within phase scope
