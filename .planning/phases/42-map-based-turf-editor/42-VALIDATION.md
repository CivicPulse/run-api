---
phase: 42
slug: map-based-turf-editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + happy-dom (frontend), pytest 9.x (backend) |
| **Config file** | `web/vitest.config.ts`, `pyproject.toml` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --coverage && cd .. && uv run pytest tests/ -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | MAP-01 | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "draw"` | Wave 0 | pending |
| 42-01-02 | 01 | 1 | MAP-02 | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "edit"` | Wave 0 | pending |
| 42-02-01 | 02 | 1 | MAP-03 | unit | `cd web && npx vitest run src/components/canvassing/map/TurfOverviewMap.test.tsx` | Wave 0 | pending |
| 42-02-02 | 02 | 1 | MAP-04 | unit | `cd web && npx vitest run src/components/canvassing/map/VoterMarkerLayer.test.tsx` | Wave 0 | pending |
| 42-02-03 | 02 | 1 | MAP-05 | unit (backend) | `uv run pytest tests/ -k "voter_count" -x` | Wave 0 | pending |
| 42-03-01 | 03 | 2 | MAP-06 | unit | `cd web && npx vitest run src/components/canvassing/map/GeoJsonImport.test.tsx` | Wave 0 | pending |
| 42-03-02 | 03 | 2 | MAP-07 | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "export"` | Wave 0 | pending |
| 42-03-03 | 03 | 2 | MAP-08 | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "json"` | Wave 0 | pending |
| 42-04-01 | 04 | 2 | MAP-09 | unit | `cd web && npx vitest run src/components/canvassing/map/AddressSearch.test.tsx` | Wave 0 | pending |
| 42-04-02 | 04 | 2 | MAP-10 | unit | `cd web && npx vitest run src/components/canvassing/map/OverlapHighlight.test.tsx` | Wave 0 | pending |
| 42-04-03 | 04 | 2 | MAP-11 | unit | `cd web && npx vitest run src/components/canvassing/map/MapProvider.test.tsx` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `web/src/components/canvassing/map/TurfMapEditor.test.tsx` — stubs for MAP-01, MAP-02, MAP-07, MAP-08
- [ ] `web/src/components/canvassing/map/TurfOverviewMap.test.tsx` — stubs for MAP-03
- [ ] `web/src/components/canvassing/map/VoterMarkerLayer.test.tsx` — stubs for MAP-04
- [ ] `web/src/components/canvassing/map/GeoJsonImport.test.tsx` — stubs for MAP-06
- [ ] `web/src/components/canvassing/map/AddressSearch.test.tsx` — stubs for MAP-09
- [ ] `web/src/components/canvassing/map/OverlapHighlight.test.tsx` — stubs for MAP-10
- [ ] `web/src/components/canvassing/map/MapProvider.test.tsx` — stubs for MAP-11
- [ ] Leaflet/react-leaflet mock setup for happy-dom (`vi.mock("leaflet")` and `vi.mock("react-leaflet")`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Polygon draw interaction | MAP-01 | Leaflet canvas interaction requires real browser | Draw polygon in browser, verify boundary saves and renders on reload |
| Vertex drag editing | MAP-02 | Leaflet drag events require real DOM layout | Edit turf boundary by dragging vertices, verify update persists |
| Satellite tile toggle | MAP-11 | Tile rendering is visual | Toggle layers control, verify satellite imagery loads |
| Address search pan/zoom | MAP-09 | Map viewport changes are visual | Search address, verify map centers on result |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
