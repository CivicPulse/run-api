# Stack Research

**Domain:** Frontend UI additions for political campaign management app (v1.2 Full UI milestone)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Context

This research covers ONLY the frontend library additions needed for v1.2. The existing validated stack is not re-evaluated:

**Already installed and in use (DO NOT ADD):**
- React 19.2, React DOM 19.2
- TanStack Router 1.159, TanStack Query 5.90, TanStack Table 8.21
- Tailwind CSS 4.1, shadcn/ui (via `radix-ui` 1.4 + `shadcn` 3.8 CLI)
- Vite 7.3, TypeScript 5.9
- react-hook-form 7.71, @hookform/resolvers 5.2, zod 4.3
- Leaflet 1.9 + react-leaflet 5.0 (installed, not yet used in components)
- recharts 3.7 (used in dashboard)
- ky 1.14 (HTTP client), oidc-client-ts 3.1, zustand 5.0
- sonner 2.0 (toasts), vaul 1.1 (drawer), cmdk 1.1 (command palette)
- lucide-react 0.563 (icons)
- Vitest 4.0, Playwright 1.58, Testing Library

**Already installed shadcn/ui components:**
alert-dialog, avatar, badge, button, card, command, dialog, dropdown-menu, input, label, popover, radio-group, select, separator, sheet, sidebar, skeleton, sonner, table, tabs, textarea, tooltip

## Recommended Stack Additions

### 1. Client-Side CSV Parsing: PapaParse

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| papaparse | ^5.5.3 | Client-side CSV preview and column detection | Zero-dependency, framework-agnostic CSV parser. Supports streaming via Web Workers for large files (voter files can be 500MB+). The import wizard needs to preview the first N rows locally before uploading to S3 and calling the server-side detect endpoint. PapaParse handles this without loading the entire file into memory. |
| @types/papaparse | ^5.5.2 | TypeScript definitions for PapaParse | Needed for type-safe integration. |

**How it fits the import wizard flow:**
1. User selects file via react-dropzone (see below)
2. PapaParse streams first 100 rows for local preview (instant feedback)
3. File uploads to S3 via pre-signed URL from `/campaigns/{id}/imports`
4. Server calls `/detect` for fuzzy-match column suggestions via RapidFuzz
5. User confirms mapping in the column mapping UI step
6. Server dispatches TaskIQ background job, frontend polls status

**Confidence:** HIGH -- PapaParse has zero peer dependencies, works in any React version, 12M+ weekly npm downloads, actively maintained.

### 2. File Upload Drop Zone: react-dropzone

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-dropzone | ^15.0.0 | Drag-and-drop file upload zone | Purpose-built for file upload UX. Provides accessible drag-and-drop with file type validation, size limits, and multiple-file support. v15 supports React 19. The import wizard's first step needs a polished drop zone for CSV/TSV files -- react-dropzone provides this without building drag-and-drop from scratch with HTML5 APIs. |

**Why not build with native HTML5 drag-and-drop:** React-dropzone handles edge cases that are painful to implement manually: browser inconsistencies in drag events, accessible keyboard upload, MIME type validation, and the "enter/leave" event flickering when dragging over child elements. For a single drop zone component, the library saves significant effort.

**Why not a full drag-and-drop library (dnd-kit) for file upload:** dnd-kit is for rearranging/sorting items within the UI. File upload from the OS is a different interaction pattern that react-dropzone handles specifically.

**Confidence:** HIGH -- v15.0.0 published recently, 10M+ weekly npm downloads, React 19 compatible (peer dep: `react >= 16.8`).

### 3. Drag-and-Drop Interactions: @dnd-kit

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @dnd-kit/core | ^6.3.1 | Drag-and-drop foundation for column mapping UI | Best-in-class React DnD library. Accessible (keyboard + screen reader), performant (60fps with 1000+ items via CSS transforms), modular architecture. Needed for the column mapping step where users drag source columns to target fields, and for availability slot reordering in the volunteer scheduling UI. |
| @dnd-kit/sortable | ^10.0.0 | Sortable list presets built on @dnd-kit/core | Provides SortableContext and useSortable hook for ordered lists. Used for reordering availability time slots in the shift scheduling UI. |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities for dnd-kit | Small utility package for CSS.Transform.toString() used in drag overlays. Required by @dnd-kit/sortable. |

**Why @dnd-kit/core (stable) over @dnd-kit/react (new):** The `@dnd-kit/react` package is v0.3.2 -- pre-1.0, API may change. The `@dnd-kit/core` package is v6.3.1, battle-tested in production, and explicitly supports React 18+19 in peer dependencies. Use the stable ecosystem.

**Why not react-beautiful-dnd:** Deprecated by Atlassian in 2022. The community fork `@hello-pangea/dnd` exists but dnd-kit is more flexible, has better TypeScript support, and is the modern standard.

**Why not react-dnd:** Heavier abstraction with a backend system (HTML5, touch). More complex API for the same result. dnd-kit is lighter and more composable.

**Where used in v1.2:**
- Column mapping wizard: drag detected columns onto target voter fields
- Shift scheduling: reorder or rearrange availability slots
- Potential: reorder survey questions (already have surveys, may want editing)

**Confidence:** HIGH -- @dnd-kit/core 6.3.1 is stable, peer deps explicitly include React 19, 2.5M+ weekly npm downloads.

### 4. Additional shadcn/ui Components (via CLI, not npm)

These are not npm packages -- they are added via `npx shadcn add [component]` which copies the component source into the project. No new dependencies are introduced.

| Component | Purpose | Needed For |
|-----------|---------|------------|
| `progress` | Progress bar for import status tracking | Import wizard progress step, phone bank session progress |
| `checkbox` | Multi-select in data tables | Member lists, DNC lists, call lists, voter selection |
| `switch` | Toggle controls | Volunteer availability, shift settings, DNC flags |
| `scroll-area` | Custom scrollable regions | Column mapping panel with many fields, long voter detail tabs |
| `date-picker` | Date selection (built on Calendar + Popover) | Shift scheduling, volunteer availability, import date filters |
| `calendar` | Date display/selection (uses react-day-picker internally) | Shift calendar view, availability calendar |
| `breadcrumb` | Navigation breadcrumbs | Deep nested routes (campaign > phone banking > session > caller) |
| `pagination` | Page navigation controls | Data tables with server-side pagination |
| `toggle` | Toggle buttons | View mode switches (list/grid/calendar) |
| `toggle-group` | Grouped toggle buttons | Multi-day availability selection, view mode switches |
| `collapsible` | Expandable sections | Voter detail sections, advanced search filters |
| `spinner` | Loading indicators | Inline loading states during mutations |

**Important:** shadcn/ui's `calendar` component depends on `react-day-picker`, which is already a transitive dependency via the `radix-ui` package. Running `npx shadcn add calendar` will install `react-day-picker@^9.14.0` if not already present. react-day-picker v9 is compatible with React 19.

**Confidence:** HIGH -- these are official shadcn/ui components built on Radix primitives that already support React 19.

### 5. Date Range and Scheduling Display

No additional library needed beyond shadcn/ui's `calendar` (which wraps react-day-picker v9).

**Why not react-big-calendar or FullCalendar:** The scheduling UI in this project is shift-based (create a shift for a date/time, volunteers sign up). This is CRUD + a list view grouped by date, not a Google Calendar-style event grid. The shadcn calendar for date picking + a custom list/card layout for shift display is simpler and more consistent with the existing UI system. If a full calendar view is needed later, `react-big-calendar` (v1.19.4, React 19 compatible) can be added incrementally.

**Why not schedule-x:** Newer library (v4.1.0), smaller community, adds complexity for a use case that doesn't need a full calendar widget.

**Confidence:** HIGH -- this is an architectural decision, not a library choice. The shift model is CRUD, not calendar-event management.

## What NOT to Add

| Avoid | Why | What to Use Instead |
|-------|-----|---------------------|
| Any multi-step form library (react-step-wizard, CoreUI Stepper) | The import wizard is 4 steps with custom logic at each step. A wizard library adds abstraction without value when steps have heterogeneous content (file upload, column mapping, confirmation, progress). Build with zustand state machine + shadcn tabs/cards. | Custom wizard component with zustand step state + shadcn `card` + `progress` |
| react-csv-importer | v0.8.1, peer dep is React 16-17 only. Unmaintained. Also too opinionated about the column mapping UI. | PapaParse for parsing + custom column mapping UI with @dnd-kit |
| @dnd-kit/react (v0.3.2) | Pre-1.0, API unstable. The React-specific wrapper is experimental. | @dnd-kit/core (v6.3.1, stable) |
| react-big-calendar | Overkill for shift scheduling. Adds 50KB+ for a CRUD-list UI that doesn't need week/month grid views. | shadcn calendar for date picking + custom shift list layout |
| AG Grid | Commercial license required for advanced features. TanStack Table already installed and covers all data table needs (sorting, filtering, pagination, column visibility, row selection). | TanStack Table 8.21 (already installed) |
| Material UI / Chakra UI components | Mixing component libraries creates visual inconsistency and increases bundle size. Everything should go through shadcn/ui. | shadcn/ui components (already the design system) |
| redux / @reduxjs/toolkit | zustand is already installed and used for state management. Adding Redux alongside zustand creates confusion about which store to use. | zustand 5.0 (already installed) |
| socket.io-client / WebSocket libraries | The import progress flow uses polling (GET `/imports/{id}` returns `total_rows` / `imported_rows`). The backend has no SSE/WebSocket endpoints. Polling every 2-3 seconds is sufficient for import progress that takes minutes. | TanStack Query `refetchInterval` for polling |
| date-fns or dayjs | Not needed for the current feature set. Date formatting for shifts/availability can use `Intl.DateTimeFormat` (built into every browser). If heavy date manipulation is needed later, add then. | Native `Intl.DateTimeFormat` and `Date` |

## Recommended Stack (Summary)

### New npm Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| papaparse | ^5.5.3 | Client-side CSV preview | Import wizard: preview first N rows before upload |
| @types/papaparse | ^5.5.2 | TypeScript definitions | Development |
| react-dropzone | ^15.0.0 | File upload drop zone | Import wizard: drag-and-drop file selection |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop foundation | Column mapping UI, sortable lists |
| @dnd-kit/sortable | ^10.0.0 | Sortable list presets | Availability slot reordering, column reordering |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities | Required by @dnd-kit/sortable |

### shadcn/ui Components to Add (via CLI)

```bash
npx shadcn add progress checkbox switch scroll-area date-picker calendar breadcrumb pagination toggle toggle-group collapsible spinner
```

This will pull in `react-day-picker` as a dependency of the calendar component if not already present.

### Development Tools

No additional dev dependencies needed. Vitest, Testing Library, and Playwright are already installed.

## Installation

```bash
cd web

# New npm dependencies (3 packages + 1 type package)
npm install papaparse react-dropzone @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D @types/papaparse

# shadcn/ui components (copies source files, may add react-day-picker)
npx shadcn add progress checkbox switch scroll-area date-picker calendar breadcrumb pagination toggle toggle-group collapsible spinner
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| papaparse (client-side preview) | Server-only parsing (skip client preview) | If import files are always small (<1MB) and instant preview isn't needed. But voter files are large, and showing a preview before upload improves UX. |
| react-dropzone | Native HTML5 drag-and-drop | If the file upload is a simple button click only (no drag-and-drop needed). react-dropzone handles browser edge cases that would require 100+ lines of manual code. |
| @dnd-kit/core (stable) | @dnd-kit/react (new) | When @dnd-kit/react reaches v1.0 stable. Currently v0.3.2, not production-ready. |
| Custom wizard (zustand + shadcn) | react-step-wizard | If the wizard has many identical steps (e.g., a survey with 20 identical question pages). Our wizard has 4 heterogeneous steps, making a library unnecessary. |
| TanStack Query polling | SSE/WebSocket for progress | If the backend adds SSE endpoints for real-time progress. Currently the backend only supports polling via GET. |
| shadcn calendar + list layout | react-big-calendar | If users explicitly request a week/month calendar grid view for shift scheduling. Can be added later -- react-big-calendar v1.19.4 supports React 19. |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| papaparse 5.5.3 | Any (zero dependencies) | Framework-agnostic, no React dependency at all |
| react-dropzone 15.0.0 | React >=16.8 (React 19 supported) | v15.0.0 fixed React 19 JSX type imports |
| @dnd-kit/core 6.3.1 | React >=16.8 including React 19 | Peer dep: `react >=16.8.0, react-dom >=16.8.0` |
| @dnd-kit/sortable 10.0.0 | @dnd-kit/core ^6.3.0 | Must use matching core version |
| react-day-picker 9.14.0 | React >=16.8 (React 19 supported) | v9.4.3+ resolved React 19 ref issues. Pulled in by shadcn calendar. |
| TanStack Table 8.21.3 | React >=16.8 (React 19 supported) | Already installed, already compatible |

## Stack Patterns by Feature Area

**Import Wizard (file upload + column mapping + progress):**
- react-dropzone for file selection (step 1)
- PapaParse for local CSV preview with Web Worker streaming (step 1)
- ky for pre-signed URL upload to S3 (step 1)
- @dnd-kit/core for column mapping drag-and-drop (step 2)
- shadcn progress + TanStack Query `refetchInterval` for import polling (step 3)
- shadcn table for import history list (step 4)

**Data Tables (members, DNC, call lists, volunteers):**
- TanStack Table 8.21 for headless table logic (already installed)
- shadcn table + checkbox + pagination for rendering
- TanStack Query for server-side data fetching with pagination
- URL search params (TanStack Router) for filter/sort state persistence

**Complex Forms (voter detail, phone bank session, shift creation):**
- react-hook-form + zod (already installed, already used in TurfForm)
- shadcn tabs for multi-section forms (voter detail with contacts/tags/lists/history)
- shadcn collapsible for expandable form sections

**Shift Scheduling / Volunteer Availability:**
- shadcn calendar + date-picker for date selection
- @dnd-kit/sortable for availability slot reordering
- shadcn toggle-group for day-of-week selection
- Custom card/list layout for shift display (not a calendar grid)

**Map / Geographic (turf visualization):**
- Leaflet + react-leaflet (already installed, just need to build components)
- No additional libraries needed

**Real-Time Progress (import, phone bank sessions):**
- TanStack Query `refetchInterval: 3000` for polling
- shadcn progress for visual indicator
- No SSE/WebSocket needed (backend uses polling)

## Sources

- [react-dropzone GitHub](https://github.com/react-dropzone/react-dropzone) -- React 19 support confirmed via PR #1422 (v14.3.6+), v15.0.0 current
- [PapaParse official site](https://www.papaparse.com/) -- zero-dependency, streaming + Web Worker support verified
- [PapaParse GitHub](https://github.com/mholt/PapaParse) -- v5.5.3, 12M+ weekly downloads
- [@dnd-kit official docs](https://dndkit.com/) -- architecture and API reference
- [@dnd-kit/core npm](https://www.npmjs.com/package/@dnd-kit/core) -- v6.3.1, peer deps verified (React 16.8+)
- [@dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.3.2, confirmed pre-1.0
- [react-day-picker discussion #2152](https://github.com/gpbl/react-day-picker/discussions/2152) -- React 19 support confirmed
- [shadcn/ui components page](https://ui.shadcn.com/docs/components) -- full component list verified
- [shadcn/ui data table guide](https://ui.shadcn.com/docs/components/radix/data-table) -- TanStack Table integration patterns
- [shadcn/ui stepper discussion #6219](https://github.com/shadcn-ui/ui/discussions/6219) -- no official stepper component in shadcn/ui
- npm view commands -- all version numbers and peer dependencies verified locally via `npm view [package] version peerDependencies` on 2026-03-10

---
*Stack research for: CivicPulse Run v1.2 Full UI -- frontend library additions*
*Researched: 2026-03-10*
