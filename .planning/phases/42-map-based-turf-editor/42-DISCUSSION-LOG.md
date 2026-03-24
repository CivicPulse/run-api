# Phase 42: Map-Based Turf Editor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 42-map-based-turf-editor
**Areas discussed:** Map interaction UX, Overview map display, GeoJSON import/export, Overlap & geocoding

---

## Map Interaction UX

### Draw flow

| Option | Description | Selected |
|--------|-------------|----------|
| Draw then confirm | User draws polygon, sees it rendered with area stats, then clicks 'Save Turf' button. Can redraw before saving. | ✓ |
| Inline sidebar form | Map fills page. Drawing triggers a slide-out sidebar with name/description fields + boundary preview. | |
| Step wizard | Step 1: Draw boundary. Step 2: Name + description. Step 3: Review + save. | |

**User's choice:** Draw then confirm
**Notes:** Matches existing TurfForm pattern

### Page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Replace TurfForm | Swap textarea in TurfForm with the map. Same routes. Minimal routing changes. | ✓ |
| Full-page map editor | New dedicated route for the map editor. More room but adds routing. | |
| Split panel | Map on top/left, form fields on bottom/right in the same view. | |

**User's choice:** Replace TurfForm
**Notes:** None

### JSON toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible section below map | Small 'Advanced' toggle reveals raw JSON textarea below map. Bidirectional sync. | ✓ |
| Tab switch (Map / JSON) | Two tabs above editor area. Only one visible at a time. | |
| Side-by-side | Map and JSON textarea visible simultaneously. | |

**User's choice:** Collapsible section below map
**Notes:** None

---

## Overview Map Display

### Map placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top of turf list page | Map above existing turf list table on /canvassing. Click polygon to navigate. | ✓ |
| Separate map tab | New 'Map View' tab alongside existing list view. | |
| Full-page map route | Dedicated /canvassing/map route. Maximum map real estate. | |

**User's choice:** Top of turf list page
**Notes:** None

### Voter markers

| Option | Description | Selected |
|--------|-------------|----------|
| Only on selected turf | Click a turf polygon to see its voters as clustered markers. Avoids loading all voters. | ✓ |
| Always visible (clustered) | All campaign voter locations shown as marker clusters at all times. | |
| Heatmap layer | Voter density heatmap instead of individual markers. | |

**User's choice:** Only on selected turf
**Notes:** None

### Popup info

| Option | Description | Selected |
|--------|-------------|----------|
| Name + status + voter count | Compact popup with turf name, status badge, voter count, link to detail. | ✓ |
| Mini detail card | Richer card with name, description, status, voter count, dates, buttons. | |
| Name only, click navigates | Minimal tooltip with name. Click navigates directly. | |

**User's choice:** Name + status + voter count
**Notes:** None

---

## GeoJSON Import/Export

### Import flow

| Option | Description | Selected |
|--------|-------------|----------|
| Upload → preview → save | File picker on new turf page. Preview on map. Confirm name/description then save. | ✓ |
| Drag-and-drop onto map | Drag .geojson directly onto map canvas. More fluid, needs custom drop zone. | |
| Bulk import page | Separate page for multiple .geojson files with batch creation. | |

**User's choice:** Upload → preview → save
**Notes:** None

### Export scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-turf download button | Download button on turf detail page. Client-side blob download. | ✓ |
| Per-turf + bulk campaign export | Individual download plus 'Export All' for FeatureCollection. | |
| Per-turf only, popup menu | Export as option in turf actions dropdown. | |

**User's choice:** Per-turf download button
**Notes:** None

---

## Overlap & Geocoding

### Overlap detection

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow | Warning banner listing overlapping turfs. User can still save. | |
| Block save until resolved | Prevent saving if overlap detected. | |
| Visual highlight only | Overlapping areas highlighted in different color. No dialog. | ✓ |

**User's choice:** Visual highlight only
**Notes:** Purely visual feedback, no blocking or warning dialogs

### Address geocoding

| Option | Description | Selected |
|--------|-------------|----------|
| Search bar above map | Text input above map. Nominatim geocoding. Free, OSM-based. | |
| Auto-center on campaign area | Map auto-centers on existing turfs/voters bounding box. No search. | |
| Both search + auto-center | Auto-center on existing data, plus search bar for manual override. | ✓ |

**User's choice:** Both search + auto-center
**Notes:** None

### Satellite imagery

| Option | Description | Selected |
|--------|-------------|----------|
| Map layer control | Standard Leaflet layers control in top-right. OSM + satellite toggle. | ✓ |
| Button in toolbar | Custom button alongside Geoman tools. | |
| User preference (persisted) | Toggle that persists in localStorage. | |

**User's choice:** Map layer control
**Notes:** Free Esri World Imagery tiles

---

## Claude's Discretion

- Geoman toolbar configuration and placement
- Marker clustering library choice
- Exact status color scheme for turf polygons
- Nominatim debounce/rate limiting
- Overlap detection implementation (PostGIS vs client-side)
- Map default zoom and bounds padding
- Loading states for voter markers and voter count

## Deferred Ideas

None — discussion stayed within phase scope
