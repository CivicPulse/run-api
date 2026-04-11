# Phase 110: Offline Queue & Connectivity Hardening - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous run — Claude's Discretion)

<domain>
## Phase Boundary

Harden the existing offline outcome queue (`useSyncEngine`) + connectivity status (`useConnectivityStatus`) + offline banner so that:

1. **OFFLINE-01** — Outcomes persist locally during connectivity loss and replay on reconnect with no duplication or loss. Test under simulated connectivity loss (vitest fake network + Playwright offline mode).
2. **OFFLINE-02** — Glanceable connectivity indicator surfaces online/offline/syncing/last-sync-time state in the field-mode shell.
3. **OFFLINE-03** — Sync-on-reconnect completes within a defined budget, retries server errors with exponential backoff, and surfaces unresolvable items as actionable errors to the volunteer.
4. **Milestone coverage gate (TEST-01/02/03)** — Every file modified across phases 106-110 has unit + integration + E2E coverage for changed behavior; full `uv run pytest`, `vitest`, and `./scripts/run-e2e.sh` suites pass clean.

Out of scope: offline tile caching, offline read-path (loading walk lists while offline), background sync service worker. These belong to future milestones.

</domain>

<decisions>
## Implementation Decisions

### OFFLINE-01 — Queue Persistence & Replay

- **Approach:** Audit `useSyncEngine.ts` (222 lines) for:
  - Idempotency: outcome enqueue must use a stable client-generated UUID that the server deduplicates on.
  - Persistence: queue state lives in localStorage (or IndexedDB if already used) — survives page reload.
  - Replay order: FIFO with server-rejection handling (dead-letter vs retry).
- **Verification:** vitest with a fake API client that can be toggled online/offline mid-test. Assertions cover: (a) 3 outcomes enqueued offline → 3 POST requests on reconnect, (b) mid-flight failure + reconnect → exactly-once delivery, (c) duplicate replay guard (same UUID enqueued twice → 1 POST).

### OFFLINE-02 — Connectivity Indicator

- **Location:** Field-mode shell header (top bar of canvassing / walk list / volunteer hub routes). Small pill showing an icon + label: "Online" (green dot), "Offline" (orange dot), "Syncing…" (spinner), "Last sync: 2 min ago" when idle.
- **Component:** Extend existing `OfflineBanner.tsx` or create a sibling `ConnectivityPill.tsx`. Use shadcn Badge primitive + Lucide icons. Must meet 44×44 touch target for tap-to-see-details (e.g., tap opens a Sheet with pending queue count + last sync timestamp + manual retry button).
- **State source:** Already exists in `useConnectivityStatus` + `useSyncEngine`. No new state; just a new UI surface.

### OFFLINE-03 — Sync Budget + Backoff + Actionable Errors

- **Budget:** 30-second soft deadline for sync-on-reconnect. If queue not drained by deadline, keep retrying in background but dim the pill to "Syncing… (slow)".
- **Backoff:** Exponential starting at 1s, doubling to a 60s cap, for 5xx/network errors. 4xx errors (validation, auth) move the outcome to a "needs review" dead-letter list that the volunteer can see + resolve via the indicator's Sheet.
- **Actionable errors:** Dead-letter items render as cards in the indicator Sheet with: (a) household address, (b) outcome attempted, (c) error summary, (d) "Retry" and "Discard" buttons.

### Milestone Coverage Gate (TEST-01/02/03)

- **Scope:** Audit every file touched in phases 106, 107, 108, 109, 110. For each, confirm:
  - Unit test exists for the modified behavior
  - Integration test exists where the file sits on a module boundary (hook-to-component, component-to-route)
  - E2E coverage exists for user-visible behavior
- **Deliverable:** `110-COVERAGE-AUDIT.md` table listing every modified file with checkmarks for unit/integration/E2E.
- **Exit criteria:** Full 4-suite gate green: ruff + pytest + vitest + tsc + playwright.

### Claude's Discretion

All tactical choices (component file organization, Sheet content structure, exact backoff curve, which queue storage mechanism) are at Claude's discretion — use existing codebase patterns.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/hooks/useSyncEngine.ts` — offline queue hook (222 lines, existing)
- `web/src/hooks/useConnectivityStatus.ts` — connectivity state (22 lines, existing)
- `web/src/components/field/OfflineBanner.tsx` — existing UI, may need replacement or extension
- `web/src/routes/field/$campaignId.tsx` — field-mode shell where the indicator goes
- `web/src/components/ui/sheet.tsx` — shadcn Sheet (already used for DoorListView)
- `web/src/components/ui/badge.tsx` — shadcn Badge

### Established Patterns
- shadcn Sheet for bottom-drawer UIs (from phase 108 DoorListView).
- TanStack Query mutations for POST writes — useSyncEngine likely wraps this.
- z-index stack locked by phase 109: Sheet 1100, Radix popper 1200. The new indicator Sheet will inherit.

### Integration Points
- Canvassing wizard outcomes → `useCanvassingWizard.handleOutcome` → sync engine enqueue.
- Field-mode shell header → new ConnectivityPill component.

</code_context>

<specifics>
## Specific Ideas

- The pill-vs-banner UX distinction matters: existing `OfflineBanner` is probably full-width at the top of the shell (intrusive). A glanceable pill in the shell header is less intrusive + always visible. Keep the banner for critical states (prolonged offline + unresolved dead-letters) and add the pill for ambient state.
- Phase 109's canvassing-map-rendering E2E spec includes connectivity helpers that may be extensible (mock /api failures + offline toggle). Reuse those patterns for OFFLINE-01 E2E.

</specifics>

<deferred>
## Deferred Ideas

- Offline read-path (viewing walk lists while offline) — belongs to future "Offline-First" milestone.
- Background Sync API / Service Worker — requires significant infra changes; defer.
- Optimistic UI for household card state updates — tangentially related but out of scope.

</deferred>
