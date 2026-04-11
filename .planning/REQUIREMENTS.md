# Milestone v1.18 Requirements — Field UX Polish

**Milestone:** v1.18 Field UX Polish
**Goal:** Fix reported canvassing field bugs and harden the offline/sync path so volunteers can complete doors reliably. Raise the test suite to a trustworthy baseline.
**Status:** Roadmap created — 5 phases (106-110)
**Last updated:** 2026-04-10

---

## Source of Truth

Requirements derived from:
- Reported volunteer feedback from real door-knocking sessions (7 canvassing bugs)
- Broader audits triggered by those reports (map asset pipeline, active-state state machine, form requiredness)
- Proactive offline/sync hardening
- Test-suite trustworthiness: full unit/integration/E2E coverage for everything touched + fix pre-existing broken tests

---

## v1.18 Requirements

### CANV — Canvassing Flow Fixes

- [x] **CANV-01**: After a volunteer records an outcome for the active house, the canvassing wizard automatically advances to the next house in the walk list without manual intervention.
- [x] **CANV-02**: The "Skip house" button advances past the current active house, marks it skipped in the local queue, and surfaces the next house within one tap.
- [x] **CANV-03**: The outcome notes field is optional — volunteers can save any outcome (contacted, not home, refused, moved, etc.) without entering text in the notes field.

### SELECT — House Selection & Active-State

- [ ] **SELECT-01**: Volunteers can tap any house in the household list to set it as the active house.
- [ ] **SELECT-02**: Volunteers can tap any house marker on the map to set it as the active house.
- [ ] **SELECT-03**: The active-house state machine is reviewed end-to-end so a volunteer standing at a specific address can reliably make that address active regardless of entry point (list, map, auto-advance, skip, resume).

### MAP — Map Rendering & Layout

- [ ] **MAP-01**: Leaflet marker icons render correctly on every field-mode map view (no broken-image placeholders). The fix is verified across canvassing map, walk list map, and volunteer hub map.
- [ ] **MAP-02**: In list view, the household list is fully visible and interactable — the map does not overlay, z-index-cover, or otherwise block the list.
- [ ] **MAP-03**: A map asset pipeline audit confirms every Leaflet icon, sprite, and tile asset resolves correctly under the app's build/serve configuration (dev, preview, and production).

### FORMS — Field-Mode Form Requiredness

- [ ] **FORMS-01**: A field-mode form audit identifies every `required` validator and every form field in the canvassing and phone banking flows; each is reviewed against its UX intent and over-eager validations are removed.

### OFFLINE — Offline Queue Hardening

- [ ] **OFFLINE-01**: The offline outcome queue is exercised under simulated connectivity loss and reliably persists, replays, and reconciles outcomes on reconnect without duplication or loss.
- [ ] **OFFLINE-02**: Connectivity state (online, offline, syncing, last-sync-time) is surfaced to volunteers in a glanceable indicator within the field-mode shell.
- [ ] **OFFLINE-03**: Sync-on-reconnect completes within a defined budget, handles server errors gracefully (retry with backoff), and surfaces any unresolvable items as actionable errors to the volunteer.

### TEST — Test Suite Trustworthiness

- [ ] **TEST-01**: Every file modified during v1.18 has meaningful unit test coverage for new or changed behavior (backend: pytest; frontend: vitest/RTL).
- [ ] **TEST-02**: Every API and service boundary touched during v1.18 has integration test coverage (backend: pytest integration marker; frontend: TanStack Query hooks against mock server).
- [ ] **TEST-03**: Every user-visible behavior changed during v1.18 has E2E test coverage via `web/scripts/run-e2e.sh`, including the canvassing auto-advance, skip house, map house-tap, list house-tap, and offline sync flows.
- [x] **TEST-04**: All pre-existing broken or consistently failing tests across backend (pytest) and frontend (vitest + Playwright) are either fixed or deleted with justification, so the CI signal is trustworthy — only valid regressions fail.

---

## Future Requirements

_Deferred to later milestones:_

- Phone banking field-mode UX review (unless uncovered during FORMS-01 audit)
- Volunteer hub / shell improvements beyond the offline indicator
- Offline support for new entity types beyond canvassing outcomes

---

## Out of Scope

- New canvassing features beyond fixing reported bugs
- Backend API contract changes for canvassing or phone banking
- Non-field-mode map work (admin turf editor was already polished in v1.5)
- Replacing Leaflet or the offline queue implementation
- New test frameworks (keep pytest/vitest/Playwright)

---

## Traceability

| REQ-ID      | Description                                        | Phase |
|-------------|----------------------------------------------------|-------|
| CANV-01     | Auto-advance after outcome                         | 107   |
| CANV-02     | Skip house button works                            | 107   |
| CANV-03     | Outcome note optional                              | 107   |
| SELECT-01   | Tap house in list → active                         | 108   |
| SELECT-02   | Tap house on map → active                          | 108   |
| SELECT-03   | Active-state state machine audit                   | 108   |
| MAP-01      | Leaflet marker icons render                        | 109   |
| MAP-02      | List view not covered by map                       | 109   |
| MAP-03      | Map asset pipeline audit                           | 109   |
| FORMS-01    | Field-mode form requiredness audit                 | 107   |
| OFFLINE-01  | Queue persists/replays reliably                    | 110   |
| OFFLINE-02  | Connectivity indicator                             | 110   |
| OFFLINE-03  | Sync-on-reconnect with retry/backoff               | 110   |
| TEST-01     | Unit coverage for modified files                   | 110*  |
| TEST-02     | Integration coverage for touched boundaries        | 110*  |
| TEST-03     | E2E coverage for user-visible changes              | 110*  |
| TEST-04     | Fix/delete pre-existing broken tests               | 106   |

_* TEST-01/02/03 are cross-cutting coverage obligations applied as explicit success criteria on every code-changing phase (107, 108, 109, 110). Anchored to Phase 110 for traceability — that is the milestone-final coverage gate where the full suite must pass clean._

**Coverage:** 17/17 requirements mapped. No orphans. No duplicates.
