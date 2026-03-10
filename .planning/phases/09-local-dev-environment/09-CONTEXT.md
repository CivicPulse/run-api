# Phase 9: Local Dev Environment - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Docker Compose full-stack local dev environment. A developer can clone the repo and have API, PostgreSQL+PostGIS, and MinIO running with one command. Includes automatic migrations, hot-reload for Python code, Vite dev server proxy configuration, and a seed data script with Macon-Bibb County GA representative data. CI/CD and Kubernetes deployment are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Migration strategy
- Entrypoint shell script runs `alembic upgrade head` before starting uvicorn — dev-only, not baked into the production Dockerfile CMD
- Production Dockerfile CMD stays as-is (uvicorn only) — K8s init container handles prod migrations per Phase 8/11 decisions
- API container uses `depends_on: postgres: condition: service_healthy` to wait for PostgreSQL before running migrations (existing healthcheck in compose)
- Entrypoint also creates the MinIO S3 bucket if it doesn't exist (small Python/CLI call) — keeps the "one command" promise

### Frontend dev workflow
- Vite dev server runs locally (outside Docker) with proxy in `vite.config.ts` pointing `/api` and `/health` to `localhost:8000`
- API container exposes port 8000 to host — accessible to Vite proxy, curl, Postman, etc.
- CORS config already correct in `.env.example` (`http://localhost:5173`) — no changes needed, devs copy to `.env`
- Developer workflow: `docker compose up` (API + DB + MinIO), then `cd web && npm run dev` (Vite on :5173)

### Seed data design
- Minimal demo set: 1 campaign, ~50 voters, 3 turfs, 5 volunteers, 2 shifts, 1 survey, 1 phone bank session
- Location data representative of Macon-Bibb County, GA (primary dev and initial user base area)
- Fabricated voter names/demographics but geographically accurate lat/long coordinates within Macon-Bibb County
- Turf polygons cover real Macon-Bibb neighborhoods (e.g., Ingleside, Vineville, Pleasant Hill)
- Includes some completed activity: door-knock results, call outcomes, survey responses — so dashboards display data
- Direct DB inserts via SQLAlchemy — no ZITADEL interaction, no auth dependency during seeding
- Script lives at `scripts/seed.py`, invoked via `docker compose exec api python scripts/seed.py`
- Idempotent: checks if seed data exists, creates only if missing, safe to re-run

### Compose architecture
- Build from existing production Dockerfile, override CMD in compose with dev entrypoint (migrations + bucket init + uvicorn --reload)
- Volume mounts for hot-reload: `./app`, `./main.py`, `./alembic`, `./scripts` mounted into container
- Environment variables loaded via `env_file: .env` — dev copies `.env.example` to `.env` and fills in ZITADEL credentials
- MinIO keeps both ports: 9000 (S3 API) and 9001 (web console) for debugging file uploads
- API container runs as non-root `app` user (consistent with production Dockerfile)

### Claude's Discretion
- Exact entrypoint script implementation details
- MinIO bucket creation approach (Python boto3 vs mc CLI)
- Volume mount ownership/permission handling for non-root user
- Exact Macon-Bibb coordinate ranges and neighborhood polygon shapes
- Seed script internal structure and data generation approach

</decisions>

<specifics>
## Specific Ideas

- Macon-Bibb County, GA is the geographic anchor for all seed data — this is where the primary developer and initial user base are located
- Seed turf polygons should cover recognizable Macon-Bibb neighborhoods so the data feels real during demos
- "One command" philosophy: `docker compose up` should get everything running; seed script is a separate explicit step

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml`: Already has PostgreSQL+PostGIS (17-3.5) and MinIO services with healthchecks and named volumes — just needs API service added
- `Dockerfile`: Production multi-stage build (Phase 8) — compose builds from this and overrides CMD for dev
- `.env.example`: Documents all required env vars including DB URLs, ZITADEL config, and CORS origins
- `app/core/config.py`: S3 config already defaults to MinIO (`localhost:9000`, `minioadmin/minioadmin`, bucket `voter-imports`)
- `alembic/`: Migration files ready to run

### Established Patterns
- pydantic-settings loads from `.env` file — `env_file: .env` in compose is the natural fit
- Entry point: `main.py` at project root imports `create_app()` from `app/main.py`
- uv for Python package management, npm for frontend
- Uvicorn with `python -m uvicorn` invocation (avoids venv shebang issues per Phase 8 decision)

### Integration Points
- Compose API service builds from Phase 8 Dockerfile
- Vite proxy config in `web/vite.config.ts` needs `/api` and `/health` proxy rules
- Seed script uses SQLAlchemy async session from `app/db/session.py`
- Phase 10 CI/CD will use same Dockerfile for GHCR image builds
- Phase 11 K8s manifests reference the same container image

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-local-dev-environment*
*Context gathered: 2026-03-10*
