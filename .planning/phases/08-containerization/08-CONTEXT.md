# Phase 8: Containerization - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-ready container image that packages the Python API and Vite/React web frontend into a single deployable artifact. Includes multi-stage Dockerfile, health check endpoints, and .dockerignore. Docker Compose integration and CI/CD are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Health check endpoints
- Split into two endpoints: `GET /health/live` (process alive) and `GET /health/ready` (DB connectivity check)
- Readiness checks database only — ZITADEL and S3 are external services that shouldn't make the pod unready
- Health responses include build info: git SHA and build timestamp
- Git SHA injected via Docker `--build-arg` → `ENV` variable, read by the app at runtime

### Frontend serving
- Built frontend served at root path `/` — API routes at `/api/v1/` and health at `/health/*`
- SPA fallback: any path not matching an API route or static file returns `index.html` (TanStack Router handles client-side routing)
- Vite dev proxy configuration deferred to Phase 9 (Local Dev Environment)

### Base images
- Production runtime: `python:3.13-slim` (Debian slim for C extension compatibility with asyncpg, psycopg2, shapely, geoalchemy2)
- Frontend build stage: `node:22-slim` (LTS, matches modern Vite/TypeScript)
- `uv` used for dependency installation in build stage only — not included in final runtime image

### Container configuration
- Environment variables: support both `.env` file mount (Phase 9 local dev) and individual env vars (Phase 11 K8s) — pydantic-settings handles both natively
- Non-root user: create `app` user in Dockerfile, run uvicorn as that user
- Exposed port: 8000 (standard uvicorn default, matches K8S-02 requirement)
- Entrypoint runs uvicorn only — Alembic migrations handled separately (K8s init container in Phase 11, docker compose command in Phase 9)
- Default 1 uvicorn worker, configurable via `WORKERS` env var (K8s scales via replicas)
- Alembic migration files (`alembic/` + `alembic.ini`) included in image so same image can run migrations as K8s init container with different CMD

### Claude's Discretion
- Built frontend output path inside the container
- Multi-stage Dockerfile structure and layer ordering
- Exact .dockerignore patterns beyond the required exclusions (tests, .planning, .git, node_modules, dev artifacts)
- uvicorn CMD flags (log level, host binding, etc.)

</decisions>

<specifics>
## Specific Ideas

- Same image used for both serving (default CMD) and migrations (override CMD with `alembic upgrade head`) — one artifact to manage
- K8s deployment pattern: init container runs migrations from same image, main container serves API
- Build info in health response helps verify which version is deployed, especially with SHA-tagged images from Phase 10

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/health.py`: Health endpoint exists (`GET /health` returns `{"status": "ok"}`). Needs enhancement to split into live/ready with DB check and build info.
- `app/core/config.py`: pydantic-settings `Settings` class loads from `.env` — already supports both file and env var configuration
- `app/db/session.py`: Async engine and session factory — readiness check can use this to verify DB connectivity

### Established Patterns
- Entry point: `main.py` at project root imports `create_app()` from `app/main.py`, runs via uvicorn
- Dependencies managed by `uv` with `uv.lock` lockfile
- Frontend: `web/` directory, built with `tsc -b && vite build`, output likely goes to `web/dist/`
- All env vars documented in `.env.example`

### Integration Points
- Dockerfile consumes: `pyproject.toml`, `uv.lock` (Python deps), `web/package.json`, `web/package-lock.json` (Node deps)
- Phase 9 will add API service to `docker-compose.yml` using this Dockerfile
- Phase 10 will build this Dockerfile in GitHub Actions
- Phase 11 K8s init container will use same image with `alembic upgrade head` CMD

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-containerization*
*Context gathered: 2026-03-10*
