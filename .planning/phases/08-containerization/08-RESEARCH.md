# Phase 8: Containerization - Research

**Researched:** 2026-03-10
**Domain:** Docker multi-stage builds, FastAPI static file serving, health check patterns
**Confidence:** HIGH

## Summary

Phase 8 produces a single production-ready Docker image combining the Python/FastAPI API with the Vite/React web frontend. The approach is well-established: multi-stage Dockerfile with a Node build stage for the frontend, a `uv` stage for Python dependency installation, and a slim Python runtime stage. The key integration point is serving the built frontend static files from FastAPI itself using `StaticFiles` mount with SPA fallback.

The existing codebase already has the health endpoint (`GET /health`), pydantic-settings configuration, async DB session factory, and alembic migrations -- all of which need minor modifications or extensions for containerization. The frontend build (`tsc -b && vite build`) produces output to `web/dist/` by default. No Dockerfile or .dockerignore exists yet.

**Primary recommendation:** Three-stage Dockerfile (node build, uv install, python runtime) with FastAPI `StaticFiles` serving the built frontend and SPA catch-all fallback route.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Health check split into `GET /health/live` (process alive) and `GET /health/ready` (DB connectivity check)
- Readiness checks database only -- ZITADEL and S3 are external services
- Health responses include build info: git SHA and build timestamp
- Git SHA injected via Docker `--build-arg` then `ENV` variable, read at runtime
- Frontend served at root `/`, API at `/api/v1/`, health at `/health/*`
- SPA fallback: non-API/non-static paths return `index.html`
- Production runtime: `python:3.13-slim`
- Frontend build stage: `node:22-slim`
- `uv` used for dependency installation in build stage only -- not in final image
- Non-root `app` user in Dockerfile
- Exposed port: 8000
- Entrypoint runs uvicorn only -- migrations handled separately
- Default 1 uvicorn worker, configurable via `WORKERS` env var
- Alembic files included in image for K8s init container pattern
- Support both `.env` file mount and individual env vars

### Claude's Discretion
- Built frontend output path inside the container
- Multi-stage Dockerfile structure and layer ordering
- Exact .dockerignore patterns beyond required exclusions
- uvicorn CMD flags (log level, host binding, etc.)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTR-01 | Multi-stage Dockerfile builds web frontend and Python API into single production image | Three-stage build pattern: node (frontend), uv (deps), python-slim (runtime). Layer ordering optimized for cache. |
| CTR-02 | Health check endpoint (`GET /health`) available for container and K8s probes | Split into `/health/live` and `/health/ready`. Live = process check, Ready = DB connectivity. Build info in response. |
| CTR-03 | `.dockerignore` excludes tests, `.planning`, `.git`, `node_modules`, and dev artifacts | Standard .dockerignore patterns documented below. |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Docker | multi-stage | Container build | Industry standard, already in project |
| python:3.13-slim | 3.13 | Runtime base image | User decision -- slim for C extension compat |
| node:22-slim | 22 LTS | Frontend build stage | User decision -- matches Vite/TS requirements |
| uv | latest | Python dep install in build stage | Project standard (MEMORY.md mandate) |
| FastAPI StaticFiles | via starlette | Serve built frontend | Built into FastAPI, no extra dependency |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| SQLAlchemy `text("SELECT 1")` | DB readiness check | In `/health/ready` endpoint |
| `os.environ` / pydantic-settings | Build info + config | Reading `GIT_SHA`, `BUILD_TIMESTAMP` env vars |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI StaticFiles | nginx sidecar | Adds complexity, separate container; overkill for this scale |
| `uv` in final image | pip in final image | User mandated `uv` for builds; correctly excluded from runtime |

**Installation:**
No new Python dependencies needed. `starlette.staticfiles.StaticFiles` ships with FastAPI.
No new Node dependencies needed. `vite build` already in package.json scripts.

## Architecture Patterns

### Recommended Dockerfile Structure (3 stages)
```
# Stage 1: Frontend build
FROM node:22-slim AS frontend
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
# Output: /build/dist/

# Stage 2: Python dependency install
FROM python:3.13-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Stage 3: Runtime
FROM python:3.13-slim AS runtime
# Create non-root user
RUN useradd --create-home --shell /bin/bash app
WORKDIR /home/app
# Copy Python venv from deps stage
COPY --from=deps /build/.venv ./.venv
# Copy application code
COPY app/ ./app/
COPY main.py ./
COPY alembic/ ./alembic/
COPY alembic.ini ./
# Copy built frontend
COPY --from=frontend /build/dist/ ./static/
# Build args -> env vars
ARG GIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown
ENV GIT_SHA=$GIT_SHA BUILD_TIMESTAMP=$BUILD_TIMESTAMP
ENV PATH="/home/app/.venv/bin:$PATH"
ENV WORKERS=1
USER app
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers $WORKERS"]
```

### Key Layer Ordering Rationale
1. **package.json before source** -- npm ci cached when deps unchanged
2. **pyproject.toml + uv.lock before app code** -- Python deps cached when unchanged
3. **App code last** -- most frequently changing layer
4. **uv binary via COPY --from** -- official multi-stage pattern from astral-sh, avoids curl/install steps

### Pattern: SPA Fallback in FastAPI

FastAPI does not natively support SPA fallback (returning `index.html` for unknown routes). Two approaches:

**Approach A: Custom catch-all route (Recommended)**
```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

def create_app() -> FastAPI:
    app = FastAPI(...)

    # Mount API and health routers first (they take priority)
    app.include_router(health_router)
    app.include_router(v1_router)

    # Mount static files for assets (JS, CSS, images)
    if STATIC_DIR.exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

        # Catch-all for SPA: any non-API, non-asset route returns index.html
        @app.get("/{path:path}")
        async def spa_fallback(path: str):
            return FileResponse(STATIC_DIR / "index.html")

    return app
```

**Approach B: Custom middleware**
More complex, not needed for this use case.

**Why Approach A:** Routers registered first take priority. The catch-all `{path:path}` only matches when no API route or static mount matches. Simple and explicit.

**Important detail:** Vite build output structure:
```
dist/
  index.html
  assets/
    index-[hash].js
    index-[hash].css
    ...
```

The `/assets` mount must serve the hashed JS/CSS files. The catch-all handles all other paths for client-side routing.

### Pattern: Health Check with Build Info

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import os

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/live")
async def liveness():
    """Process alive check -- always returns ok."""
    return {
        "status": "ok",
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
        "build_timestamp": os.environ.get("BUILD_TIMESTAMP", "unknown"),
    }

@router.get("/ready")
async def readiness(db: AsyncSession = Depends(get_db)):
    """DB connectivity check."""
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "git_sha": os.environ.get("GIT_SHA", "unknown"),
            "build_timestamp": os.environ.get("BUILD_TIMESTAMP", "unknown"),
        }
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected"},
        )
```

**Critical note on readiness:** The existing lifespan handler fails hard if ZITADEL credentials are missing/invalid or storage is unreachable. The readiness probe should NOT re-check these -- the app won't even start if they fail. This matches the user decision: "Readiness checks database only."

### Pattern: Non-root User
```dockerfile
RUN useradd --create-home --shell /bin/bash app
# ... copy files ...
USER app
```
Files copied before `USER app` are owned by root but readable. The app user only needs read access to code and write access to nothing (stateless container).

### Anti-Patterns to Avoid
- **Installing uv in the runtime image:** Wastes ~30MB. Use COPY --from pattern to get uv binary only in build stage.
- **Running as root:** Security risk. Always use non-root user for runtime.
- **Using `npm install` instead of `npm ci`:** `npm ci` respects lockfile exactly, `npm install` may modify it.
- **Copying entire repo into build stages:** Use specific COPY commands to leverage layer cache.
- **Health endpoint that depends on external services:** Makes the container unready when an external service is down, causing cascading failures.
- **Mounting StaticFiles at `/` root:** This would conflict with API routes. Mount at `/assets` and use a catch-all route instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Static file serving | Custom file-reading middleware | `StaticFiles` from starlette | Handles content types, caching headers, range requests |
| Python dep install in Docker | pip + requirements.txt export | `uv sync --frozen --no-dev` | Direct lockfile consumption, faster, reproduces exact deps |
| Build info injection | File-based version stamps | Docker `--build-arg` to `ENV` | Standard Docker pattern, works with any CI system |
| SPA routing fallback | Complex middleware | Simple `{path:path}` catch-all route | FastAPI routes have priority order; simple and correct |

## Common Pitfalls

### Pitfall 1: Stale Settings Singleton
**What goes wrong:** `app/core/config.py` creates `settings = Settings()` at module import time. Environment variables set in Docker ENV are available at import, so this works. BUT if settings are imported before env vars are set (e.g., in a test), defaults are locked in.
**Why it happens:** Python module-level singletons evaluate once.
**How to avoid:** This is fine for Docker (env vars are set before process starts). No change needed, but be aware during testing.

### Pitfall 2: Lifespan Blocks Health Checks
**What goes wrong:** The current `lifespan()` handler validates ZITADEL credentials and storage on startup. If these fail, the app never starts, so health endpoints are unreachable.
**Why it happens:** FastAPI lifespan runs before any request handling.
**How to avoid:** This is actually desirable behavior -- fail fast. The liveness probe will fail, K8s will restart the pod. But for local dev without ZITADEL, this could be problematic. Consider making ZITADEL validation conditional on a config flag (Phase 9 concern).

### Pitfall 3: SPA Catch-All Swallows 404s for API Routes
**What goes wrong:** A typo in API path (e.g., `/api/v1/campaings`) returns `index.html` instead of 404.
**Why it happens:** The catch-all `{path:path}` matches everything not already routed.
**How to avoid:** The catch-all should NOT match paths starting with `/api/` or `/health/`. Add a guard:
```python
@app.get("/{path:path}")
async def spa_fallback(path: str):
    if path.startswith("api/") or path.startswith("health/"):
        raise HTTPException(404, "Not found")
    return FileResponse(STATIC_DIR / "index.html")
```

### Pitfall 4: Docker Build Context Too Large
**What goes wrong:** Without `.dockerignore`, Docker sends the entire repo (including `node_modules`, `.git`, test data) as build context. Slow builds.
**How to avoid:** Create `.dockerignore` before first build.

### Pitfall 5: uv.lock Compatibility
**What goes wrong:** `uv sync` needs the `pyproject.toml` and `uv.lock` to be in sync.
**How to avoid:** Always copy both files together. Use `--frozen` flag to fail if they're out of sync rather than silently updating.

### Pitfall 6: asyncpg Requires libpq
**What goes wrong:** `python:3.13-slim` may be missing shared libraries needed by `asyncpg` or `psycopg2-binary`.
**Why it happens:** Slim images strip many system packages.
**How to avoid:** `asyncpg` includes its own libpq. `psycopg2-binary` bundles its own. No system packages needed for these two. But `shapely` and `geoalchemy2` may need `libgeos`. Test the build.
**Warning signs:** `ImportError` mentioning `.so` files when the container starts.

### Pitfall 7: Alembic sqlalchemy.url Hardcoded to localhost (CONFIRMED)
**What goes wrong:** `alembic.ini` has `sqlalchemy.url = postgresql+psycopg2://postgres:postgres@localhost:5432/run_api`. The `alembic/env.py` reads this directly from `config.get_main_option("sqlalchemy.url")` for offline mode and `config.get_section()` for online mode. Neither path checks environment variables. When running `alembic upgrade head` in a container (K8s init container), it will try to connect to localhost instead of the actual database host.
**How to avoid:** Modify `alembic/env.py` to override `sqlalchemy.url` from `DATABASE_URL_SYNC` environment variable when present. This is a required change for this phase since alembic files are included in the image for K8s init container use.
```python
import os
# Override alembic.ini URL with env var if set
db_url = os.environ.get("DATABASE_URL_SYNC")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)
```

## Code Examples

### .dockerignore (CTR-03)
```
# Version control
.git
.gitignore

# Planning and docs
.planning
*.md
LICENSE

# Tests
tests/

# Dev artifacts
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
.mypy_cache/

# Frontend dev artifacts
web/node_modules/
web/.vite/

# IDE
.vscode/
.idea/

# Environment files (secrets)
.env
.env.*

# Docker
Dockerfile
docker-compose.yml
.dockerignore
```

### Vite Build Output Path Verification
Default Vite `build.outDir` is `dist` (relative to project root, which is `web/`). Output will be at `web/dist/`. In the Dockerfile frontend stage, `WORKDIR /build` with `COPY web/ ./` means output is at `/build/dist/`.

### uvicorn CMD Pattern
```dockerfile
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-1} --log-level info --access-log"]
```
Using `sh -c` allows env var substitution in CMD. The `--host 0.0.0.0` is required for container networking (default `127.0.0.1` won't accept external connections).

### uv in Docker (Official Pattern)
```dockerfile
# Copy uv binary from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install deps without dev group, using lockfile exactly
RUN uv sync --frozen --no-dev --no-install-project
```
The `--no-install-project` flag skips installing the project itself (not needed since we copy source separately). `--frozen` fails if lockfile is stale.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pip install -r requirements.txt` | `uv sync --frozen` | 2024 | 10-100x faster installs, exact lockfile |
| `COPY --from=python:3.x /usr/local/bin/uv` | `COPY --from=ghcr.io/astral-sh/uv:latest /uv` | 2024 | Official uv Docker image for multi-stage |
| requirements.txt export | Direct uv.lock consumption | 2024 | No intermediate file, exact reproducibility |
| Single-stage Dockerfile | Multi-stage builds | 2017+ | Smaller images, build deps excluded from runtime |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest with pytest-asyncio |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/unit/ -q` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTR-01 | Docker build produces working image | smoke | `docker build -t run-api:test . && docker run --rm run-api:test python -c "from app.main import create_app; print('ok')"` | No -- Wave 0 |
| CTR-02a | `/health/live` returns ok | unit | `uv run pytest tests/unit/test_health.py -x -q` | No -- Wave 0 |
| CTR-02b | `/health/ready` returns ok with DB | integration | Manual -- requires running DB | N/A -- manual-only (needs live DB) |
| CTR-02c | Health responses include build info | unit | `uv run pytest tests/unit/test_health.py -x -q` | No -- Wave 0 |
| CTR-03 | Image excludes dev artifacts | smoke | `docker run --rm run-api:test sh -c 'test ! -d /home/app/tests && test ! -d /home/app/.planning && test ! -d /home/app/.git'` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/unit/ -q` + Docker build smoke test
- **Phase gate:** Full suite green + Docker build + container run verification

### Wave 0 Gaps
- [ ] `tests/unit/test_health.py` -- unit tests for `/health/live` and `/health/ready` endpoints with mocked DB
- [ ] Docker build smoke test script (can be manual verification steps in plan)

## Open Questions

1. **Shapely/GeoAlchemy2 system dependencies in slim image**
   - What we know: `shapely` needs `libgeos`, `geoalchemy2` needs PostGIS-aware libraries
   - What's unclear: Whether `python:3.13-slim` includes these or if `apt-get install libgeos-dev` is needed in runtime stage
   - Recommendation: Test the build; if import fails, add `RUN apt-get update && apt-get install -y --no-install-recommends libgeos-dev && rm -rf /var/lib/apt/lists/*` to runtime stage

2. **Frontend static file path at runtime**
   - What we know: Files will be at `/home/app/static/` in container
   - What's unclear: Whether `app/main.py` should detect static dir existence to gracefully handle dev mode (no built frontend)
   - Recommendation: Conditionally mount StaticFiles only if the directory exists (`if STATIC_DIR.exists()`)

## Sources

### Primary (HIGH confidence)
- Project codebase inspection: `pyproject.toml`, `app/main.py`, `app/api/health.py`, `app/core/config.py`, `app/db/session.py`, `alembic/env.py`, `web/package.json`, `web/vite.config.ts`
- Docker multi-stage build documentation -- well-established pattern
- FastAPI StaticFiles -- built into starlette, ships with FastAPI
- uv Docker patterns -- official astral-sh/uv Docker image on GHCR

### Secondary (MEDIUM confidence)
- `shapely` system dependency requirements -- may vary by version/platform
- Vite default `build.outDir` = `dist` -- standard default, verified by absence of override in `vite.config.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools are project-established or user-mandated
- Architecture: HIGH -- multi-stage Docker + FastAPI static serving is well-documented
- Pitfalls: HIGH -- based on direct codebase inspection (lifespan handler, alembic.ini, alembic/env.py confirmed)

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable technologies, no fast-moving APIs)
