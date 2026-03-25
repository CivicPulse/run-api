# Phase 45: WCAG Compliance Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 45-wcag-compliance-audit
**Areas discussed:** Scanning strategy, Screen reader verification, Remediation approach, Map accessibility

---

## Scanning Strategy

### Q1: How should axe-core scanning be integrated?

| Option | Description | Selected |
|--------|-------------|----------|
| Parameterized test | One test file with route list, axe-core on each. Easy to maintain. | ✓ |
| Individual test files | Separate test file per admin page/section. More granular. | |
| Both | Parameterized sweep + individual tests for stateful pages. | |

**User's choice:** Parameterized test
**Notes:** None

### Q2: What violation threshold should gate CI?

| Option | Description | Selected |
|--------|-------------|----------|
| Zero critical + serious | Block on critical/serious only. Moderate/minor as warnings. | ✓ |
| Zero all violations | Block on any violation including moderate/minor. | |
| Progressive | Start logging, tighten over time. | |

**User's choice:** Zero critical + serious
**Notes:** Matches A11Y-01 success criteria exactly.

### Q3: Should the scan cover field mode routes too?

| Option | Description | Selected |
|--------|-------------|----------|
| Admin + field routes | Include field routes in sweep. Should already pass from v1.4. | ✓ |
| Admin only | Scope strictly to admin pages per phase goal. | |

**User's choice:** Admin + field routes
**Notes:** None

### Q4: Should scan results be saved as artifacts?

| Option | Description | Selected |
|--------|-------------|----------|
| JSON artifacts | Save violation JSON per route for tracking/auditing. | ✓ |
| Pass/fail only | Just test output, no persisted files. | |

**User's choice:** JSON artifacts
**Notes:** None

---

## Screen Reader Verification

### Q1: How should the 5 critical screen reader flows be verified?

| Option | Description | Selected |
|--------|-------------|----------|
| A11y tree assertions | Playwright a11y tree snapshots with heading, label, landmark, live region assertions. | ✓ |
| ARIA attribute checks | Assert key elements have correct aria attributes. Simpler but less thorough. | |
| Narration sequence test | Simulate tab-through and assert accessible name sequence. Most thorough but brittle. | |

**User's choice:** A11y tree assertions
**Notes:** None

### Q2: Should flow tests combine keyboard navigation and a11y tree checks?

| Option | Description | Selected |
|--------|-------------|----------|
| Combined | Keyboard nav + a11y tree in one test per flow. | ✓ |
| Separate tests | Dedicated keyboard and a11y tree test files. | |

**User's choice:** Combined
**Notes:** None

### Q3: Voter import wizard — verify a11y at every step or just start/end?

| Option | Description | Selected |
|--------|-------------|----------|
| Every step | Assert a11y tree at all wizard steps. | ✓ |
| Start and end only | Just entry point and completion state. | |

**User's choice:** Every step
**Notes:** Wizards are notorious for a11y gaps between steps.

---

## Remediation Approach

### Q1: Shared a11y utility components or inline fixes?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared utilities | Create SkipNav, VisuallyHidden, LiveRegion, FocusScope in components/shared/. | ✓ |
| Inline fixes only | Add aria attributes directly per component. No new shared components. | |
| Minimal shared + inline | Only create SkipNav. Everything else inline. | |

**User's choice:** Shared utilities
**Notes:** None

### Q2: How should heading hierarchy be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit and fix manually | Scan each route, fix inline. No utility needed. | ✓ |
| HeadingLevel context provider | React context that auto-increments heading levels. | |

**User's choice:** Audit and fix manually
**Notes:** None

### Q3: Focus management after dynamic updates?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit for key interactions | Manage focus after modal close, form submit, delete. Browser defaults otherwise. | ✓ |
| Browser defaults only | Trust browser and shadcn built-in focus management. | |

**User's choice:** Explicit for key interactions
**Notes:** None

### Q4: Color contrast fixes — theme-level or per-component?

| Option | Description | Selected |
|--------|-------------|----------|
| Theme-level fix | Adjust CSS custom properties in globals.css. Cascades everywhere. | ✓ |
| Per-component overrides | Override specific colors where violations found. | |

**User's choice:** Theme-level fix
**Notes:** None

---

## Map Accessibility

### Q1: How should non-map turf editing work?

| Option | Description | Selected |
|--------|-------------|----------|
| GeoJSON textarea | Collapsible "Edit as GeoJSON" panel below map. Paste/edit coordinates. | ✓ |
| Coordinate form fields | Structured lat/lng input pairs per vertex. | |
| GeoJSON file upload | Upload .geojson file to create/replace boundaries. | |

**User's choice:** GeoJSON textarea
**Notes:** None

### Q2: Where should skip-nav link jump to?

| Option | Description | Selected |
|--------|-------------|----------|
| Turf details/form section | Skip past map to turf name, description, GeoJSON editing. | ✓ |
| Page heading | Skip to h1 above the map. | |
| Turf list table | Skip to turf listing or details. Context-dependent. | |

**User's choice:** Turf details/form section
**Notes:** None

### Q3: Should GeoJSON panel be visible by default?

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden, keyboard-discoverable | Collapsed by default with toggle button. SR announces it. | ✓ |
| Always visible | Always shown below map. | |
| SR-only link + toggle | VisuallyHidden link + small toggle icon. | |

**User's choice:** Hidden, keyboard-discoverable
**Notes:** None

---

## Claude's Discretion

- Exact route list for parameterized axe scan
- Specific ARIA landmark placement per page
- Focus trap implementation details for modals
- Which shadcn components need ARIA additions
- Skeleton/loading state accessibility announcements

## Deferred Ideas

None — discussion stayed within phase scope
