# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary (Backend):**
- Python 3.13 - API server, background tasks, migrations
  - Version pinned in `.python-version`
  - `pyproject.toml` specifies `requires-python = ">=3.13"`

**Primary (Frontend):**
- TypeScript ~5.9.3 - Web client (`web/` directory)
  - Config: `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`

**Secondary:**
- SQL - Alembic migrations (`alembic/versions/`)

## Runtime

**Backend:**
- Python 3.13
- Uvicorn (ASGI server) with `uvicorn[standard]` extras

**Frontend:**
- Node.js (version not pinned, no `.nvmrc`)
- Vite 7.3.1 dev server on port 5173

**Package Managers:**
- Backend: `uv` - lockfile present (`uv.lock`)
- Frontend: `npm` - lockfile present (`web/package-lock.json`)

## Frameworks

**Backend Core:**
- FastAPI >=0.135.1 - REST API framework (`app/main.py`)
- SQLAlchemy >=2.0.48 - Async ORM (`app/db/session.py`, `app/models/`)
- Pydantic >=2.12.5 - Schema validation (`app/schemas/`)
- Pydantic Settings >=2.13.1 - Configuration management (`app/core/config.py`)

**Frontend Core:**
- React 19.2.0 - UI framework
- TanStack React Router >=1.159.5 - Client routing
- TanStack React Query >=5.90.21 - Server state management
- TanStack React Table >=8.21.3 - Data tables
- Zustand >=5.0.11 - Client state management
- Tailwind CSS 4.1.18 - Styling
- Radix UI (via `radix-ui` >=1.4.3) + shadcn - Component library

**Backend Testing:**
- pytest >=9.0.2 - Test runner
- pytest-asyncio >=1.3.0 - Async test support (`asyncio_mode = "auto"`)
- httpx >=0.28.1 - Test client for FastAPI

**Frontend Testing:**
- Vitest 4.0.18 - Unit/component tests (`web/vitest.config.ts`)
- Testing Library (React 16.3.2, jest-dom 6.9.1, user-event 14.6.1)
- Playwright 1.58.2 - E2E tests (`web/playwright.config.ts`)

**Linting/Formatting:**
- Backend: Ruff >=0.15.5 (`pyproject.toml` `[tool.ruff]`)
  - Target: `py313`, line-length: 88
  - Rules: E, F, I, N, UP, B, SIM, ASYNC
  - Ignore: B008 (FastAPI `Depends()` pattern)
  - isort with `known-first-party = ["app"]`
- Frontend: ESLint 9.39.1 (`web/eslint.config.js`)

**Build/Dev:**
- Alembic >=1.18.4 - Database migrations (`alembic.ini`, `alembic/`)
- Vite >=7.3.1 - Frontend build tool
- Docker Compose - Local services (`docker-compose.yml`)

## Key Dependencies

**Critical Backend:**
- `asyncpg` >=0.31.0 - Async PostgreSQL driver (runtime)
- `psycopg2-binary` >=2.9.11 - Sync PostgreSQL driver (Alembic migrations)
- `authlib` >=1.6.9 - JWT/JWKS validation against ZITADEL OIDC
- `httpx` >=0.28.1 - Async HTTP client for ZITADEL API and tests
- `aioboto3` >=15.5.0 - Async S3 client for object storage
- `loguru` >=0.7.3 - Structured logging
- `taskiq` >=0.12.1 + `taskiq-fastapi` >=0.4.0 - Background task broker

**Domain-Specific Backend:**
- `geoalchemy2` >=0.18.4 - PostGIS geometry columns for turfs/canvassing
- `shapely` >=2.1.2 - Geometry operations (turf management)
- `rapidfuzz` >=3.14.3 - Fuzzy string matching (voter deduplication)
- `python-multipart` >=0.0.22 - File upload parsing

**Error Handling:**
- `fastapi-problem-details` >=0.1.4 - RFC 9457 error responses (`app/core/errors.py`)

**CLI:**
- `typer` >=0.24.1 - CLI commands

**Critical Frontend:**
- `ky` >=1.14.3 - HTTP client
- `oidc-client-ts` >=3.1.0 - OIDC authentication flow
- `zod` >=4.3.6 - Schema validation
- `react-hook-form` >=7.71.1 + `@hookform/resolvers` - Form handling
- `leaflet` >=1.9.4 + `react-leaflet` >=5.0.0 - Map rendering (turfs/canvassing)
- `recharts` >=3.7.0 - Dashboard charts
- `sonner` >=2.0.7 - Toast notifications
- `cmdk` >=1.1.1 - Command palette
- `class-variance-authority` >=0.7.1, `clsx`, `tailwind-merge` - Styling utilities

## Configuration

**Environment:**
- Loaded via `pydantic-settings` from `.env` file (`app/core/config.py`)
- `.env.example` documents all required variables
- Settings singleton: `from app.core.config import settings`

**Required Environment Variables:**
- `DATABASE_URL` - Async PostgreSQL connection (asyncpg)
- `DATABASE_URL_SYNC` - Sync PostgreSQL connection (psycopg2, for Alembic)
- `ZITADEL_ISSUER` - ZITADEL instance URL
- `ZITADEL_PROJECT_ID` - ZITADEL project for role claims
- `ZITADEL_SERVICE_CLIENT_ID` - Service account client ID
- `ZITADEL_SERVICE_CLIENT_SECRET` - Service account secret
- `CORS_ALLOWED_ORIGINS` - JSON list of allowed origins
- `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` - Object storage

**Build/Dev Config Files:**
- `pyproject.toml` - Python project, deps, ruff, pytest config
- `alembic.ini` - Migration config (sync DB URL)
- `docker-compose.yml` - PostgreSQL (PostGIS 17-3.5) + MinIO
- `web/vite.config.ts` - Frontend build
- `web/vitest.config.ts` - Frontend test config
- `web/playwright.config.ts` - E2E test config
- `web/components.json` - shadcn component config

## Platform Requirements

**Development:**
- Python 3.13+
- Node.js (for frontend)
- Docker + Docker Compose (PostgreSQL with PostGIS, MinIO)
- `uv` package manager for Python
- ZITADEL instance (external auth provider)

**Production:**
- PostgreSQL 17 with PostGIS 3.5 extension
- S3-compatible object storage (Cloudflare R2 targeted, per code comments)
- ZITADEL authentication service
- Redis or RabbitMQ recommended for TaskIQ broker (currently InMemoryBroker)

---

*Stack analysis: 2026-03-10*
