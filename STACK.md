# Tech Stack Reference: run-api

> Standalone reference for replicating this stack on a new project.
> Covers versions, configuration patterns, infrastructure, and design decisions.

---

## 1. Overview

**Project:** Political campaign management API with a React web UI.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + TanStack Router + shadcn/ui)               │
│  Auth: oidc-client-ts  →  ZITADEL OIDC (self-hosted)           │
│  HTTP: ky with JWT Bearer interceptor                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────────┐
│  FastAPI (Python 3.13, Uvicorn ASGI)                            │
│  JWT validation: authlib (JWKS from ZITADEL)                    │
│  Background tasks: taskiq                                       │
│  Geo: GeoAlchemy2 + Shapely + PostGIS                           │
│  Object storage: aioboto3 → MinIO / S3                          │
└────────────┬────────────────────────────┬───────────────────────┘
             │ asyncpg (async queries)     │ psycopg2 (Alembic migrations)
┌────────────▼────────────────────┐   ┌───▼──────────────────────┐
│  PostgreSQL 17 + PostGIS 3.5    │   │  MinIO (S3-compatible)   │
│  Row-Level Security (RLS)       │   │  Object: voter-imports   │
└─────────────────────────────────┘   └──────────────────────────┘
```

**Multi-tenancy:** All tenant isolation is implemented via PostgreSQL Row-Level Security. Each request sets the `app.current_campaign_id` session variable, which RLS policies use to filter rows automatically.

---

## 2. Python API

### Runtime

| Component | Version | Notes |
|-----------|---------|-------|
| Python | `>=3.13` | Uses modern type hints, `tomllib` built-in |
| Package manager | `uv` (astral-sh) | Replaces pip/poetry, uses `uv.lock` |
| FastAPI | `>=0.135.1` | Async-first, OpenAPI generation |
| Uvicorn | `>=0.41.0` | ASGI server, `[standard]` extras (watchfiles, etc.) |

### Key Dependencies (`pyproject.toml`)

```toml
dependencies = [
    "aioboto3>=15.5.0",          # Async S3/MinIO client
    "alembic>=1.18.4",           # Database migrations
    "asyncpg>=0.31.0",           # Async PostgreSQL driver
    "authlib>=1.6.9",            # JWT/OIDC validation (ZITADEL)
    "fastapi>=0.135.1",
    "fastapi-problem-details>=0.1.4",  # RFC 9457 problem responses
    "geoalchemy2>=0.18.4",       # PostGIS integration for SQLAlchemy
    "httpx>=0.28.1",             # Async HTTP client
    "loguru>=0.7.3",             # Structured logging
    "psycopg2-binary>=2.9.11",   # Sync driver (Alembic only)
    "pydantic-settings>=2.13.1", # Settings from env vars
    "pydantic[email]>=2.12.5",
    "python-multipart>=0.0.22",  # File upload support
    "rapidfuzz>=3.14.3",         # Fuzzy string matching
    "shapely>=2.1.2",            # Geometric operations
    "sqlalchemy>=2.0.48",        # ORM (async mode)
    "taskiq>=0.12.1",            # Background task queue
    "taskiq-fastapi>=0.4.0",     # taskiq/FastAPI integration
    "typer>=0.24.1",             # CLI commands (e.g., management scripts)
    "uvicorn[standard]>=0.41.0",
]
```

### Dev Dependencies

```toml
[dependency-groups]
dev = [
    "httpx>=0.28.1",
    "pytest>=9.0.2",
    "pytest-asyncio>=1.3.0",
    "ruff>=0.15.5",
]
```

### Project Setup

```bash
# Initialize
uv init my-project
cd my-project

# Add dependencies
uv add fastapi uvicorn[standard] sqlalchemy asyncpg ...

# Install (respects uv.lock)
uv sync

# Run dev server
uv run uvicorn main:app --reload

# Run tests
uv run pytest
```

### `pyproject.toml` structure

```toml
[project]
name = "run-api"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [ ... ]

[dependency-groups]
dev = [ ... ]

[tool.ruff]
target-version = "py313"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM", "ASYNC"]
ignore = ["B008"]  # Depends() in FastAPI is standard

[tool.ruff.lint.isort]
known-first-party = ["app"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
python_files = ["test_*.py"]
python_functions = ["test_*"]
markers = [
    "integration: marks tests that require a database",
    "e2e: marks end-to-end tests",
]
```

### Ruff Configuration

Ruff covers both linting and formatting (replaces flake8 + black + isort).

```bash
uv run ruff check .        # Lint
uv run ruff format .       # Format
uv run ruff check --fix .  # Auto-fix
```

---

## 3. Database

### PostgreSQL + PostGIS

| Component | Version |
|-----------|---------|
| PostgreSQL | 17 |
| PostGIS | 3.5 |
| Docker image | `postgis/postgis:17-3.5` |

### SQLAlchemy (Async ORM)

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@host:5432/db",
    echo=False,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
```

### Alembic Migrations

Alembic runs synchronously with `psycopg2`, while the app uses `asyncpg`. Two connection strings are required.

**`alembic.ini`** uses the sync URL:
```ini
sqlalchemy.url = postgresql+psycopg2://postgres:postgres@localhost:5432/run_api
```

**Common commands:**
```bash
# Generate migration
uv run alembic revision --autogenerate -m "add campaigns table"

# Apply migrations
uv run alembic upgrade head

# Rollback one
uv run alembic downgrade -1
```

### Row-Level Security (RLS) Pattern

The multi-tenant isolation strategy uses PostgreSQL session variables and RLS policies.

**Per-request context setup:**
```python
# app/db/rls.py
async def set_campaign_context(session: AsyncSession, campaign_id: str) -> None:
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :campaign_id, false)"),
        {"campaign_id": str(campaign_id)},
    )
```

> **Note:** `set_config()` is used instead of `SET` because asyncpg uses server-side prepared statements that don't support bound parameters in `SET` commands. The `false` third argument scopes the setting to the current session (not transaction).

**Example RLS policy (in migration):**
```sql
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_isolation ON some_table
    USING (campaign_id::text = current_setting('app.current_campaign_id', true));
```

**DB Role:** Create a dedicated `app_user` role with `NOINHERIT` and `LOGIN` for production:
```sql
CREATE ROLE app_user NOINHERIT LOGIN PASSWORD 'secret';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
```

### MinIO (S3-Compatible Object Storage)

Local development uses MinIO; production can use Cloudflare R2 or AWS S3.

```python
import aioboto3

async def upload_file(key: str, data: bytes, bucket: str):
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
    ) as s3:
        await s3.put_object(Bucket=bucket, Key=key, Body=data)
```

---

## 4. Web UI

### Core Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | `^19.2.0` | UI framework |
| TypeScript | `~5.9.3` | Type safety |
| Vite | `^7.3.1` | Build tool + dev server |
| Node | 22 (Docker) | Build environment |

### Routing & Data

| Library | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-router` | `^1.159.5` | File-based routing, type-safe |
| `@tanstack/react-query` | `^5.90.21` | Server state, caching, loading states |
| `@tanstack/react-table` | `^8.21.3` | Headless table management |
| `zustand` | `^5.0.11` | Client-side state |

### Forms & Validation

| Library | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | `^7.71.1` | Performant form state |
| `@hookform/resolvers` | `^5.2.2` | Adapter between RHF and validators |
| `zod` | `^4.3.6` | Schema validation (shared API ↔ form) |

### UI Components

| Library | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | `^4.1.18` | Utility CSS (v4 = CSS-first config) |
| `radix-ui` | `^1.4.3` | Accessible headless primitives |
| `shadcn` | `^3.8.4` (devDep) | Component scaffolding CLI |
| `lucide-react` | `^0.563.0` | Icon set |
| `sonner` | `^2.0.7` | Toast notifications |
| `cmdk` | `^1.1.1` | Command palette |
| `vaul` | `^1.1.2` | Mobile-first drawer |
| `next-themes` | `^0.4.6` | Dark/light mode |
| `class-variance-authority` | `^0.7.1` | Component variant utilities |
| `clsx` + `tailwind-merge` | `^2.1.1` / `^3.4.0` | Class name merging |

### Mapping & Charts

| Library | Version | Purpose |
|---------|---------|---------|
| `leaflet` | `^1.9.4` | Maps |
| `react-leaflet` | `^5.0.0` | React bindings for Leaflet |
| `recharts` | `^3.7.0` | Composable chart library |

### HTTP & Auth

| Library | Version | Purpose |
|---------|---------|---------|
| `ky` | `^1.14.3` | Fetch wrapper with hooks/interceptors |
| `oidc-client-ts` | `^3.1.0` | OIDC/OAuth2 client (ZITADEL) |

### Testing

| Library | Version | Purpose |
|---------|---------|---------|
| `vitest` | `^4.0.18` | Unit/component tests |
| `@vitest/ui` | `^4.0.18` | Browser UI for test results |
| `@playwright/test` | `^1.58.2` | End-to-end tests |
| `@testing-library/react` | `^16.3.2` | DOM testing utilities |
| `happy-dom` | `^20.8.3` | Fast DOM for vitest |

### Vite Configuration Notes

- TanStack Router plugin for file-based code generation: `@tanstack/router-plugin`
- Tailwind CSS v4 via Vite plugin: `@tailwindcss/vite`
- HTTPS in dev (for OIDC redirects): `@vitejs/plugin-basic-ssl`

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss(), basicSsl()],
})
```

---

## 5. Authentication: ZITADEL

### Overview

[ZITADEL](https://zitadel.com) is the self-hosted identity provider. It issues JWTs with custom claims for roles and project membership.

### API Side (authlib)

```python
from authlib.integrations.httpx_client import AsyncOAuth2Client

# JWKS-based JWT validation — authlib caches the JWKS automatically
async def validate_token(token: str) -> dict:
    # Fetch JWKS from ZITADEL and verify signature
    ...
```

Key validation steps:
1. Fetch JWKS from `{ZITADEL_ISSUER}/.well-known/openid-configuration`
2. Verify JWT signature using cached public keys
3. Check `aud` claim includes `ZITADEL_PROJECT_ID`
4. Extract roles from `urn:zitadel:iam:org:project:roles` claim

### Frontend Side (oidc-client-ts)

```ts
import { UserManager } from 'oidc-client-ts'

const userManager = new UserManager({
  authority: import.meta.env.VITE_ZITADEL_ISSUER,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: `${window.location.origin}/auth/callback`,
  scope: 'openid profile email',
  automaticSilentRenew: true,
})
```

### ZITADEL Setup (New Project)

1. Deploy ZITADEL (Docker or cloud)
2. Create a new **Project** → note the Project ID
3. Create an **Application** (Web, PKCE) → note the Client ID
4. Create a **Service Account** (for API-to-API calls) → note Client ID + Secret
5. Configure allowed redirect URIs for your domain
6. Set the issuer URL in env vars

---

## 6. Infrastructure & DevOps

### Dockerfile (Multi-Stage)

```dockerfile
# Stage 1: Frontend build
FROM node:22-slim AS frontend
# ... npm ci && npm run build → /build/dist/

# Stage 2: Python deps (uv install)
FROM python:3.13-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN uv sync --frozen --no-dev --no-install-project
# Output: /build/.venv/

# Stage 3: Production runtime
FROM python:3.13-slim AS runtime
RUN apt-get install -y libgeos-dev  # Required for Shapely/GeoAlchemy2
COPY --from=deps /build/.venv ./.venv
COPY --from=frontend /build/dist/ ./static/
# Run as non-root user
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-1}"]
```

> **Why `libgeos-dev`?** Shapely links against the system GEOS library at runtime. Without it, PostGIS geometry operations will fail with an import error.

### docker-compose.yml

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/run_api
      DATABASE_URL_SYNC: postgresql+psycopg2://postgres:postgres@postgres:5432/run_api
      S3_ENDPOINT_URL: http://minio:9000
    depends_on:
      postgres: { condition: service_healthy }
      minio: { condition: service_healthy }

  postgres:
    image: postgis/postgis:17-3.5
    environment:
      POSTGRES_DB: run_api
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5433:5432"]   # 5433 on host to avoid conflicts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d run_api"]

  minio:
    image: quay.io/minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]  # 9001 is the web console
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
```

### Kubernetes

**Deployment pattern:** Alembic init container runs migrations before the main container starts.

```yaml
spec:
  initContainers:
    - name: migrate
      image: ghcr.io/org/run-api:sha-<sha>
      command: ["python", "-m", "alembic", "upgrade", "head"]
      envFrom:
        - configMapRef: { name: run-api-config }
        - secretRef: { name: run-api-secret }

  containers:
    - name: run-api
      image: ghcr.io/org/run-api:sha-<sha>
      ports: [{ containerPort: 8000 }]
      livenessProbe:
        httpGet: { path: /health/live, port: 8000 }
      readinessProbe:
        httpGet: { path: /health/ready, port: 8000 }
      securityContext:
        runAsNonRoot: true
```

### CI/CD (GitHub Actions + ArgoCD)

**Workflow** (`.github/workflows/publish.yml`):

1. Push to `main` triggers build
2. Docker image built and pushed to `ghcr.io` with `sha-<full-sha>` tag
3. `k8s/deployment.yaml` is updated in-place with the new image tag and committed back
4. ArgoCD detects the manifest change and syncs the deployment

```yaml
- name: Update K8s manifest
  run: |
    sed -i "s|image: ghcr.io/org/run-api:.*|image: ghcr.io/org/run-api:sha-${{ github.sha }}|" k8s/deployment.yaml

- name: Commit manifest update
  run: |
    git add k8s/deployment.yaml
    git diff --staged --quiet || git commit -m "ci: update deployment image to sha-${{ github.sha }}"
    git push
```

> **GitOps pattern:** The K8s manifests live in the same repo as the code. ArgoCD watches this repo. No separate Helm chart or GitOps repo is required for this setup.

---

## 7. Environment Variables Reference

### API (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_NAME` | No | `CivicPulse Run API` | Application name |
| `DEBUG` | No | `false` | Enable SQLAlchemy echo + debug mode |
| `DATABASE_URL` | **Yes** | `postgresql+asyncpg://postgres:postgres@localhost:5432/run_api` | Async DB URL (asyncpg driver) |
| `DATABASE_URL_SYNC` | **Yes** | `postgresql+psycopg2://postgres:postgres@localhost:5432/run_api` | Sync DB URL (Alembic migrations) |
| `ZITADEL_ISSUER` | **Yes** | `https://auth.civpulse.org` | ZITADEL instance URL |
| `ZITADEL_PROJECT_ID` | **Yes** | *(empty)* | ZITADEL project ID for audience validation |
| `ZITADEL_SERVICE_CLIENT_ID` | **Yes** | *(empty)* | Service account client ID |
| `ZITADEL_SERVICE_CLIENT_SECRET` | **Yes** | *(empty)* | Service account client secret |
| `CORS_ALLOWED_ORIGINS` | No | `["http://localhost:5173"]` | JSON list of allowed origins |
| `S3_ENDPOINT_URL` | No | `http://localhost:9000` | MinIO/S3 endpoint |
| `S3_ACCESS_KEY_ID` | No | `minioadmin` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | `minioadmin` | S3 secret key |
| `S3_BUCKET` | No | `voter-imports` | Default S3 bucket name |
| `S3_REGION` | No | `us-east-1` | S3 region (MinIO ignores this) |

### Web (`web/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | **Yes** | *(empty)* | API base URL (e.g. `https://api.example.com`) |
| `VITE_ZITADEL_ISSUER` | **Yes** | `https://auth.civpulse.org` | ZITADEL instance URL |
| `VITE_ZITADEL_CLIENT_ID` | **Yes** | *(empty)* | OIDC client ID for the web app |
| `VITE_ZITADEL_PROJECT_ID` | **Yes** | *(empty)* | ZITADEL project ID |

> **Note:** All `VITE_*` variables are baked into the JS bundle at build time. They are **not** secret. For Docker builds, pass them as `--build-arg` values.

---

## 8. Getting Started (New Project Checklist)

### Step 1: Python API

```bash
# Bootstrap
uv init my-api
cd my-api

# Add core deps
uv add fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" asyncpg psycopg2-binary alembic pydantic-settings authlib httpx geoalchemy2 shapely aioboto3 loguru

# Add dev deps
uv add --group dev ruff pytest pytest-asyncio httpx

# Set up Alembic
uv run alembic init alembic
```

Edit `alembic.ini` to point at your sync connection string.
Edit `alembic/env.py` to import your `Base.metadata` for autogenerate.

```bash
# First migration
uv run alembic revision --autogenerate -m "initial schema"
uv run alembic upgrade head
```

### Step 2: ZITADEL

1. Run ZITADEL locally:
   ```bash
   docker run -d -p 8080:8080 ghcr.io/zitadel/zitadel:latest start-from-init --masterkey "MasterkeyNeedsToHave32Characters"
   ```
2. Open `http://localhost:8080` → create Organization → create Project
3. Under the Project: create a **Web Application** (PKCE) for the frontend
4. Under the Project: create a **Service Account** for the API
5. Note: Project ID, Web Client ID, Service Client ID + Secret

### Step 3: Local Infrastructure

```bash
# Start PostgreSQL + MinIO
docker compose up postgres minio -d

# Apply migrations
DATABASE_URL_SYNC="postgresql+psycopg2://postgres:postgres@localhost:5433/run_api" \
  uv run alembic upgrade head

# Start API
uv run uvicorn main:app --reload
```

### Step 4: Web UI

```bash
cd web
npm install

# Install shadcn/ui (interactive)
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add button card dialog ...
```

Copy `web/.env.example` → `web/.env` and fill in your values.

```bash
npm run dev
```

### Step 5: Docker (Full Stack)

```bash
# Copy and fill env files
cp .env.example .env
# Edit .env with real ZITADEL values

docker compose up --build
```

API: http://localhost:8000
MinIO console: http://localhost:9001 (minioadmin / minioadmin)
PostgreSQL: localhost:5433

### Key Config Files to Create

| File | Purpose |
|------|---------|
| `pyproject.toml` | Python project definition, deps, tool config |
| `uv.lock` | Locked dependency tree (commit this) |
| `alembic.ini` | Alembic configuration (sync connection string) |
| `alembic/env.py` | Alembic runtime (import metadata for autogenerate) |
| `app/core/config.py` | pydantic-settings `Settings` class |
| `app/db/session.py` | SQLAlchemy engine + `get_db()` dependency |
| `app/db/rls.py` | `set_campaign_context()` helper |
| `.env` | Local secrets (never commit) |
| `.env.example` | Committed template with placeholder values |
| `docker-compose.yml` | Local dev services |
| `Dockerfile` | Multi-stage production build |
| `web/vite.config.ts` | Vite + TanStack Router + Tailwind plugins |
| `web/.env` | Frontend env vars (never commit with real values) |
| `web/.env.example` | Frontend template |

---

*Generated 2026-03-11 from the run-api codebase.*
