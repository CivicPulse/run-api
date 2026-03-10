---
phase: 08-containerization
plan: 02
subsystem: infra
tags: [docker, multi-stage, spa, static-files, uvicorn, vite, react]

# Dependency graph
requires:
  - phase: 08-containerization-01
    provides: health endpoints, .dockerignore, Alembic container support
provides:
  - production multi-stage Dockerfile (node + uv + python-slim)
  - SPA static file serving with API path guard in app/main.py
  - single-port container serving both API and web frontend
affects: [09-local-dev, 10-cicd, 11-kubernetes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-stage Docker build: node frontend, uv deps, python-slim runtime"
    - "Conditional SPA serving: mount static files only when /static/ dir exists"
    - "API path guard: SPA catch-all excludes api/ and health/ prefixes"
    - "Non-root container user: app user with /home/app workdir"

key-files:
  created:
    - Dockerfile
  modified:
    - app/main.py
    - .gitignore
    - web/src/lib/utils.ts

key-decisions:
  - "Three-stage build keeps image under 500MB (485MB) by discarding node_modules and build tools"
  - "SPA fallback guarded with if STATIC_DIR.exists() so dev mode works without built frontend"
  - "Use python -m uvicorn instead of bare uvicorn to avoid venv shebang path issues in container"
  - "Alembic files included in image for K8s init container migration pattern"

patterns-established:
  - "Dockerfile pattern: node build -> uv deps -> python-slim runtime"
  - "SPA serving pattern: mount /assets, catch-all returns index.html, guard API paths"
  - "Container CMD pattern: python -m uvicorn with configurable WORKERS env var"

requirements-completed: [CTR-01]

# Metrics
duration: 15min
completed: 2026-03-10
---

# Phase 8 Plan 2: Dockerfile & SPA Serving Summary

**Three-stage Docker build (node/uv/python-slim) producing 485MB image with conditional SPA static file serving and API path guard**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-10T02:22:00Z
- **Completed:** 2026-03-10T02:37:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Multi-stage Dockerfile producing 485MB production image (under 500MB target)
- Frontend built by node stage, served from /home/app/static/ in runtime stage
- SPA fallback in app/main.py with conditional guard for dev mode compatibility
- Container runs as non-root 'app' user with Alembic files for K8s init container pattern
- GIT_SHA and BUILD_TIMESTAMP injectable via --build-arg

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-stage Dockerfile and SPA serving** - `bbdc614` (feat)
2. **Task 2: Verify Docker image build** - Human checkpoint, approved by user

Additional fix commits during verification:
- `6fb6f69` - fix: add missing shadcn/ui utils.ts and unignore web/src/lib
- `3667871` - fix: use python -m uvicorn to avoid venv shebang path issue

## Files Created/Modified
- `Dockerfile` - Three-stage production build (node frontend, uv deps, python-slim runtime)
- `app/main.py` - Conditional SPA static file serving with /assets mount and catch-all fallback
- `.gitignore` - Unignored web/src/lib/ so shadcn/ui utils.ts is tracked
- `web/src/lib/utils.ts` - Added missing shadcn/ui utility file needed for frontend build

## Decisions Made
- Three-stage build to minimize final image size (485MB vs ~1GB+ single-stage)
- SPA fallback uses `if STATIC_DIR.exists()` guard so app works in dev without built frontend
- Changed CMD from bare `uvicorn` to `python -m uvicorn` to avoid venv shebang path issues
- Included libgeos-dev in runtime stage for shapely geospatial support

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing shadcn/ui utils.ts broke frontend build**
- **Found during:** Task 2 verification (Docker build)
- **Issue:** web/src/lib/utils.ts was gitignored, causing npm build failure in Docker context
- **Fix:** Created web/src/lib/utils.ts and updated .gitignore to unignore web/src/lib/
- **Files modified:** web/src/lib/utils.ts, .gitignore
- **Verification:** Docker build completed successfully
- **Committed in:** `6fb6f69`

**2. [Rule 1 - Bug] Uvicorn shebang path mismatch in container**
- **Found during:** Task 2 verification (container startup)
- **Issue:** Bare `uvicorn` command used venv shebang pointing to /build/.venv (deps stage path), not /home/app/.venv (runtime path)
- **Fix:** Changed CMD to use `python -m uvicorn` which avoids shebang resolution entirely
- **Files modified:** Dockerfile
- **Verification:** Container starts uvicorn successfully
- **Committed in:** `3667871`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for a working Docker image. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Production Docker image ready for docker-compose integration (Phase 9)
- Image tagged and publishable to GHCR (Phase 10)
- Alembic files in image, ready for K8s init container migration pattern (Phase 11)
- Phase 8 Containerization fully complete (2/2 plans)

## Self-Check: PASSED

All 4 files found. All 3 commits verified.

---
*Phase: 08-containerization*
*Completed: 2026-03-10*
