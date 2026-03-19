# Docker Compose Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bind mount volumes with Docker Compose `develop.watch` for cleaner, more declarative dev hot-reload with automatic rebuilds on dependency changes.

**Architecture:** Add a `develop.watch` section to the `api` service in `docker-compose.yml`, using `sync` for source files (uvicorn `--reload` handles restart), `sync+restart` for config/scripts, and `rebuild` for dependency file changes. Add a `dev` build target to the Dockerfile to skip the frontend stage during rebuilds, keeping dev iteration fast.

**Tech Stack:** Docker Compose watch, multi-stage Dockerfile, uvicorn `--reload`

---

## Context & Design Decisions

### Current State
- The `api` service uses **bind mount volumes** for hot-reload: `./app`, `./main.py`, `./alembic`, `./alembic.ini`, `./scripts` are mounted into the container.
- uvicorn runs with `--reload` via `scripts/dev-entrypoint.sh`, detecting Python file changes automatically.
- The frontend runs **outside Docker** via `npm run dev` with Vite HMR — this is unaffected by this change.
- The `Dockerfile` is multi-stage (frontend build → Python deps → runtime). It does **not** copy `scripts/` into the image since scripts are currently bind-mounted.

### What Changes
| Concern | Before (bind mounts) | After (watch) |
|---|---|---|
| Python source (`app/`, `main.py`) | Volume mount, instant | `sync` → uvicorn `--reload` |
| Alembic migrations (`alembic/`) | Volume mount | `sync` (no restart needed) |
| Config (`alembic.ini`) | Volume mount | `sync+restart` |
| Dev scripts (`scripts/`) | Volume mount | `sync+restart` |
| Dependencies (`pyproject.toml`, `uv.lock`) | Manual `docker compose build` | `rebuild` (automatic) |
| TLS certs (`certs/`) | Read-only volume | **Unchanged** (stays as volume) |

### Why a `dev` Dockerfile Target
The `rebuild` action runs `docker compose up --build` under the hood. The current Dockerfile includes a `frontend` stage (Node.js build) that's unnecessary for backend dev. A dedicated `dev` target skips the frontend build, making dependency-change rebuilds ~30s faster. BuildKit only builds stages reachable from the target, so the `frontend` stage is never touched.

### File Ownership (`--chown`)
Docker Compose watch `sync` writes files into the running container. The container runs as `USER app`, so all COPYed files in the `dev` stage must be owned by `app:app`. Without `--chown=app:app` on COPY instructions, files would be root-owned and sync would fail with permission errors.

---

## Task 1: Add `dev` Target to Dockerfile

**Files:**
- Modify: `Dockerfile:29-74`

The `dev` target goes after the `deps` stage and before the `frontend` stage. It copies Python deps, app code, scripts, and alembic — everything needed for backend development.

- [ ] **Step 1: Add the `dev` stage to the Dockerfile**

Insert the following stage between the existing `deps` stage (line 27) and the `frontend` stage comment (currently at line 9, but we'll reorder):

The new Dockerfile structure will be:
1. `deps` (Python dependencies — unchanged)
2. `dev` (new — backend dev image, no frontend)
3. `frontend` (Node.js build — unchanged)
4. `runtime` (production — unchanged)

Add this block after the `deps` stage (after line 27 `# Output: /build/.venv/`):

```dockerfile
# ---------------------------------------------------------------------------
# Stage: Development runtime (no frontend build, fast rebuilds)
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS dev

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash app \
    && chmod 755 /home/app

WORKDIR /home/app

COPY --chown=app:app --from=deps /build/.venv ./.venv

COPY --chown=app:app app/ ./app/
COPY --chown=app:app main.py ./
COPY --chown=app:app alembic/ ./alembic/
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app scripts/ ./scripts/

ENV PATH="/home/app/.venv/bin:$PATH"

USER app
EXPOSE 8000
CMD ["bash", "scripts/dev-entrypoint.sh"]
```

- [ ] **Step 2: Verify the production stages are unaffected**

Run: `docker compose build api 2>&1 | tail -5`

Expected: Build completes successfully (default target is still `runtime`, the last stage).

- [ ] **Step 3: Verify the dev target builds**

Run: `docker compose build --build-arg BUILDKIT_INLINE_CACHE=1 api 2>&1 | tail -5`

This uses the default target. To test the dev target specifically:

Run: `docker build --target dev -t run-api-dev . 2>&1 | tail -10`

Expected: Build completes, no frontend stage executed.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat(docker): add dev target stage for faster watch rebuilds"
```

---

## Task 2: Add `develop.watch` to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml:1-32`

This is the core change. We add the `develop.watch` section and remove the bind mount volumes that watch replaces. The `certs` volume stays.

- [ ] **Step 1: Update the `api` service build to target `dev` and remove `command`**

Change the build section to include `target: dev`, and **remove the `command` line** (line 10: `command: bash /home/app/scripts/dev-entrypoint.sh`). The `dev` Dockerfile target already sets `CMD ["bash", "scripts/dev-entrypoint.sh"]`, so the compose override is redundant.

Also remove the VITE build args — they're unused by the `dev` target (no frontend build):

```yaml
services:
  api:
    build:
      context: .
      target: dev
```

- [ ] **Step 2: Replace bind mount volumes with `develop.watch`**

Remove the existing `volumes` block (lines 20-26) and replace with a single certs mount plus the `develop` section:

```yaml
    volumes:
      - ./certs:/home/app/certs:ro
    develop:
      watch:
        # Python source files — uvicorn --reload detects changes automatically
        - action: sync
          path: ./app
          target: /home/app/app
          ignore:
            - __pycache__/
            - "*.pyc"
        # Main entry point
        - action: sync
          path: ./main.py
          target: /home/app/main.py
        # Alembic migration files
        - action: sync
          path: ./alembic
          target: /home/app/alembic
          ignore:
            - __pycache__/
        # Alembic config — needs restart to pick up changes
        - action: sync+restart
          path: ./alembic.ini
          target: /home/app/alembic.ini
        # Dev scripts — needs restart since entrypoint may change
        - action: sync+restart
          path: ./scripts
          target: /home/app/scripts
          ignore:
            - __pycache__/
            - "*.pyc"
        # Dependency changes — full image rebuild
        - action: rebuild
          path: ./pyproject.toml
        - action: rebuild
          path: ./uv.lock
```

- [ ] **Step 3: Validate the compose file syntax**

Run: `docker compose config --quiet`

Expected: No errors (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add compose watch for dev hot-reload

Replace bind mount volumes with develop.watch configuration:
- sync: app/, main.py, alembic/ (uvicorn --reload handles restart)
- sync+restart: alembic.ini, scripts/ (config changes need restart)
- rebuild: pyproject.toml, uv.lock (dependency changes)
- certs volume kept as read-only mount for Tailscale TLS"
```

---

## Task 3: Smoke Test

- [ ] **Step 1: Start services with watch mode**

Run: `docker compose up --watch`

Expected: All services start, watch mode is active. Look for output like:
```
 ✔ Watch enabled
```

- [ ] **Step 2: Test sync — edit a Python file**

Make a trivial change to `app/core/config.py` (e.g., add a comment). Watch the terminal.

Expected: File syncs to container, uvicorn detects change and reloads:
```
WARNING:  WatchFiles detected changes in 'app/core/config.py'. Reloading...
```

- [ ] **Step 3: Test sync+restart — edit alembic.ini**

Add a blank line to `alembic.ini`.

Expected: File syncs, container restarts (migrations re-run, uvicorn starts fresh).

- [ ] **Step 4: Test rebuild — edit pyproject.toml**

Add a comment to `pyproject.toml`.

Expected: Image rebuilds (dev target only, no frontend), container replaced.

- [ ] **Step 5: Revert test changes**

```bash
git checkout -- app/core/config.py alembic.ini pyproject.toml
```

- [ ] **Step 6: Commit (if any adjustments were needed)**

Only if smoke testing revealed issues that required config tweaks.

---

## Summary of File Changes

| File | Change | Lines Affected |
|---|---|---|
| `Dockerfile` | Add `dev` stage after `deps` | +22 lines (new stage) |
| `docker-compose.yml` | Add `target: dev`, replace volumes with `develop.watch` | ~25 lines modified |

**Total: ~2 files changed, ~40 lines added/modified.**

## Usage After Implementation

```bash
# Start with watch mode (recommended for development)
docker compose up --watch

# Or run watch separately from logs
docker compose up -d && docker compose watch
```
