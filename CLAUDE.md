# CLAUDE.md

## Project Overview

CivicPulse Run — a multi-tenant political campaign field operations API.

- **Stack:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL (OIDC auth)
- **Frontend:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Package manager:** Always use `uv` (not pip/poetry) for local operations

## Development Environment

```bash
docker compose up -d                # Start all services
docker compose down                 # Stop all services
docker compose logs api --tail=50   # Check API logs
```

Services: API (:8000), PostgreSQL (:5433), MinIO (:9000/:9001), ZITADEL (:8080)

### Seed Data

Idempotent Macon-Bibb County GA demo dataset (safe to run multiple times):

```bash
docker compose exec api bash -c "PYTHONPATH=/home/app python /home/app/scripts/seed.py"
```

Creates: 8 users, 1 org, 1 campaign, 50 voters (with PostGIS coords), 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts, 190 voter interactions, survey responses, tags, DNC entries, invites, and addresses.

Script: `scripts/seed.py`

### TLS Configuration

For local dev, `.env` should have:
```bash
ZITADEL_TLS_MODE=disabled
ZITADEL_EXTERNAL_SECURE=false
ZITADEL_DOMAIN=localhost
DISABLE_TLS=true
```

For Tailscale access, switch to:
```bash
ZITADEL_TLS_MODE=enabled
ZITADEL_EXTERNAL_SECURE=true
ZITADEL_DOMAIN=dev.tailb56d83.ts.net
# Remove DISABLE_TLS or set to false
```

## Code Style

- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto, markers: integration, e2e)
- **E2E tests:** Always use `web/scripts/run-e2e.sh` to run Playwright E2E tests. This wrapper logs every run to `web/e2e-runs.jsonl` with timestamp, pass/fail/skip counts, duration, and command. Use this to track test health over time. Example: `cd web && ./scripts/run-e2e.sh` (full suite) or `./scripts/run-e2e.sh voter-crud.spec.ts` (single spec).

## Project Structure

- `app/` — FastAPI application (models, routes, services, core)
- `alembic/` — Database migrations (async via asyncpg)
- `scripts/` — Dev utilities (seed.py, bootstrap-zitadel.py, etc.)
- `tests/` — Unit and integration tests
- `.planning/` — GSD planning directory

## Design Context

### Users

**Campaign staff** (managers, coordinators) working at desks on desktop browsers to plan and manage field operations — turfs, walk lists, call lists, volunteer scheduling, voter data. **Volunteers** (canvassers, phone bankers) using mobile devices in the field during shifts — they need fast, glanceable interfaces that work under time pressure and varying conditions. Both audiences are equally important; the interface must be responsive-first, serving both a data-rich desktop management experience and a focused, touch-friendly mobile field mode.

Users range from experienced political operatives to first-time campaign volunteers. The tool must feel immediately usable without training while scaling to support power-user workflows.

### Brand Personality

**Professional, Accessible, Civic**

- **Professional:** This is serious infrastructure for democratic participation, not a toy. It should feel as capable as enterprise tools but without the enterprise learning curve.
- **Accessible:** Any candidate, regardless of party or budget, should feel welcomed. Low barrier to entry. Volunteers should be productive within minutes.
- **Civic:** Rooted in public service and community. Nonpartisan — the design must never signal affiliation. The tool serves democracy itself.

**Emotional goals:** Users should feel confident and capable (professional-grade tools despite constraints), energized (campaign momentum, urgency), calm and organized (chaos reduced to clear workflows), and welcomed (approachable to newcomers).

### Aesthetic Direction

**Visual tone:** Clean, minimal, data-rich. Draws from Linear's keyboard-driven clarity, Stripe's polished data density, and Canva's approachable friendliness. The intersection: professional without being cold, friendly without being juvenile.

**Brand color:** Civic blue — a trustworthy, nonpartisan blue that avoids coded red/blue political signaling. Should feel institutional and dependable, not partisan.

**Theme:** Light and dark mode (via next-themes). shadcn/ui neutral base color with new-york style.

**Anti-references:** Avoid overly political aesthetics (red/blue, stars-and-stripes motifs, campaign rally energy). Avoid enterprise gray dullness. Avoid Silicon Valley startup playfulness that undermines credibility.

**Typography:** System font stack via Tailwind defaults. Clean, readable, well-hierarchied.

### Design Principles

1. **Clarity over cleverness** — Every element should communicate its purpose instantly. Campaign workers are busy; they need information, not decoration. Prefer explicit labels, clear hierarchy, and obvious affordances.
2. **Mobile-field parity** — The field experience is not a degraded desktop experience. Mobile views are purpose-built for the context: large touch targets (min 44px), glanceable status, offline-aware patterns, and reduced cognitive load.
3. **Nonpartisan by design** — Color, imagery, and language must remain politically neutral. No red/blue coding, no party-specific iconography. The platform serves the democratic process, not any side of it.
4. **Accessible at AAA** — Target WCAG 2.1 AAA compliance. Strict contrast ratios (7:1 for normal text, 4.5:1 for large text), full keyboard navigation, screen reader support, reduced-motion alternatives for all animations, and accommodations for color blindness.
5. **Progressive density** — Desktop views can be information-dense (tables, dashboards, maps). Mobile views should progressively simplify. The same data, presented at the right density for the context.

### Technical Foundation

- **Component library:** shadcn/ui (new-york style, neutral base)
- **CSS framework:** Tailwind CSS v4 with oklch color tokens
- **Icons:** Lucide React
- **Charts:** Recharts
- **Maps:** Leaflet + react-leaflet
- **Animations:** tw-animate-css (use sparingly, respect prefers-reduced-motion)
- **State:** Zustand, TanStack Query
- **Forms:** React Hook Form + Zod validation
